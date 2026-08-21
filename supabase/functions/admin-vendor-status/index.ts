// Admin endpoint: set vendor active/disabled/suspended flag with audit trail.
// POST { vendor_id, status: 'active'|'disabled'|'suspended', reason }
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

const ALLOWED = new Set(["active", "disabled", "suspended"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, adminClient } = await requirePermission(req, "users_and_access.update");

    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
    let body: any;
    try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

    const vendorId = String(body?.vendor_id ?? "").trim();
    const status = String(body?.status ?? "").trim();
    const reason = String(body?.reason ?? "").trim();

    if (!vendorId) return json(400, { error: "vendor_id_required" });
    if (!ALLOWED.has(status)) return json(400, { error: "invalid_status" });
    if (status !== "active" && reason.length < 3) return json(400, { error: "reason_required" });

    const { data: existing, error: fetchErr } = await adminClient
      .from("profiles")
      .select("id, vendor_status")
      .eq("id", vendorId)
      .maybeSingle();
    if (fetchErr) return json(500, { error: "fetch_failed", detail: fetchErr.message });
    if (!existing) return json(404, { error: "vendor_not_found" });

    const now = new Date().toISOString();
    const { error: upErr } = await adminClient
      .from("profiles")
      .update({
        vendor_status: status,
        vendor_status_reason: reason || null,
        vendor_status_changed_at: now,
        vendor_status_changed_by: userId,
      })
      .eq("id", vendorId);
    if (upErr) return json(500, { error: "save_failed", detail: upErr.message });

    const meta = extractRequestMeta(req);
    await logAdminAction(adminClient, {
      actorId: userId,
      action: "set_vendor_status",
      targetType: "vendor",
      targetId: vendorId,
      before: { vendor_status: existing.vendor_status },
      after: { vendor_status: status },
      reason,
      mirrorToAuditLogs: true,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return json(200, { ok: true, vendor_status: status });
  } catch (err) {
    const authResp = authErrorResponse(err, corsHeaders);
    if (authResp) return authResp;
    console.error("[admin-vendor-status] unexpected", err);
    return json(500, { error: "internal_error" });
  }

});