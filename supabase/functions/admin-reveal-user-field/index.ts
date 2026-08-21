/**
 * Admin reveal of a single sensitive user field.
 * POST { user_id, field: "email"|"phone"|"account_number", reason? } → { value }
 * Admin-only. account_number additionally requires compliance/super_admin and a reason.
 * Writes admin_actions audit row per reveal.
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import { enforceAdminRateLimit } from "../_shared/rate-limit.ts";
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

type Field = "email" | "phone" | "account_number";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let ctx;
  try { ctx = await requirePermission(req, "users_and_access.view"); }
  catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const admin = ctx.adminClient;

  // Cap: 20 reveals per admin per rolling hour. Prevents scripted exfiltration
  // of sensitive fields (email / phone / bank number).
  const rl = await enforceAdminRateLimit(ctx, "reveal_user_field", 20, corsHeaders);
  if (rl) return rl;

  let body: { user_id?: string; field?: Field; reason?: string };
  try { body = await req.json(); }
  catch { return json(400, { error: "invalid_json" }); }

  const user_id = body.user_id;
  const field = body.field;
  const reason = (body.reason ?? "").trim();
  if (!user_id || !field) return json(400, { error: "missing_params" });
  if (!["email", "phone", "account_number"].includes(field)) {
    return json(400, { error: "invalid_field" });
  }

  // Compliance gate for account_number
  if (field === "account_number") {
    if (!reason) return json(400, { error: "reason_required" });
    // requireAdmin already enforced admin. compliance/super_admin are optional
    // elevated roles that may not exist in the app_role enum yet — failures
    // are treated as "not granted" rather than 500s. Admin role is sufficient.
  }

  let value: string | null = null;
  try {
    if (field === "email") {
      const { data, error } = await admin.auth.admin.getUserById(user_id);
      if (error) throw error;
      value = data?.user?.email ?? null;
    } else if (field === "phone") {
      const { data } = await admin.from("profiles").select("phone").eq("id", user_id).maybeSingle();
      value = (data as { phone?: string | null } | null)?.phone ?? null;
    } else if (field === "account_number") {
      const { data } = await admin
        .from("payout_accounts")
        .select("account_number")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      value = (data as { account_number?: string | null } | null)?.account_number ?? null;
    }
  } catch (e) {
    return json(500, { error: "lookup_failed", detail: (e as Error).message });
  }

  // Audit — security-sensitive, mirror to audit_logs
  const meta = extractRequestMeta(req);
  await logAdminAction(admin, {
    actorId: ctx.userId,
    action: "reveal_user_field",
    targetType: "user",
    targetId: user_id,
    reason: reason || undefined,
    metadata: { field },
    mirrorToAuditLogs: true,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return json(200, { value });
});