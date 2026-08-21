// Public endpoint returning platform-scope security config (session timeout, 2FA).
// Consumed by the client to enforce idle-logout and drive UI hints.
import { requireUser, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KEYS = ["security.session_timeout_minutes", "security.two_factor_admin"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { adminClient } = await requireUser(req);
    const { data, error } = await adminClient
      .from("system_settings")
      .select("setting_key, setting_value")
      .eq("scope", "platform")
      .in("setting_key", KEYS);
    if (error) {
      return new Response(JSON.stringify({ error: "resolve_failed", detail: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const map: Record<string, unknown> = {};
    (data ?? []).forEach((r: any) => { map[r.setting_key] = r.setting_value; });
    const timeout = Number(map["security.session_timeout_minutes"] ?? 30);
    return new Response(JSON.stringify({
      session_timeout_minutes: Number.isFinite(timeout) && timeout > 0 ? timeout : 30,
      two_factor_admin: map["security.two_factor_admin"] === true,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const authResp = authErrorResponse(err, corsHeaders);
    if (authResp) return authResp;
    console.error("[security-config] unexpected", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});