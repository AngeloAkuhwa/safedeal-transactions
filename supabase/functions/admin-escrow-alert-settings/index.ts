/**
 * Admin-only CRUD for the dynamic escrow alert thresholds.
 * Reads/writes `system_settings` rows keyed by `escrow_alert_thresholds`.
 * Supports platform (default) and vendor scope via `?vendor_id=<uuid>`.
 * Vendor rows fall back to the platform value when missing.
 */
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
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
    const { userId, adminClient } = await requirePermission(req, "escrow.configure");

    const url = new URL(req.url);
    const vendorIdParam = url.searchParams.get("vendor_id");
    const vendorId = vendorIdParam && vendorIdParam.trim() !== "" ? vendorIdParam.trim() : null;
    const scope: "platform" | "vendor" = vendorId ? "vendor" : "platform";

    if (req.method === "GET") {
      // Always load platform for baseline
      const { data: platformRow, error: platformErr } = await adminClient
        .from("system_settings")
        .select("setting_value, updated_at")
        .eq("setting_key", SETTING_KEY)
        .eq("scope", "platform")
        .is("vendor_id", null)
        .maybeSingle();
      if (platformErr) return json(500, { error: "fetch_failed", detail: platformErr.message });
      const platformValue = { ...DEFAULTS, ...((platformRow?.setting_value as Record<string, unknown>) ?? {}) };

      if (scope === "vendor") {
        const { data: vendorRow, error: vendorErr } = await adminClient
          .from("system_settings")
          .select("setting_value, updated_at")
          .eq("setting_key", SETTING_KEY)
          .eq("scope", "vendor")
          .eq("vendor_id", vendorId)
          .maybeSingle();
        if (vendorErr) return json(500, { error: "fetch_failed", detail: vendorErr.message });
        const hasOverride = !!vendorRow;
        const effective = hasOverride
          ? { ...platformValue, ...((vendorRow.setting_value as Record<string, unknown>) ?? {}) }
          : platformValue;
        return json(200, {
          scope: "vendor",
          vendor_id: vendorId,
          thresholds: effective,
          platform_thresholds: platformValue,
          has_vendor_override: hasOverride,
          updated_at: vendorRow?.updated_at ?? platformRow?.updated_at ?? null,
        });
      }

      return json(200, {
        scope: "platform",
        vendor_id: null,
        thresholds: platformValue,
        updated_at: platformRow?.updated_at ?? null,
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

      const row = {
        setting_key: SETTING_KEY,
        setting_value: value,
        scope,
        vendor_id: vendorId,
        updated_by: userId,
      };
      const conflictTarget = "setting_key,scope,vendor_id";
      const { data, error } = await adminClient
        .from("system_settings")
        .upsert(row, { onConflict: conflictTarget })
        .select("setting_value, updated_at")
        .single();
      if (error) return json(500, { error: "save_failed", detail: error.message });

      await adminClient.from("admin_actions").insert({
        admin_user_id: userId,
        action_type: "update_setting",
        target_user_id: vendorId,
        action_notes: `Updated escrow alert thresholds (scope=${scope}${vendorId ? `, vendor=${vendorId}` : ""}): ${JSON.stringify(parsed.value)}`,
      });

      return json(200, {
        scope,
        vendor_id: vendorId,
        thresholds: { ...DEFAULTS, ...((data?.setting_value as Record<string, unknown>) ?? {}) },
        updated_at: data?.updated_at ?? null,
      });
    }

    if (req.method === "DELETE" && scope === "vendor") {
      // Remove a vendor override so the vendor falls back to platform.
      const { error } = await adminClient
        .from("system_settings")
        .delete()
        .eq("setting_key", SETTING_KEY)
        .eq("scope", "vendor")
        .eq("vendor_id", vendorId);
      if (error) return json(500, { error: "delete_failed", detail: error.message });
      await adminClient.from("admin_actions").insert({
        admin_user_id: userId,
        action_type: "update_setting",
        target_user_id: vendorId,
        action_notes: `Cleared vendor escrow alert override (vendor=${vendorId})`,
      });
      return json(200, { ok: true, scope: "vendor", vendor_id: vendorId });
    }

    return json(405, { error: "method_not_allowed" });
  } catch (err) {
    const authResp = authErrorResponse(err, corsHeaders);
    if (authResp) return authResp;
    console.error("[admin-escrow-alert-settings] unexpected", err);
    return json(500, { error: "internal_error" });
  }
});