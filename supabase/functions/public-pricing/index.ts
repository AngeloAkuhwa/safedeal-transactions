/**
 * public-pricing: anonymous read of the live platform pricing figures.
 *
 * The public pricing page and the landing fee section MUST show the same
 * numbers the checkout actually charges. Those numbers live in the
 * `pricing.*` platform rows of `system_settings`; this endpoint is the only
 * anonymous way to read them. Clients fall back to
 * `FALLBACK_PRICING_CONFIG` only when this read fails.
 *
 * No auth: platform fee rates are public information. Vendor overrides are
 * never returned here (that stays behind `pricing-config`).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { SACHETS } from "../_shared/sachet-catalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KEYS = [
  "pricing.min_platform_fee_ngn",
  "pricing.max_total_service_fee_ngn",
  "pricing.platform_fee_rate",
  "pricing.platform_fee_flat_ngn",
  "pricing.max_platform_fee_ngn",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await admin
      .from("system_settings")
      .select("setting_key, setting_value")
      .eq("scope", "platform")
      .in("setting_key", KEYS);
    if (error) throw error;
    const config: Record<string, unknown> = {};
    (data ?? []).forEach((r) => { config[r.setting_key] = r.setting_value; });
    return new Response(
      JSON.stringify({ config, sachets: SACHETS }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
    );
  } catch (err) {
    console.error("[public-pricing] failed", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
