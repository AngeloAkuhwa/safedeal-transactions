// Public read of the effective media standards. Mirrors commerce-config /
// pricing-config so seller UI thresholds can never drift from enforcement.
import { loadMediaConfig } from "../_shared/media-config.ts";

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
  const cfg = await loadMediaConfig();
  return new Response(JSON.stringify(cfg), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});