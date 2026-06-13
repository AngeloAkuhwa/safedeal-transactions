/**
 * Admin-only CRUD for the dynamic escrow alert thresholds.
 * Reads/writes the single `system_settings` row keyed by
 * `escrow_alert_thresholds`. Future permission tightening should
 * happen inside `requireAdmin` / a dedicated clearance helper.
 */
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SETTING_KEY = "escrow_alert_thresholds";

const DEFAULTS = {
  frozen_days: 30,
  overdue_days: 5,
  idle_days: 15,
  high_value_amount: 1_000_000,
  mismatch_min_delta: 0.01,
};

type Thresholds = typeof DEFAULTS;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validate(input: unknown): { ok: true; value: Thresholds } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_body" };
  const o = input as Record<string, unknown>;
  const out: Thresholds = { ...DEFAULTS };
  const intFields: Array<[keyof Thresholds, number, number]> = [
    ["frozen_days", 1, 365],
    ["overdue_days", 1, 365],
    ["idle_days", 1, 365],
    ["high_value_amount", 1, 1_000_000_000],
  ];
  for (const [k, min, max] of intFields) {
    const v = Number(o[k]);
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < min || v > max) {
      return { ok: false, error: `invalid_${k}` };
    }
    out[k] = v;
  }
  const md = Number(o.mismatch_min_delta);
  if (!Number.isFinite(md) || md < 0 || md > 1_000_000) {
    return { ok: false, error: "invalid_mismatch_min_delta" };
  }
  out.mismatch_min_delta = md;
  return { ok: true, value: out };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, adminClient } = await requireAdmin(req);

    if (req.method === "GET") {
      const { data, error } = await adminClient
        .from("system_settings")
        .select("setting_value, updated_at")
        .eq("setting_key", SETTING_KEY)
        .maybeSingle();
      if (error) return json(500, { error: "fetch_failed", detail: error.message });
      return json(200, {
        thresholds: { ...DEFAULTS, ...((data?.setting_value as Record<string, unknown>) ?? {}) },
        updated_at: data?.updated_at ?? null,
      });
    }

    if (req.method === "PUT") {
      let body: unknown = null;
      try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
      const parsed = validate(body);
      if (!parsed.ok) return json(400, { error: parsed.error });

      const value = {
        ...parsed.value,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await adminClient
        .from("system_settings")
        .upsert({ setting_key: SETTING_KEY, setting_value: value }, { onConflict: "setting_key" })
        .select("setting_value, updated_at")
        .single();
      if (error) return json(500, { error: "save_failed", detail: error.message });

      await adminClient.from("admin_actions").insert({
        admin_user_id: userId,
        action_type: "settings_update",
        action_notes: `Updated escrow alert thresholds: ${JSON.stringify(parsed.value)}`,
      });

      return json(200, {
        thresholds: { ...DEFAULTS, ...((data?.setting_value as Record<string, unknown>) ?? {}) },
        updated_at: data?.updated_at ?? null,
      });
    }

    return json(405, { error: "method_not_allowed" });
  } catch (err) {
    const authResp = authErrorResponse(err, corsHeaders);
    if (authResp) return authResp;
    console.error("[admin-escrow-alert-settings] unexpected", err);
    return json(500, { error: "internal_error" });
  }
});