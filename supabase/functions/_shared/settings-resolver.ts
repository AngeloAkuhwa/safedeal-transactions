// Shared resolver: fetch effective settings for a vendor.
// Falls back to defaults when the DB is empty.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface EffectivePricingConfig {
  min_platform_fee: number;
  max_total_service_fee: number;
  tier_rates: Array<{ upto: number | null; rate: number }>;
}

export const DEFAULT_PRICING_CONFIG: EffectivePricingConfig = {
  min_platform_fee: 250,
  max_total_service_fee: 2500,
  tier_rates: [
    { upto: 100_000, rate: 0.039 },
    { upto: 500_000, rate: 0.035 },
    { upto: 2_000_000, rate: 0.029 },
    { upto: null, rate: 0.025 },
  ],
};

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
      ],
    });
    if (error || !data) return DEFAULT_PRICING_CONFIG;
    const map: Record<string, unknown> = {};
    (data as Array<{ setting_key: string; setting_value: unknown }>).forEach((r) => {
      map[r.setting_key] = r.setting_value;
    });
    return {
      min_platform_fee: numOr(map["pricing.min_platform_fee_ngn"], DEFAULT_PRICING_CONFIG.min_platform_fee),
      max_total_service_fee: numOr(map["pricing.max_total_service_fee_ngn"], DEFAULT_PRICING_CONFIG.max_total_service_fee),
      tier_rates: Array.isArray(map["pricing.tier_rates"])
        ? (map["pricing.tier_rates"] as EffectivePricingConfig["tier_rates"])
        : DEFAULT_PRICING_CONFIG.tier_rates,
    };
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
  if (!vendorId) return fallbackHours;
  if ((Deno.env.get("SETTINGS_RESOLVER_ENABLED") ?? "true").toLowerCase() === "false") {
    return fallbackHours;
  }
  try {
    const { data, error } = await admin().rpc("get_effective_timeout", {
      _vendor_id: vendorId,
      _rule: ruleType,
    });
    if (error || data == null) return fallbackHours;
    const n = typeof data === "string" ? Number(data) : (data as number);
    return Number.isFinite(n) && n > 0 ? n : fallbackHours;
  } catch (_e) {
    return fallbackHours;
  }
}

function numOr(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}