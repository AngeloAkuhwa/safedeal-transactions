/**
 * Admin Flagged Users - single user action endpoint.
 * POST { action, user_id, ... } → writes admin_actions, mutates profile.status when needed.
 * Admin-only.
 */
import { requireAdmin, authErrorResponse, requirePermission, requireAnyPermission } from "../_shared/auth.ts";
import { logAdminAction, extractRequestMeta } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Action = "flag_user" | "clear_flag" | "suspend_user" | "unsuspend_user" | "escalate_case" | "add_note";

const REQUIRES_NOTE: Record<Action, boolean> = {
  flag_user: true, clear_flag: true, suspend_user: true,
  unsuspend_user: true, escalate_case: true, add_note: true,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // Coarse gate before the body is touched — `invalid_json` was a 400 an
  // anonymous caller could earn, which tells them the endpoint exists and
  // takes JSON. The per-action permission still resolves after parsing.
  let baseCtx;
  try { baseCtx = await requireAdmin(req); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json(400, { error: "invalid_json" }); }

  const action = body.action as Action;
  // Gate per-action so support/dispute roles can add notes or clear a flag
  // without gaining suspension powers.
  const perms =
    action === "suspend_user" || action === "unsuspend_user"
      ? ["flagged_users.suspend"]
      : action === "clear_flag"
        ? ["flagged_users.remove_flag", "flagged_users.update"]
        : ["flagged_users.update"];
  let ctx;
  try { ctx = await requireAnyPermission(req, perms, baseCtx); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }
  const admin = ctx.adminClient;

  const user_id = body.user_id as string;
  const note = ((body.note as string) ?? "").trim();
  const reason_key = (body.reason_key as string) ?? null;
  const severity = (body.severity as string) ?? null;
  const source_type = (body.source_type as string) ?? null;
  const source_id = (body.source_id as string) ?? null;
  const transaction_id = (body.transaction_id as string) ?? null;
  const dispute_id = (body.dispute_id as string) ?? null;

  if (!action || !user_id) return json(400, { error: "missing_fields" });
  if (!["flag_user", "clear_flag", "suspend_user", "unsuspend_user", "escalate_case", "add_note"].includes(action)) {
    return json(400, { error: "invalid_action" });
  }
  if (REQUIRES_NOTE[action] && !note) return json(400, { error: "note_required" });

  // Ensure target exists
  const { data: target } = await admin.from("profiles").select("id, status").eq("id", user_id).maybeSingle();
  if (!target) return json(404, { error: "user_not_found" });

  if (action === "suspend_user" && target.status === "suspended") {
    return json(409, { error: "already_suspended" });
  }
  if (action === "unsuspend_user" && target.status !== "suspended" && target.status !== "blocked") {
    return json(409, { error: "not_suspended" });
  }

  // Compose enriched note with reason metadata so the audit row is self-describing.
  const noteParts: string[] = [];
  if (reason_key) noteParts.push(`reason=${reason_key}`);
  if (severity) noteParts.push(`severity=${severity}`);
  if (source_type) noteParts.push(`source=${source_type}${source_id ? `:${source_id}` : ""}`);
  const fullNote = [noteParts.join(" | "), note].filter(Boolean).join(" :: ").slice(0, 1000);

  // Update profile.status when needed
  if (action === "suspend_user") {
    const { error: upErr } = await admin.from("profiles").update({ status: "suspended" }).eq("id", user_id);
    if (upErr) return json(500, { error: "suspend_failed", detail: upErr.message });
  } else if (action === "unsuspend_user") {
    const { error: upErr } = await admin.from("profiles").update({ status: "active" }).eq("id", user_id);
    if (upErr) return json(500, { error: "unsuspend_failed", detail: upErr.message });
  }

  const meta = extractRequestMeta(req);
  const before = (action === "suspend_user" || action === "unsuspend_user")
    ? { status: target.status }
    : undefined;
  const after = action === "suspend_user"
    ? { status: "suspended" }
    : action === "unsuspend_user"
      ? { status: "active" }
      : undefined;
  const audit = await logAdminAction(admin, {
    actorId: ctx.userId,
    action,
    targetType: "user",
    targetId: user_id,
    transactionId: transaction_id || null,
    disputeId: dispute_id || null,
    reason: fullNote || undefined,
    before,
    after,
    metadata: { reason_key, severity, source_type, source_id, note },
    mirrorToAuditLogs: action === "suspend_user" || action === "unsuspend_user" || action === "escalate_case",
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  if (!audit.ok) return json(500, { error: "audit_write_failed", detail: audit.error });
  const inserted = { id: audit.id, created_at: new Date().toISOString() };

  if (transaction_id) {
    await admin.from("transaction_events").insert({
      transaction_id,
      event_type: "admin_action",
      actor_user_id: ctx.userId,
      actor_role: "admin",
      event_data: { action, target_user_id: user_id, note, reason_key, severity },
    });
  }

  return json(200, {
    ok: true,
    action,
    user_id,
    admin_action_id: inserted?.id,
    created_at: inserted?.created_at,
  });
});