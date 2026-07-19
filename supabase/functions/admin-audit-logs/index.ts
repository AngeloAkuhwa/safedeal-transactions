// Admin Audit Logs — read-only aggregator for the /admin/audit-logs screen.
// Returns paginated rows from admin_actions (canonical) with parsed diff /
// severity, plus lightweight aggregate stats for the KPI cards.
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Severity = "critical" | "high" | "medium" | "low" | "info";

function severityFor(action: string): Severity {
  const a = (action || "").toLowerCase();
  if (/suspend|freeze|block|impersonat|reveal|delete|force|purge/.test(a)) return "critical";
  if (/role|setting|dispute_resolve|refund|override|policy|escrow_alert/.test(a)) return "high";
  if (/retry|broadcast|notification|review|approve|reject/.test(a)) return "medium";
  if (/view|export|list|search/.test(a)) return "info";
  return "low";
}

function humanAction(action: string): string {
  return (action || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseNotes(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { const v = JSON.parse(raw); return v && typeof v === "object" ? v as Record<string, unknown> : {}; }
  catch { return { legacy_notes: raw }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });

  let ctx;
  try { ctx = await requireAdmin(req); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }
  const admin = ctx.adminClient;
  const url = new URL(req.url);
  const mode = url.searchParams.get("action") ?? "list";

  if (mode === "stats") {
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
    const monthAgo = new Date(now - 30 * 24 * 3600 * 1000).toISOString();
    const [{ count: total30d }, { data: recent }, { data: latest }] = await Promise.all([
      admin.from("admin_actions").select("id", { count: "exact", head: true }).gte("created_at", monthAgo),
      admin.from("admin_actions").select("admin_user_id, action_type, created_at").gte("created_at", dayAgo).limit(5000),
      admin.from("admin_actions").select("created_at").order("created_at", { ascending: false }).limit(1),
    ]);
    const rec = recent ?? [];
    const highSeverity = rec.filter((r) => {
      const s = severityFor(r.action_type as string);
      return s === "high" || s === "critical";
    }).length;
    const actors = new Set(rec.map((r) => r.admin_user_id).filter(Boolean)).size;
    return json(200, {
      total_entries: total30d ?? 0,
      high_severity: highSeverity,
      active_admins: actors,
      storage_bytes: (total30d ?? 0) * 512,
      latest_entry_at: latest?.[0]?.created_at ?? null,
    });
  }

  // list mode
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("page_size") ?? "50")));
  const q = (url.searchParams.get("q") ?? "").trim();
  const actionType = url.searchParams.get("action_type");
  const actor = url.searchParams.get("actor_id");
  const severity = url.searchParams.get("severity") as Severity | null;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let query = admin.from("admin_actions")
    .select("id, admin_user_id, target_user_id, transaction_id, dispute_id, action_type, action_notes, created_at", { count: "exact" });
  if (actionType && actionType !== "all") query = query.eq("action_type", actionType);
  if (actor && actor !== "all") query = query.eq("admin_user_id", actor);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  if (q) {
    query = query.or(
      `action_type.ilike.%${q}%,action_notes.ilike.%${q}%,id.eq.${/^[0-9a-f-]{36}$/i.test(q) ? q : "00000000-0000-0000-0000-000000000000"}`,
    );
  }
  const fromIdx = (page - 1) * pageSize;
  query = query.order("created_at", { ascending: false }).range(fromIdx, fromIdx + pageSize - 1);
  const { data: rows, count, error } = await query;
  if (error) return json(500, { error: error.message });

  const list = rows ?? [];
  // Hydrate actors + target users in one round trip
  const userIds = Array.from(new Set(
    list.flatMap((r) => [r.admin_user_id, r.target_user_id]).filter(Boolean) as string[],
  ));
  const profileMap = new Map<string, { full_name: string | null; email: string | null; avatar_url: string | null }>();
  if (userIds.length) {
    const { data: profs } = await admin.from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("id", userIds);
    for (const p of profs ?? []) profileMap.set(p.id, p);
  }
  const { data: roleRows } = userIds.length
    ? await admin.from("user_roles").select("user_id, role").in("user_id", userIds)
    : { data: [] as { user_id: string; role: string }[] };
  const roleMap = new Map<string, string>();
  for (const r of roleRows ?? []) if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role);

  const shaped = list.map((r) => {
    const notes = parseNotes(r.action_notes);
    const sev = severityFor(r.action_type as string);
    const actorProf = profileMap.get(r.admin_user_id) ?? null;
    const targetProf = r.target_user_id ? profileMap.get(r.target_user_id) ?? null : null;
    return {
      id: r.id,
      created_at: r.created_at,
      action_type: r.action_type,
      action_label: humanAction(r.action_type as string),
      severity: sev,
      actor: {
        id: r.admin_user_id,
        name: actorProf?.full_name ?? "Admin",
        email: actorProf?.email ?? null,
        avatar_url: actorProf?.avatar_url ?? null,
        role: roleMap.get(r.admin_user_id) ?? "admin",
      },
      target: {
        user_id: r.target_user_id,
        user_email: targetProf?.email ?? null,
        user_name: targetProf?.full_name ?? null,
        transaction_id: r.transaction_id,
        dispute_id: r.dispute_id,
      },
      description: (notes.reason as string) ?? deriveDescription(r.action_type as string, notes),
      reason: notes.reason ?? null,
      changed_keys: notes.changed_keys ?? [],
      before: notes.before ?? null,
      after: notes.after ?? null,
      metadata: notes.metadata ?? null,
      ip: notes.ip ?? null,
      user_agent: notes.user_agent ?? null,
    };
  });

  return json(200, { rows: shaped, total: count ?? 0, page, page_size: pageSize });
});

function deriveDescription(action: string, notes: Record<string, unknown>): string {
  const keys = (notes.changed_keys as string[]) ?? [];
  if (keys.length) return `${humanAction(action)} — updated ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? "…" : ""}`;
  return humanAction(action);
}