// Admin CRUD for scoped system settings and timeout rules.
// GET  ?vendor_id=... → returns platform + optional vendor overrides
// PUT  { scope, vendor_id?, updates: {key: value}, timeouts?: [{rule_type, hours}], reason, apply_to_all_vendors? }
import { requireAdmin, authErrorResponse } from "../_shared/auth.ts";
import { clampSetting } from "../_shared/settings-catalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, adminClient } = await requireAdmin(req);
    const url = new URL(req.url);

    if (req.method === "GET") {
      const vendorId = url.searchParams.get("vendor_id");

      const { data: settings, error: sErr } = await adminClient
        .from("system_settings")
        .select("setting_key, setting_value, scope, vendor_id, is_overridable, updated_at, updated_by, auto_release_enabled_by, auto_release_enabled_at, auto_release_previous_value")
        .or(vendorId
          ? `scope.eq.platform,and(scope.eq.vendor,vendor_id.eq.${vendorId})`
          : `scope.eq.platform`);
      if (sErr) return json(500, { error: "fetch_settings_failed", detail: sErr.message });

      const { data: timeouts, error: tErr } = await adminClient
        .from("timeout_rules")
        .select("rule_type, hours_until_trigger, is_active, scope, vendor_id, updated_at")
        .or(vendorId
          ? `scope.eq.platform,and(scope.eq.vendor,vendor_id.eq.${vendorId})`
          : `scope.eq.platform`);
      if (tErr) return json(500, { error: "fetch_timeouts_failed", detail: tErr.message });

      // Aggregate vendor-override count per key (platform view)
      const { data: overrides } = await adminClient
        .from("system_settings")
        .select("setting_key, vendor_id, setting_value, updated_at, updated_by")
        .eq("scope", "vendor");
      const overrideCounts: Record<string, number> = {};
      (overrides ?? []).forEach((r: { setting_key: string }) => {
        overrideCounts[r.setting_key] = (overrideCounts[r.setting_key] ?? 0) + 1;
      });

      return json(200, {
        settings,
        timeouts,
        override_counts: overrideCounts,
        vendor_overrides: overrides ?? [],
        vendor_id: vendorId,
      });
    }

    if (req.method === "PUT") {
      let body: any;
      try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

      const scope: "platform" | "vendor" = body?.scope === "vendor" ? "vendor" : "platform";
      const vendorId: string | null = scope === "vendor" ? (body?.vendor_id ?? null) : null;
      const reason: string = String(body?.reason ?? "").trim();
      const updates: Record<string, unknown> = body?.updates ?? {};
      const timeouts: Array<{ rule_type: string; hours: number; is_active?: boolean }> = Array.isArray(body?.timeouts) ? body.timeouts : [];
      const applyToAll: boolean = Boolean(body?.apply_to_all_vendors);

      if (!reason || reason.length < 3) return json(400, { error: "reason_required" });
      if (scope === "vendor" && !vendorId) return json(400, { error: "vendor_id_required" });

      // Enforce non-overridable keys can't be written at vendor scope
      const { data: catalog } = await adminClient
        .from("system_settings")
        .select("setting_key, is_overridable")
        .eq("scope", "platform");
      const overridable = new Map<string, boolean>();
      (catalog ?? []).forEach((r: { setting_key: string; is_overridable: boolean }) => overridable.set(r.setting_key, r.is_overridable));

      const rows: any[] = [];
      for (const [key, value] of Object.entries(updates)) {
        if (scope === "vendor" && overridable.has(key) && overridable.get(key) === false) {
          return json(403, { error: "key_not_overridable", key });
        }
        // Catalog-based clamp + type check
        const c = clampSetting(key, value, scope);
        if (!c.ok) return json(400, { error: c.error, key });
        rows.push({
          setting_key: key,
          setting_value: c.value,
          scope,
          vendor_id: vendorId,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        });
      }

      if (rows.length) {
        const { error: upErr } = await adminClient
          .from("system_settings")
          .upsert(rows, { onConflict: "setting_key,scope,vendor_id" });
        if (upErr) return json(500, { error: "save_failed", detail: upErr.message });
      }

      // Timeouts
      for (const t of timeouts) {
        const { error: tUpErr } = await adminClient
          .from("timeout_rules")
          .upsert({
            rule_type: t.rule_type,
            hours_until_trigger: t.hours,
            is_active: t.is_active ?? true,
            scope,
            vendor_id: vendorId,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          }, { onConflict: "rule_type,scope,vendor_id" });
        if (tUpErr) return json(500, { error: "timeout_save_failed", detail: tUpErr.message });
      }

      // Bulk apply: wipe vendor overrides for affected keys
      if (scope === "platform" && applyToAll && Object.keys(updates).length) {
        const keys = Object.keys(updates);
        await adminClient
          .from("system_settings")
          .delete()
          .in("setting_key", keys)
          .eq("scope", "vendor");
      }

      // Audit
      await adminClient.from("admin_actions").insert({
        admin_user_id: userId,
        target_user_id: vendorId,
        action_type: "update_setting",
        action_notes: JSON.stringify({
          scope, vendor_id: vendorId, reason,
          updates, timeouts, apply_to_all_vendors: applyToAll,
        }),
      });

      // Dedicated toggle_auto_release event — one row per flip so audit
      // history renders a distinct, filterable stream regardless of what
      // else was saved in the same PUT.
      if (Object.prototype.hasOwnProperty.call(updates, "escrow.auto_release_enabled")) {
        const newValue = Boolean(updates["escrow.auto_release_enabled"]);
        // Read the prior value so the event captures both sides of the flip.
        const { data: prior } = await adminClient
          .from("system_settings")
          .select("auto_release_previous_value, setting_value")
          .eq("setting_key", "escrow.auto_release_enabled")
          .eq("scope", scope)
          .is("vendor_id", vendorId as any)
          .maybeSingle();
        await adminClient.from("admin_actions").insert({
          admin_user_id: userId,
          target_user_id: vendorId,
          action_type: "toggle_auto_release",
          action_notes: JSON.stringify({
            scope,
            vendor_id: vendorId,
            new_value: newValue,
            previous_value: prior?.auto_release_previous_value ?? null,
            reason,
          }),
        });
      }

      return json(200, { ok: true });
    }

    return json(405, { error: "method_not_allowed" });
  } catch (err) {
    const authResp = authErrorResponse(err, corsHeaders);
    if (authResp) return authResp;
    console.error("[admin-system-settings] unexpected", err);
    return json(500, { error: "internal_error" });
  }
});