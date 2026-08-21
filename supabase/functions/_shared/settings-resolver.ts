// Shared resolver: fetch effective settings for a vendor.
// Falls back to defaults when the DB is empty.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { computePricing, DEFAULT_PRICING_CONFIG as PRICING_FALLBACK } from "./pricing.ts";
import { checkPricingInvariant } from "./pricing-invariant.ts";

export interface EffectivePricingConfig {
  min_platform_fee: number;
  max_total_service_fee: number;
  max_platform_fee: number;
  platform_fee_rate: number;
  platform_fee_flat: number;
  tier_rates: Array<{ upto: number | null; rate: number }>;
  /** Vendor plan whose escrow rate was applied ('verified' | 'starter' | 'growth'). */
  vendor_plan_code?: string;
}

/**
 * Re-exported disaster-recovery fallback. Rates are DEFINED only in the
 * `pricing.*` rows of `system_settings`; this mirrors the seeded platform
 * rows so a failed read degrades to an identical price.
 * See docs/pricing-source-of-truth.md.
 */
export const DEFAULT_PRICING_CONFIG: EffectivePricingConfig = PRICING_FALLBACK;

/**
 * Load-time economic guard: a stored config that would net SafeDeal a
 * loss-making (or negative-margin) platform fee must never reach charging.
 * Falls back to the platform defaults and raises a deduped system alert.
 */
async function guardPricingConfig(
  cfg: EffectivePricingConfig,
  vendorId: string,
): Promise<EffectivePricingConfig> {
  const verdict = checkPricingInvariant(cfg, (amount, c) => computePricing(amount, "NGN", "local", c));
  if (verdict.ok) return cfg;
  console.error("[settings-resolver] pricing invariant violated", { vendorId, verdict });
  try {
    await admin().rpc("raise_system_alert", {
      _dedupe_key: `pricing_invariant_violation:${vendorId}`,
      _type: "security_alert",
      _title: "Pricing configuration violates the economic invariant",
      _message:
        `${verdict.message} Charging fell back to the platform default rate card for this vendor.`,
      _metadata: {
        vendor_id: vendorId,
        failing_amount: verdict.failing_amount,
        platform_fee_at_failure: verdict.platform_fee_at_failure,
        rejected_config: cfg,
      },
    });
  } catch (e) {
    console.error("[settings-resolver] raise_system_alert failed", e);
  }
  return DEFAULT_PRICING_CONFIG;
}

/**
 * Vendor plans buy a cheaper escrow rate (Growth = 1.5% instead of 2%).
 * The plan rate is applied ONLY when it improves on the resolved rate, and
 * only for the flat (G3) fee model. Legacy tiered configs are untouched.
 */
async function applyVendorPlanRate(
  cfg: EffectivePricingConfig,
  vendorId: string,
): Promise<EffectivePricingConfig> {
  try {
    const client = admin();
    const { data: planCode } = await client.rpc("effective_vendor_plan_code", { _user_id: vendorId });
    const code = typeof planCode === "string" ? planCode : "verified";
    if (!code || code === "verified") return { ...cfg, vendor_plan_code: "verified" };
    const { data: plan } = await client
      .from("vendor_plans")
      .select("code, escrow_fee_rate")
      .eq("code", code)
      .maybeSingle();
    const rate = plan?.escrow_fee_rate != null ? Number(plan.escrow_fee_rate) : NaN;
    if (!Number.isFinite(rate) || rate <= 0 || rate >= cfg.platform_fee_rate) {
      return { ...cfg, vendor_plan_code: code };
    }
    return { ...cfg, platform_fee_rate: rate, vendor_plan_code: code };
  } catch (_e) {
    return cfg;
  }
}

function admin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

export async function loadPricingConfig(vendorId: string | null | undefined): Promise<EffectivePricingConfig> {
  if (!vendorId) return DEFAULT_PRICING_CONFIG;
  // Feature flag: one-flip rollback to constants without redeploy.
  if ((Deno.env.get("SETTINGS_RESOLVER_ENABLED") ?? "true").toLowerCase() === "false") {
    return DEFAULT_PRICING_CONFIG;
  }
  try {
    const { data, error } = await admin().rpc("get_effective_settings", {
      _vendor_id: vendorId,
      _keys: [
        "pricing.min_platform_fee_ngn",
        "pricing.max_total_service_fee_ngn",
        "pricing.tier_rates",
        "pricing.platform_fee_rate",
        "pricing.platform_fee_flat_ngn",
        "pricing.max_platform_fee_ngn",
      ],
    });
    if (error || !data) return DEFAULT_PRICING_CONFIG;
    const map: Record<string, unknown> = {};
    (data as Array<{ setting_key: string; setting_value: unknown }>).forEach((r) => {
      map[r.setting_key] = r.setting_value;
    });
    const resolved: EffectivePricingConfig = {
      min_platform_fee: numOr(map["pricing.min_platform_fee_ngn"], DEFAULT_PRICING_CONFIG.min_platform_fee),
      max_total_service_fee: numOr(map["pricing.max_total_service_fee_ngn"], DEFAULT_PRICING_CONFIG.max_total_service_fee),
      max_platform_fee: numOr(map["pricing.max_platform_fee_ngn"], DEFAULT_PRICING_CONFIG.max_platform_fee),
      platform_fee_rate: numOr(map["pricing.platform_fee_rate"], DEFAULT_PRICING_CONFIG.platform_fee_rate),
      platform_fee_flat: numOr(map["pricing.platform_fee_flat_ngn"], DEFAULT_PRICING_CONFIG.platform_fee_flat),
      tier_rates: Array.isArray(map["pricing.tier_rates"])
        ? (map["pricing.tier_rates"] as EffectivePricingConfig["tier_rates"])
        : DEFAULT_PRICING_CONFIG.tier_rates,
    };
    const withPlan = await applyVendorPlanRate(resolved, vendorId);
    return await guardPricingConfig(withPlan, vendorId);
  } catch (_e) {
    return DEFAULT_PRICING_CONFIG;
  }
}

/**
 * Resolve the effective timeout (hours) for a vendor and rule type.
 * Falls back to the provided default when no scoped or platform row exists.
 * Rule types: 'seller_fulfillment_timeout' | 'buyer_verification_timeout'.
 */
export async function loadEffectiveTimeoutHours(
  vendorId: string | null | undefined,
  ruleType: "seller_fulfillment_timeout" | "buyer_verification_timeout",
  fallbackHours: number,
): Promise<number> {
  const resolved = await resolveEffectiveTimeoutHours(vendorId, ruleType);
  return resolved ?? fallbackHours;
}

/**
 * Strict form: resolves the configured timeout or returns `null` when no
 * effective setting can be read. Callers that PERSIST a window (rather than
 * narrate one) must use this and fail closed instead of inventing a number.
 */
export async function resolveEffectiveTimeoutHours(
  vendorId: string | null | undefined,
  ruleType: "seller_fulfillment_timeout" | "buyer_verification_timeout",
): Promise<number | null> {
  if (!vendorId) return null;
  if ((Deno.env.get("SETTINGS_RESOLVER_ENABLED") ?? "true").toLowerCase() === "false") {
    return null;
  }
  try {
    const { data, error } = await admin().rpc("get_effective_timeout", {
      _vendor_id: vendorId,
      _rule: ruleType,
    });
    if (error || data == null) return null;
    const n = typeof data === "string" ? Number(data) : (data as number);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Resolve the effective Auto-Release configuration for a vendor.
 * Returns `{ enabled, window_hours, enabled_by, enabled_at }`.
 *
 * `enabled` is `false` by default (manual release from the Payouts page is
 * the platform's default posture). `window_hours` falls back to 48h.
 * `enabled_by` / `enabled_at` are stamped by the DB trigger
 * `track_auto_release_toggle()` and reflect the admin who last flipped
 * the toggle at whichever scope (vendor > platform) is active.
 */
export interface EffectiveAutoRelease {
  enabled: boolean;
  window_hours: number;
  enabled_by: string | null;
  enabled_at: string | null;
  scope: "platform" | "vendor";
}

export async function loadEffectiveAutoRelease(
  vendorId: string | null | undefined,
): Promise<EffectiveAutoRelease> {
  const fallback: EffectiveAutoRelease = {
    enabled: false, window_hours: 48, enabled_by: null, enabled_at: null, scope: "platform",
  };
  try {
    const client = admin();
    // Prefer vendor row, fall back to platform
    const orExpr = vendorId
      ? `scope.eq.platform,and(scope.eq.vendor,vendor_id.eq.${vendorId})`
      : `scope.eq.platform`;
    const { data: rows } = await client
      .from("system_settings")
      .select("scope, vendor_id, setting_value, auto_release_enabled_by, auto_release_enabled_at")
      .eq("setting_key", "escrow.auto_release_enabled")
      .or(orExpr);
    const vendor = (rows ?? []).find((r: any) => r.scope === "vendor" && r.vendor_id === vendorId);
    const platform = (rows ?? []).find((r: any) => r.scope === "platform");
    const effective = vendor ?? platform;
    if (!effective) return fallback;
    // Auto-release moves escrow to the seller on this clock, so it PERSISTS a
    // window rather than narrating one: use the strict resolver and refuse to
    // enable auto-release when no window is configured.
    const window = await resolveEffectiveTimeoutHours(vendorId ?? null, "buyer_verification_timeout");
    if (window === null) {
      return { ...fallback, enabled: false, enabled_by: effective.auto_release_enabled_by ?? null,
        enabled_at: effective.auto_release_enabled_at ?? null, scope: vendor ? "vendor" : "platform" };
    }
    return {
      enabled: Boolean(effective.setting_value),
      window_hours: window,
      enabled_by: effective.auto_release_enabled_by ?? null,
      enabled_at: effective.auto_release_enabled_at ?? null,
      scope: vendor ? "vendor" : "platform",
    };
  } catch (_e) {
    return fallback;
  }
}

function numOr(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}