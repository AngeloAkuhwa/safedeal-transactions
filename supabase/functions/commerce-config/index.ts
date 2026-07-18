// Public read of effective commerce config. Mirrors pricing-config.
// Accepts optional ?vendor_id=... to resolve vendor overrides.
import { loadCommerceConfig } from "../_shared/commerce-gate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const vendorId = url.searchParams.get("vendor_id");
  const cfg = await loadCommerceConfig(vendorId || null);
  return new Response(JSON.stringify(cfg), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});