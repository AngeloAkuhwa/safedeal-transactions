// Admin CRUD for scoped system settings and timeout rules.
// GET  ?vendor_id=... → returns platform + optional vendor overrides
// PUT  { scope, vendor_id?, updates: {key: value}, timeouts?: [{rule_type, hours}], reason, apply_to_all_vendors? }
import { requireAdmin, authErrorResponse , requirePermission} from "../_shared/auth.ts";
import { clampSetting } from "../_shared/settings-catalog.ts";
import { logAdminAction } from "../_shared/audit.ts";
import { computePricing } from "../_shared/pricing.ts";
import { checkPricingInvariant } from "../_shared/pricing-invariant.ts";

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

/**
 * Keys whose values change money behaviour. Writing any of these requires
 * `financial_controls.configure` ON TOP of the general settings write
 * permission. Read access is unchanged.
 */
function isFinancialKey(key: string): boolean {
  return key.startsWith("pricing.") || key === "fees.refund_policy";
}

const PRICING_KEYS = [
  "pricing.min_platform_fee_ngn",
  "pricing.max_total_service_fee_ngn",
  "pricing.tier_rates",
  "pricing.platform_fee_rate",
  "pricing.platform_fee_flat_ngn",
  "pricing.max_platform_fee_ngn",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // GET is gated on the view permission; PUT escalates below.
    const ctx = await requirePermission(req, "platform_configuration.view");
    const { userId, adminClient } = ctx;
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

      // ── Two-tier write gate ────────────────────────────────────────────
      // Tier 1: any settings write needs the general configure permission
      // (a view-only role must never be able to rewrite platform settings).
      await requirePermission(req, "platform_configuration.configure", ctx);

      const scope: "platform" | "vendor" = body?.scope === "vendor" ? "vendor" : "platform";
      const vendorId: string | null = scope === "vendor" ? (body?.vendor_id ?? null) : null;
      const reason: string = String(body?.reason ?? "").trim();
      const updates: Record<string, unknown> = body?.updates ?? {};
      const timeouts: Array<{ rule_type: string; hours: number; is_active?: boolean }> = Array.isArray(body?.timeouts) ? body.timeouts : [];
      const applyToAll: boolean = Boolean(body?.apply_to_all_vendors);

      if (!reason || reason.length < 3) return json(400, { error: "reason_required" });
      if (scope === "vendor" && !vendorId) return json(400, { error: "vendor_id_required" });

      // Tier 2: money-behaviour keys additionally need the financial permission.
      const financialKeys = Object.keys(updates).filter(isFinancialKey);
      if (financialKeys.length) {
        try {
          await requirePermission(req, "financial_controls.configure", ctx);
        } catch {
          return json(403, {
            error: "financial_permission_required",
            required_permission: "financial_controls.configure",
            keys: financialKeys,
          });
        }
      }

      // Capture BEFORE snapshot for diff. Only for the exact (key, scope, vendor) rows we're about to touch.
      const beforeSnapshot: Record<string, unknown> = {};
      const updateKeys = Object.keys(updates);
      if (updateKeys.length) {
        let priorQ = adminClient
          .from("system_settings")
          .select("setting_key, setting_value, vendor_id")
          .in("setting_key", updateKeys)
          .eq("scope", scope);
        priorQ = vendorId ? priorQ.eq("vendor_id", vendorId) : priorQ.is("vendor_id", null);
        const { data: prior } = await priorQ;
        for (const r of prior ?? []) {
          beforeSnapshot[(r as any).setting_key] = (r as any).setting_value;
        }
        for (const k of updateKeys) if (!(k in beforeSnapshot)) beforeSnapshot[k] = null;
      }
      const timeoutBefore: Record<string, unknown> = {};
      if (timeouts.length) {
        let tq = adminClient
          .from("timeout_rules")
          .select("rule_type, hours_until_trigger, is_active, vendor_id")
          .in("rule_type", timeouts.map(t => t.rule_type))
          .eq("scope", scope);
        tq = vendorId ? tq.eq("vendor_id", vendorId) : tq.is("vendor_id", null);
        const { data: prior } = await tq;
        for (const r of prior ?? []) {
          timeoutBefore[(r as any).rule_type] = { hours: (r as any).hours_until_trigger, is_active: (r as any).is_active };
        }
      }

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

      // ── Economic invariant (save-time) ────────────────────────────────
      // Rates, floor and cap are coupled: validate the resolved card as a
      // whole (proposed values merged over the currently effective ones).
      if (Object.keys(updates).some((k) => (PRICING_KEYS as readonly string[]).includes(k))) {
        const effective: Record<string, unknown> = {};
        const { data: effRows } = await adminClient.rpc("get_effective_settings", {
          _vendor_id: vendorId,
          _keys: PRICING_KEYS as unknown as string[],
        });
        (effRows ?? []).forEach((r: { setting_key: string; setting_value: unknown }) => {
          effective[r.setting_key] = r.setting_value;
        });
        const merged = { ...effective, ...Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value])) };
        const candidate = {
          min_platform_fee: Number(merged["pricing.min_platform_fee_ngn"]),
          max_total_service_fee: Number(merged["pricing.max_total_service_fee_ngn"]),
          tier_rates: merged["pricing.tier_rates"] as Array<{ upto: number | null; rate: number }>,
          platform_fee_rate: merged["pricing.platform_fee_rate"] != null ? Number(merged["pricing.platform_fee_rate"]) : undefined,
          platform_fee_flat: merged["pricing.platform_fee_flat_ngn"] != null ? Number(merged["pricing.platform_fee_flat_ngn"]) : undefined,
          max_platform_fee: merged["pricing.max_platform_fee_ngn"] != null ? Number(merged["pricing.max_platform_fee_ngn"]) : undefined,
        };
        const verdict = checkPricingInvariant(
          candidate,
          (amount, c) => computePricing(amount, "NGN", "local", c),
        );
        if (!verdict.ok) {
          return json(400, {
            error: "pricing_invariant_violated",
            message: verdict.message,
            failing_amount: verdict.failing_amount,
            platform_fee_at_failure: verdict.platform_fee_at_failure,
          });
        }
      }

      // Manual upsert: the unique index uses COALESCE(vendor_id, '000...'),
      // which PostgREST/ON CONFLICT can't target by column list. Do a
      // scoped select then update-or-insert per row.
      for (const row of rows) {
        let existingQuery = adminClient
          .from("system_settings")
          .select("id")
          .eq("setting_key", row.setting_key)
          .eq("scope", row.scope);
        existingQuery = row.vendor_id
          ? existingQuery.eq("vendor_id", row.vendor_id)
          : existingQuery.is("vendor_id", null);
        const { data: existing, error: exErr } = await existingQuery.maybeSingle();
        if (exErr) return json(500, { error: "save_failed", detail: exErr.message });
        if (existing?.id) {
          const { error: updErr } = await adminClient
            .from("system_settings")
            .update({ setting_value: row.setting_value, updated_by: row.updated_by, updated_at: row.updated_at })
            .eq("id", existing.id);
          if (updErr) return json(500, { error: "save_failed", detail: updErr.message });
        } else {
          const { error: insErr } = await adminClient.from("system_settings").insert(row);
          if (insErr) return json(500, { error: "save_failed", detail: insErr.message });
        }
      }

      // Timeouts
      for (const t of timeouts) {
        // (unchanged)
        const payload = {
          rule_type: t.rule_type,
          hours_until_trigger: t.hours,
          is_active: t.is_active ?? true,
          scope,
          vendor_id: vendorId,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        };
        let q = adminClient
          .from("timeout_rules")
          .select("id")
          .eq("rule_type", t.rule_type)
          .eq("scope", scope);
        q = vendorId ? q.eq("vendor_id", vendorId) : q.is("vendor_id", null);
        const { data: existing, error: exErr } = await q.maybeSingle();
        if (exErr) return json(500, { error: "timeout_save_failed", detail: exErr.message });
        const { error: tUpErr } = existing?.id
          ? await adminClient.from("timeout_rules").update(payload).eq("id", existing.id)
          : await adminClient.from("timeout_rules").insert(payload);
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
      const afterSettings: Record<string, unknown> = {};
      // Stamp the reason onto the version row the DB trigger just appended
      // for each pricing key (effective-dated rate history).
      for (const key of PRICING_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
        const { error: annErr } = await adminClient.rpc("annotate_setting_version_reason", {
          _setting_key: key,
          _scope: scope,
          _vendor_id: vendorId,
          _reason: reason,
        });
        if (annErr) console.error("[admin-system-settings] annotate reason failed", key, annErr.message);
      }
      for (const [k, v] of Object.entries(updates)) {
        const c = clampSetting(k, v, scope);
        afterSettings[k] = c.ok ? c.value : v;
      }
      const timeoutAfter: Record<string, unknown> = {};
      for (const t of timeouts) {
        timeoutAfter[t.rule_type] = { hours: t.hours, is_active: t.is_active ?? true };
      }
      // One audit entry PER changed key, so the audit trail is filterable by
      // the exact setting that moved (before/after scoped to that key).
      for (const [key, afterValue] of Object.entries(afterSettings)) {
        const beforeValue = beforeSnapshot[key] ?? null;
        if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) continue;
        await logAdminAction(adminClient, {
          actorId: userId,
          action: "update_setting",
          targetType: vendorId ? "vendor" : "setting",
          targetId: vendorId,
          reason,
          before: { [key]: beforeValue },
          after: { [key]: afterValue },
          metadata: {
            scope,
            vendor_id: vendorId,
            apply_to_all_vendors: applyToAll,
            setting_key: key,
            is_financial_key: isFinancialKey(key),
          },
          mirrorToAuditLogs: true,
        });
      }
      for (const [ruleType, afterValue] of Object.entries(timeoutAfter)) {
        const beforeValue = timeoutBefore[ruleType] ?? null;
        if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) continue;
        await logAdminAction(adminClient, {
          actorId: userId,
          action: "update_setting",
          targetType: vendorId ? "vendor" : "setting",
          targetId: vendorId,
          reason,
          before: { [`timeout.${ruleType}`]: beforeValue },
          after: { [`timeout.${ruleType}`]: afterValue },
          metadata: { scope, vendor_id: vendorId, apply_to_all_vendors: applyToAll, rule_type: ruleType },
          mirrorToAuditLogs: true,
        });
      }

      // Dedicated toggle_auto_release event. One row per flip so audit
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