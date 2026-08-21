// Admin Audit Logs — read-only aggregator for the /admin/audit-logs screen.
// Returns paginated rows from admin_actions (canonical) with parsed diff /
// severity, plus lightweight aggregate stats for the KPI cards.
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";

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

// action_type is a Postgres enum, so severity filtering can't use `ilike` or
// `imatch`. We resolve enum values once per request and filter with `.in()`.
const UUID_RE = /^[0-9a-f-]{36}$/i;
// Full enum snapshot for admin_action_type — kept in sync with the DB enum so
// severity filtering can map into `.in()` clauses (Postgres enums don't support
// ilike/imatch operators via PostgREST).
const ACTION_TYPES: string[] = [
  "add_internal_note","add_note","clear_flag","close_case","escalate_case",
  "export_data","extend_deadline","flag_for_review","flag_user","freeze_transaction",
  "high_value_flag","open_investigation","refund_buyer","release_funds","request_evidence",
  "resolve_dispute","retry_refund","set_vendor_status","suspend_user","toggle_auto_release","unflag_user",
  "unfreeze_transaction","unsuspend_user","update_investigation","update_setting",
];
async function listActionTypes(_admin: unknown): Promise<string[]> { return ACTION_TYPES; }
function actionsForSeverity(all: string[], sev: Severity): string[] {
  return all.filter((a) => severityFor(a) === sev);
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

  let ctx;
  try { ctx = await requirePermission(req, "audit_logs.view"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });
  const admin = ctx.adminClient;
  const url = new URL(req.url);
  const mode = url.searchParams.get("action") ?? "list";

  if (mode === "stats") {
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
    const monthAgo = new Date(now - 30 * 24 * 3600 * 1000).toISOString();
    const [{ count: total30d }, { data: recent }, { data: latest }, { data: sample }] = await Promise.all([
      admin.from("admin_actions").select("id", { count: "exact", head: true }).gte("created_at", monthAgo),
      admin.from("admin_actions").select("admin_user_id, action_type, created_at").gte("created_at", dayAgo).limit(5000),
      admin.from("admin_actions").select("created_at").order("created_at", { ascending: false }).limit(1),
      // Sample of recent payload sizes for a realistic 30d storage estimate.
      admin.from("admin_actions").select("action_notes").gte("created_at", monthAgo).limit(2000),
    ]);
    const rec = recent ?? [];
    const highSeverity = rec.filter((r) => {
      const s = severityFor(r.action_type as string);
      return s === "high" || s === "critical";
    }).length;
    const actors = new Set(rec.map((r) => r.admin_user_id).filter(Boolean)).size;
    const sampled = sample ?? [];
    const sampledBytes = sampled.reduce((n, r) => n + (r.action_notes ? (r.action_notes as string).length : 0), 0);
    const avgBytes = sampled.length ? Math.round(sampledBytes / sampled.length) : 512;
    const storageBytes = (total30d ?? 0) * avgBytes;
    return json(200, {
      total_entries: total30d ?? 0,
      high_severity: highSeverity,
      active_admins: actors,
      storage_bytes: storageBytes,
      latest_entry_at: latest?.[0]?.created_at ?? null,
    });
  }

  if (mode === "facets") {
    // Distinct action types and top actors over the last 90 days.
    const ninety = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const { data: recent } = await admin
      .from("admin_actions")
      .select("action_type, admin_user_id, created_at")
      .gte("created_at", ninety)
      .order("created_at", { ascending: false })
      .limit(10000);
    const typeCounts = new Map<string, number>();
    const actorCounts = new Map<string, number>();
    for (const r of recent ?? []) {
      const t = (r.action_type as string) ?? "";
      if (t) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
      const a = (r.admin_user_id as string) ?? "";
      if (a) actorCounts.set(a, (actorCounts.get(a) ?? 0) + 1);
    }
    const action_types = Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 200).map(([t]) => t);
    const actorIds = Array.from(actorCounts.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 100).map(([id]) => id);
    const profileMap = new Map<string, { id: string; full_name: string | null; email: string | null }>();
    const roleMap = new Map<string, string>();
    if (actorIds.length) {
      const { data: profs } = await admin.from("profiles")
        .select("id, full_name, email").in("id", actorIds);
      for (const p of profs ?? []) profileMap.set(p.id, p);
      const { data: roles } = await admin.from("user_roles")
        .select("user_id, role").in("user_id", actorIds);
      for (const r of roles ?? []) if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role);
    }
    const actors = actorIds.map((id) => {
      const p = profileMap.get(id);
      return {
        id,
        full_name: p?.full_name ?? "Admin",
        email: p?.email ?? null,
        role: roleMap.get(id) ?? "admin",
      };
    });
    return json(200, { action_types, actors });
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

  // Severity — resolve to enum member list and use `.in()`.
  if (severity && severity !== ("all" as Severity)) {
    const all = await listActionTypes(admin);
    const wanted = actionsForSeverity(all, severity);
    if (wanted.length === 0) {
      return json(200, { rows: [], total: 0, page, page_size: pageSize });
    }
    query = query.in("action_type", wanted);
  }

  // Broadened search: UUIDs match id columns; free text matches action_type,
  // action_notes, target profile name/email, and transaction codes.
  if (q) {
    if (UUID_RE.test(q)) {
      query = query.or(
        `id.eq.${q},target_user_id.eq.${q},transaction_id.eq.${q},dispute_id.eq.${q},admin_user_id.eq.${q}`,
      );
    } else {
      const like = `%${q.replace(/[,()]/g, " ")}%`;
      const [{ data: matchedProfiles }, { data: matchedTx }, allTypes] = await Promise.all([
        admin.from("profiles").select("id").or(`full_name.ilike.${like},email.ilike.${like},public_user_id.eq.${q.trim().toUpperCase()}`).limit(200),
        admin.from("transactions").select("id").ilike("transaction_code", like).limit(200),
        listActionTypes(admin),
      ]);
      const targetIds = (matchedProfiles ?? []).map((p) => p.id).filter(Boolean);
      const txIds = (matchedTx ?? []).map((t) => t.id).filter(Boolean);
      const qLower = q.toLowerCase();
      const matchedTypes = allTypes.filter((t) => t.toLowerCase().includes(qLower));
      const orParts: string[] = [`action_notes.ilike.${like}`];
      if (matchedTypes.length) orParts.push(`action_type.in.(${matchedTypes.join(",")})`);
      if (targetIds.length) orParts.push(`target_user_id.in.(${targetIds.join(",")})`);
      if (txIds.length) orParts.push(`transaction_id.in.(${txIds.join(",")})`);
      query = query.or(orParts.join(","));
    }
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
  const profileMap = new Map<string, { public_user_id: string | null; full_name: string | null; email: string | null; avatar_url: string | null }>();
  if (userIds.length) {
    const { data: profs } = await admin.from("profiles")
      .select("id, public_user_id, full_name, email, avatar_url")
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
        public_user_id: targetProf?.public_user_id ?? null,
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