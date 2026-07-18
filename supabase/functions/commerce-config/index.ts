// Public read of effective commerce config. Mirrors pricing-config.
// Accepts optional ?vendor_id=... to resolve vendor overrides.
import { loadCommerceConfig } from "../_shared/commerce-gate.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COMMERCE_KEYS = [
  "commerce.checkout_enabled",
  "commerce.add_to_cart_enabled",
  "commerce.disabled_reason",
];

async function resolveSources(vendorId: string | null): Promise<Record<string, "vendor" | "platform" | "default">> {
  const out: Record<string, "vendor" | "platform" | "default"> = {};
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const vendorKeys = new Set<string>();
    if (vendorId) {
      const { data } = await admin
        .from("system_settings")
        .select("setting_key")
        .eq("scope", "vendor")
        .eq("vendor_id", vendorId)
        .in("setting_key", COMMERCE_KEYS);
      (data ?? []).forEach((r: any) => vendorKeys.add(r.setting_key));
    }
    const { data: platRows } = await admin
      .from("system_settings")
      .select("setting_key")
      .eq("scope", "platform")
      .in("setting_key", COMMERCE_KEYS);
    const platKeys = new Set<string>((platRows ?? []).map((r: any) => r.setting_key));
    for (const k of COMMERCE_KEYS) {
      out[k] = vendorKeys.has(k) ? "vendor" : platKeys.has(k) ? "platform" : "default";
    }
  } catch {
    for (const k of COMMERCE_KEYS) out[k] = "default";
  }
  return out;
}

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
  const [cfg, sources] = await Promise.all([
    loadCommerceConfig(vendorId || null),
    resolveSources(vendorId || null),
  ]);
  return new Response(JSON.stringify({ ...cfg, sources }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});