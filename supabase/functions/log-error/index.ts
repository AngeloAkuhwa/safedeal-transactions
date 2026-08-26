import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Error ingest. The one endpoint in this project that accepts writes from
 * anyone, signed in or not, which is forced: an error that happens before or
 * during sign-in is exactly the error worth having, and the auth layer has
 * degraded twice this week.
 *
 * That makes abuse the design problem rather than an afterthought, so the
 * limits below are the feature, not boilerplate:
 *
 *   - the body is read as text and measured before it is parsed, because
 *     JSON.parse on an unbounded string is the denial of service;
 *   - every string field is truncated, so a 10MB stack becomes 8KB;
 *   - context is re-serialised after truncation, so a deep object cannot
 *     smuggle size past the field caps;
 *   - a fingerprint seen from the same session in the last minute is counted
 *     rather than re-inserted, because the realistic flood is a React render
 *     loop emitting thousands of identical errors per second;
 *   - user_id is taken from the caller's token and never from the body, so a
 *     forged report cannot be attributed to another account.
 *
 * What it deliberately does NOT do: reject unauthenticated callers, or rate
 * limit per IP. The first would blind the sign-in path. The second needs a
 * counter store this project does not have, and the dedupe below covers the
 * realistic case; a determined attacker can still fill the table, which is
 * recorded in the plan rather than pretended away.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Hard ceilings. A report past these is truncated, never refused: a
 *  truncated stack still names the defect, and refusing loses it entirely. */
const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGE = 2_000;
const MAX_STACK = 8_000;
const MAX_CONTEXT_BYTES = 8 * 1024;
const MAX_SHORT = 300;

/** A fingerprint repeating from one session inside this window is counted, not stored. */
const DEDUPE_WINDOW_SECONDS = 60;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clamp(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}\n[truncated]` : trimmed;
}

function clampContext(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  let serialised: string;
  try {
    serialised = JSON.stringify(value);
  } catch {
    // Circular or otherwise unserialisable. Say so rather than dropping it
    // silently: "context was unusable" is itself worth knowing.
    return { _context_error: "not serialisable" };
  }
  if (serialised.length <= MAX_CONTEXT_BYTES) return value as Record<string, unknown>;
  return {
    _truncated: true,
    _original_bytes: serialised.length,
    preview: serialised.slice(0, 1_000),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : null);

const SEVERITIES = new Set(["warning", "error", "fatal"]);
const SOURCES = new Set(["client", "edge"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // Measure before parsing. Content-Length can lie or be absent, so the
    // text read is the real gate and the header is only a fast path.
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Report too large" }, 413);
    }
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Report too large" }, 413);
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: "Malformed report" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "Malformed report" }, 400);
    }

    const message = clamp(body.message, MAX_MESSAGE);
    const kind = clamp(body.kind, MAX_SHORT);
    const fingerprint = clamp(body.fingerprint, MAX_SHORT);
    if (!message || !kind || !fingerprint) {
      return jsonResponse({ error: "message, kind and fingerprint are required" }, 400);
    }

    const source = SOURCES.has(String(body.source)) ? String(body.source) : "client";
    const severity = SEVERITIES.has(String(body.severity)) ? String(body.severity) : "error";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Identity comes from the token or not at all. An anonymous report is
    // still worth storing; a report claiming to be someone is not trusted.
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const { data } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = data?.user?.id ?? null;
    }

    const sessionId = clamp(body.session_id, MAX_SHORT);

    // Flood control for the realistic case: one defect repeating inside one
    // session. The client dedupes too; this is the backstop for when the
    // client is the thing that is broken.
    if (sessionId) {
      const since = new Date(Date.now() - DEDUPE_WINDOW_SECONDS * 1000).toISOString();
      const { count } = await admin
        .from("error_events")
        .select("id", { count: "exact", head: true })
        .eq("fingerprint", fingerprint)
        .eq("session_id", sessionId)
        .gte("occurred_at", since);
      if ((count ?? 0) > 0) {
        return jsonResponse({ ok: true, deduped: true });
      }
    }

    const occurredAt =
      typeof body.occurred_at === "string" && !Number.isNaN(Date.parse(body.occurred_at))
        ? body.occurred_at
        : new Date().toISOString();

    const { error } = await admin.from("error_events").insert({
      occurred_at: occurredAt,
      correlation_id: uuidOrNull(body.correlation_id),
      source,
      severity,
      kind,
      message,
      stack: clamp(body.stack, MAX_STACK),
      route: clamp(body.route, MAX_SHORT),
      function_name: clamp(body.function_name, MAX_SHORT),
      http_status:
        Number.isInteger(body.http_status) && (body.http_status as number) >= 100 &&
        (body.http_status as number) <= 599
          ? body.http_status
          : null,
      user_id: userId,
      session_id: sessionId,
      release: clamp(body.release, MAX_SHORT),
      // Read from the header rather than the body: the body is the reporter's
      // claim, the header is what actually connected.
      user_agent: clamp(req.headers.get("user-agent"), MAX_SHORT),
      viewport: clamp(body.viewport, 32),
      context: clampContext(body.context),
      fingerprint,
    });

    if (error) {
      // Never throw from the error reporter: a failing reporter that takes the
      // page down with it is worse than the error it was reporting.
      console.error("log-error insert failed:", error.message);
      return jsonResponse({ ok: false }, 200);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("log-error unexpected:", err);
    return jsonResponse({ ok: false }, 200);
  }
});
