// Hard-delete an internal user. Only allowed for rows that never carried
// active access (status IN ('invited','deactivated')). Removes:
//   1. internal_user_roles
//   2. internal_users
//   3. auth.users (via admin API)
// Emits a canonical admin_actions audit row with mode = "hard_delete".
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
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

interface Body {
  user_id: string;
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let ctx;
  try { ctx = await requirePermission(req, "users_and_access.manage_permissions"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: Body;
  try { body = await req.json(); }
  catch { return json(400, { error: "invalid_json" }); }

  if (!body?.user_id) return json(400, { error: "user_id_required" });
  if (body.user_id === ctx.userId) return json(400, { error: "cannot_delete_self" });

  const admin = ctx.adminClient;

  // Load the target row + guard on status.
  const { data: target, error: loadErr } = await admin
    .from("internal_users")
    .select("id, full_name, email, status, employee_id, display_id")
    .eq("id", body.user_id)
    .maybeSingle();
  if (loadErr) return json(500, { error: "load_failed", detail: loadErr.message });
  if (!target) return json(404, { error: "not_found" });

  const allowed = target.status === "invited" || target.status === "deactivated";
  if (!allowed) {
    return json(409, {
      error: "delete_blocked",
      detail: "Only invited or deactivated users can be hard-deleted. Deactivate this user first.",
    });
  }

  // 1. role rows
  const { error: roleErr } = await admin
    .from("internal_user_roles")
    .delete()
    .eq("user_id", body.user_id);
  if (roleErr) return json(500, { error: "role_delete_failed", detail: roleErr.message });

  // 2. internal_users row
  const { error: iuErr } = await admin
    .from("internal_users")
    .delete()
    .eq("id", body.user_id);
  if (iuErr) return json(500, { error: "row_delete_failed", detail: iuErr.message });

  // 3. auth user (best-effort. If it fails the row is already gone,
  //    surface the message so the admin knows to clean up manually)
  let authWarning: string | null = null;
  try {
    const { error: authErr } = await admin.auth.admin.deleteUser(body.user_id);
    if (authErr) authWarning = authErr.message;
  } catch (e) {
    authWarning = e instanceof Error ? e.message : String(e);
  }

  const meta = extractRequestMeta(req);
  await logAdminAction(admin, {
    actorId: ctx.userId,
    action: "user_deactivated",
    targetType: "user",
    targetId: body.user_id,
    reason: body.reason ?? "Invited user deleted before onboarding",
    metadata: {
      mode: "hard_delete",
      email: target.email,
      full_name: target.full_name,
      previous_status: target.status,
      employee_id: target.employee_id ?? target.display_id,
      auth_user_delete_warning: authWarning,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
    mirrorToAuditLogs: true,
  });

  return json(200, { ok: true, auth_user_delete_warning: authWarning });
});