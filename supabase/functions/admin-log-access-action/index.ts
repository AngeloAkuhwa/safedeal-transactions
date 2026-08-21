/**
 * Unified access-control audit logger.
 * Called by the browser after a mutation on `internal_users` / `internal_user_roles`
 * / `user_permission_overrides` / `access_change_requests` so IP + User-Agent are
 * captured server-side and one canonical `admin_actions` row is written per event.
 *
 * POST body:
 *   {
 *     target_user_id: string,
 *     action_type: string,     // must be a real admin_action_type enum value
 *     description?: string,
 *     reason?: string,
 *     before?: unknown,
 *     after?: unknown,
 *     approval_reference?: string | null,
 *     result?: "success" | "blocked_by_safeguard" | "failed",
 *     entity_ref?: string | null,   // e.g. "internal_users:<id>"
 *     metadata?: Record<string, unknown>,
 *     mirror?: boolean,             // mirror to audit_logs for the timeline
 *   }
 */
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";
import { logAdminAction, extractRequestMeta } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Only accept enum values that actually exist in admin_action_type.
const ACCEPTED_ACTIONS = new Set([
  "user_invited", "invitation_resent", "user_activated",
  "role_assigned", "role_changed",
  "permission_override_requested", "permission_override_approved", "permission_override_rejected",
  "role_change_approved", "role_change_rejected",
  "user_reactivated", "user_deactivated",
  "session_revoked", "task_reassigned",
  "suspend_user", "unsuspend_user", "add_internal_note", "flag_user", "unflag_user",
  "permission_override_requested", "permission_override_rejected", "permission_override_approved",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let ctx;
  try { ctx = await requireAdmin(req); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: {
    target_user_id?: string;
    action_type?: string;
    description?: string;
    reason?: string;
    before?: unknown;
    after?: unknown;
    approval_reference?: string | null;
    result?: "success" | "blocked_by_safeguard" | "failed";
    entity_ref?: string | null;
    metadata?: Record<string, unknown>;
    mirror?: boolean;
  };
  try { body = await req.json(); }
  catch { return json(400, { error: "invalid_json" }); }

  const target_user_id = body.target_user_id;
  const action_type = body.action_type;
  if (!target_user_id || !action_type) return json(400, { error: "missing_params" });
  if (!ACCEPTED_ACTIONS.has(action_type)) return json(400, { error: "invalid_action_type" });

  const meta = extractRequestMeta(req);

  const enriched: Record<string, unknown> = {
    ...(body.metadata ?? {}),
    description: body.description ?? action_type,
    approval_reference: body.approval_reference ?? null,
    result: body.result ?? "success",
    entity_ref: body.entity_ref ?? `internal_users:${target_user_id}`,
  };

  const result = await logAdminAction(ctx.adminClient, {
    actorId: ctx.userId,
    action: action_type,
    targetType: "user",
    targetId: target_user_id,
    reason: body.reason,
    before: body.before,
    after: body.after,
    metadata: enriched,
    mirrorToAuditLogs: body.mirror !== false,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  if (!result.ok) return json(500, { error: "audit_failed", detail: result.error });
  return json(200, { ok: true, id: result.id ?? null });
});