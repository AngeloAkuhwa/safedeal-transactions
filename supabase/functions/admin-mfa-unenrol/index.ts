// Admin-assisted 2FA unenrol for internal teammates who lost their device and
// their recovery codes. Removes a factor; NEVER grants a role or permission.
//
// Authorisation rules (all enforced server-side):
//   * caller needs `users_and_access.manage_permissions`
//   * the target's access level must be STRICTLY LOWER than the caller's,
//     so a support_agent can never strip a super_admin's factor
//   * only a super_admin may unenrol another super_admin
//   * nobody may unenrol themselves through this path (use recovery codes)
//   * reason >= 20 characters, audited, and every super_admin is alerted
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";
import { extractRequestMeta, logAdminAction } from "../_shared/audit.ts";
import { notifyUser } from "../_shared/notify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const LEVEL_RANK: Record<string, number> = { full: 4, high: 3, standard: 2, limited: 1 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let ctx;
  try {
    ctx = await requirePermission(req, "users_and_access.manage_permissions");
  } catch (err) {
    const resp = authErrorResponse(err, corsHeaders);
    if (resp) return resp;
    throw err;
  }

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const admin = ctx.adminClient;
  const { ip, userAgent } = extractRequestMeta(req);

  let body: { user_id?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_body" });
  }

  const targetId = String(body.user_id ?? "");
  const reason = String(body.reason ?? "").trim();
  if (!targetId) return json(400, { error: "user_id_required" });
  if (reason.length < 20) return json(400, { error: "reason_too_short" });
  if (targetId === ctx.userId) return json(403, { error: "cannot_unenrol_self" });

  const [
    { data: actorLevel },
    { data: targetLevel },
    { data: actorSuper },
    { data: targetSuper },
    { data: targetRow },
  ] = await Promise.all([
    admin.rpc("internal_effective_access_level", { _user_id: ctx.userId }),
    admin.rpc("internal_effective_access_level", { _user_id: targetId }),
    admin.rpc("has_any_internal_role", { _user_id: ctx.userId, _role_keys: ["super_admin"] }),
    admin.rpc("has_any_internal_role", { _user_id: targetId, _role_keys: ["super_admin"] }),
    admin.from("internal_users").select("id, full_name, email").eq("id", targetId).maybeSingle(),
  ]);

  if (!targetRow) return json(404, { error: "internal_user_not_found" });

  const isConsumerAdmin = await admin
    .rpc("has_role", { _user_id: ctx.userId, _role: "admin" })
    .then((r) => r.data === true);
  const actorIsSuper = actorSuper === true || isConsumerAdmin;

  if (targetSuper === true && !actorIsSuper) {
    return json(403, { error: "insufficient_authority", detail: "only_super_admin_may_unenrol_super_admin" });
  }
  const actorRank = actorIsSuper ? LEVEL_RANK.full : (LEVEL_RANK[String(actorLevel ?? "limited")] ?? 1);
  const targetRank = LEVEL_RANK[String(targetLevel ?? "limited")] ?? 1;
  if (targetRank >= actorRank) {
    return json(403, { error: "insufficient_authority", detail: "target_rank_not_lower" });
  }

  const { data: factorData } = await admin.auth.admin.mfa.listFactors({ userId: targetId });
  const factors = (factorData?.factors ?? []) as Array<{ id: string }>;
  for (const f of factors) {
    await admin.auth.admin.mfa.deleteFactor({ userId: targetId, id: f.id });
  }
  await admin.from("mfa_recovery_codes").delete().eq("user_id", targetId);
  await admin.from("internal_users").update({ two_factor_enabled: false }).eq("id", targetId);

  await logAdminAction(admin, {
    actorId: ctx.userId,
    action: "admin_mfa_unenrol",
    targetType: "user",
    targetId,
    before: { verified_factors: factors.length, two_factor_enabled: true },
    after: { verified_factors: 0, two_factor_enabled: false },
    reason,
    mirrorToAuditLogs: true,
    ip,
    userAgent,
  });

  await notifyUser(admin, {
    user_id: targetId,
    type: "security_alert",
    title: "Your two-factor authentication was removed",
    message:
      "An administrator removed the authenticator app from your account. Set up two-factor authentication again from your security settings.",
    metadata: { event: "admin_mfa_unenrol", actor_id: ctx.userId },
  });

  // Alert every super_admin — an assisted unenrol is always newsworthy.
  const { data: supers } = await admin
    .from("internal_user_roles")
    .select("user_id")
    .eq("role_key", "super_admin");
  for (const s of ((supers ?? []) as Array<{ user_id: string }>)) {
    if (s.user_id === targetId) continue;
    await notifyUser(admin, {
      user_id: s.user_id,
      type: "security_alert",
      title: "Admin-assisted 2FA unenrol performed",
      message: `${(targetRow as { full_name?: string }).full_name ?? targetId} had their authenticator removed by an administrator. Reason: ${reason}`,
      metadata: { event: "admin_mfa_unenrol", actor_id: ctx.userId, target_id: targetId },
    });
  }

  return json(200, { ok: true, factors_removed: factors.length });
});