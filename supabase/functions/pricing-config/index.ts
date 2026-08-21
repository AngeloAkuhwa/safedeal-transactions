// Public endpoint returning the effective pricing config for a vendor.
// Used by client-side checkout components to compute previews.
// Auth required; caller may be any authenticated user (buyer viewing seller's checkout).
import { requireUser, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KEYS = [
  "pricing.min_platform_fee_ngn",
  "pricing.max_total_service_fee_ngn",
  "pricing.tier_rates",
  "pricing.platform_fee_rate",
  "pricing.platform_fee_flat_ngn",
  "pricing.max_platform_fee_ngn",
  "fees.refund_policy",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { adminClient } = await requireUser(req);
    const url = new URL(req.url);
    const vendorId = url.searchParams.get("vendor_id");
    if (!vendorId) {
      return new Response(JSON.stringify({ error: "vendor_id_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data, error } = await adminClient.rpc("get_effective_settings", {
      _vendor_id: vendorId,
      _keys: KEYS,
    });
    if (error) {
      return new Response(JSON.stringify({ error: "resolve_failed", detail: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const config: Record<string, unknown> = {};
    (data ?? []).forEach((r: { setting_key: string; setting_value: unknown }) => {
      config[r.setting_key] = r.setting_value;
    });
    return new Response(JSON.stringify({ vendor_id: vendorId, config }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const authResp = authErrorResponse(err, corsHeaders);
    if (authResp) return authResp;
    console.error("[pricing-config] unexpected", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});