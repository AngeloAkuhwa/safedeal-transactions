import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Edge-side error logging: the server half of the pipeline.
 *
 * This module already existed and wrote to `edge_function_errors`. That table
 * had been in place since April and held **zero rows**, because only two of
 * this project's 124 functions ever called it and nothing read it back. So the
 * store moves to `error_events`, which the admin error log reads, and this
 * stays the one module: adding a second logger beside a dead one is how a
 * project ends up with three (rule 7, and `admin-dashboard` had already grown
 * its own private copy).
 *
 * The signature is unchanged so the existing call sites did not have to move,
 * with two additions:
 *
 *   - `admin` may be null. A top-level `catch` usually cannot reach the client
 *     that was built inside the `try`, and the failures worth logging most are
 *     exactly the ones that got that far. A null builds a client here.
 *   - `req` carries the correlation id. The browser mints an id per call and
 *     sends it as `x-correlation-id`; logging under the same id is what puts a
 *     buyer's "payment failed" and this stack one query apart instead of a
 *     guess by timestamp across two systems.
 *
 * Everything here is best effort and silent on failure. A function must never
 * fail because logging its failure failed: the caller's own error is the one
 * that matters and it has already happened by the time we are here.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id the client sent, if it sent a well formed one. */
export function correlationIdFrom(req: Request): string | null {
  const raw = req.headers.get("x-correlation-id");
  return raw && UUID_RE.test(raw) ? raw : null;
}

function fingerprintOf(kind: string, message: string, stack?: string | null): string {
  const normalised = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    // Kept character for character with the client half in src/lib/errorLog.ts.
    // Two normalisers that disagree produce two groups for one defect.
    .replace(/\b(?=[0-9a-f]{6,}\b)(?=[0-9a-f]*\d)[0-9a-f]+\b/gi, "<hex>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/["'`][^"'`]{0,80}["'`]/g, "<str>")
    .slice(0, 200);
  const topFrame = (stack ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("at ")) ?? "";
  const basis = `${kind}|${normalised}|${topFrame.slice(0, 120)}`;
  let hash = 5381;
  for (let i = 0; i < basis.length; i++) hash = ((hash << 5) + hash + basis.charCodeAt(i)) | 0;
  // The `e` prefix mirrors the client's `c`, so a fingerprint's origin is
  // readable without joining to the source column.
  return `e${(hash >>> 0).toString(36)}`;
}

export interface EdgeErrorPayload {
  function_name: string;
  user_id?: string | null;
  /** A short slug for the failure class, e.g. `paystack_unavailable`. */
  error_code?: string | null;
  /** The message, or the thrown value itself when there is one to unwrap. */
  message: string | unknown;
  http_status?: number | null;
  /** Anything that helps diagnose. Never a token, key, or full card number. */
  request_context?: Record<string, unknown> | null;
  /** Present when the browser started this call, and the reason the two
   *  halves of one failed attempt can be read together. */
  req?: Request;
  severity?: "warning" | "error" | "fatal";
}

/**
 * Record an edge failure. Awaitable, but callers usually should not await it:
 * the response to the user should not wait on the log write.
 *
 * `admin` may be null, in which case a service-role client is built here.
 */
export async function logEdgeError(
  admin: SupabaseClient | null,
  payload: EdgeErrorPayload,
): Promise<void> {
  try {
    let client = admin;
    if (!client) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) return;
      client = createClient(supabaseUrl, serviceRoleKey);
    }

    const raw = payload.message as { message?: string; stack?: string } | string | undefined;
    const message =
      (typeof raw === "string" ? raw : raw?.message) ?? "Unknown edge error";
    const stack = raw && typeof raw === "object" ? raw.stack ?? null : null;
    const kind = payload.error_code ?? "edge_exception";

    await client.from("error_events").insert({
      occurred_at: new Date().toISOString(),
      correlation_id: payload.req ? correlationIdFrom(payload.req) : null,
      source: "edge",
      severity: payload.severity ?? "error",
      kind,
      message: String(message).slice(0, 2_000),
      stack: stack ? stack.slice(0, 8_000) : null,
      function_name: payload.function_name.slice(0, 300),
      http_status: payload.http_status ?? null,
      user_id: payload.user_id ?? null,
      user_agent: payload.req?.headers.get("user-agent")?.slice(0, 300) ?? null,
      context: payload.request_context ?? {},
      fingerprint: fingerprintOf(kind, String(message), stack),
    });
  } catch (e) {
    // Deliberately silent past this line. See the header: the caller's error
    // is the real one, and a logger that throws replaces it with its own.
    console.error("[logEdgeError] failed to log:", e);
  }
}
