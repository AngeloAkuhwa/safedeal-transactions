/**
 * SafeDeal Pricing Policy Helper
 *
 * Computes buyer-facing service fees dynamically based on:
 * 1. Paystack's actual local NGN fee rules
 * 2. SafeDeal's platform fee policy
 *
 * Definitions:
 * - item_amount: agreed item price BEFORE buyer-facing service fees
 * - platform_fee_amount: what SafeDeal earns (2% + ₦100, capped at ₦5,000)
 * - service_fee_amount: paystack_fee_amount + platform_fee_amount
 *
 * Fee generation G3 ("free forever, paid to grow"):
 *   platform fee = min(max_platform_fee, platform_fee_rate × item + platform_fee_flat)
 * Growth-plan vendors get a reduced `platform_fee_rate` (1.5%) resolved per
 * vendor in `settings-resolver.ts`.
 *
 * The legacy tiered generation (G2) is still honoured when a config supplies
 * `tier_rates` WITHOUT `platform_fee_rate`, so historical/vendor configs and
 * snapshot reconstruction keep producing their original numbers.
 */

export interface PricingConfigOverride {
  min_platform_fee?: number;
  max_total_service_fee?: number;
  /** G3: hard ceiling on the SafeDeal platform fee (₦). */
  max_platform_fee?: number;
  /** G3: percentage component of the platform fee (e.g. 0.02). */
  platform_fee_rate?: number;
  /** G3: flat component of the platform fee (₦). */
  platform_fee_flat?: number;
  /** G2 (legacy): tiered all-in rate table. */
  tier_rates?: Array<{ upto: number | null; rate: number }>;
}

/**
 * DISASTER-RECOVERY FALLBACK ONLY. Rates are DEFINED in the `pricing.*`
 * rows of `system_settings`, never here. Used when the resolver cannot read
 * a config or rejects a stored one via the economic invariant. Must equal the
 * seeded platform rows (see docs/pricing-source-of-truth.md and the
 * fallback-parity contract test).
 */
export const DEFAULT_PRICING_CONFIG: Required<PricingConfigOverride> = {
  min_platform_fee: 0,
  // Absolute guardrail only: platform cap (5,000) + Paystack local cap (2,000).
  max_total_service_fee: 7000,
  max_platform_fee: 5000,
  platform_fee_rate: 0.02,
  platform_fee_flat: 100,
  tier_rates: [],
};

const MIN_PLATFORM_FEE = DEFAULT_PRICING_CONFIG.min_platform_fee;
const MAX_TOTAL_FEE = DEFAULT_PRICING_CONFIG.max_total_service_fee;

export interface PricingResult {
  currency_code: string;
  item_amount: number;
  paystack_fee_amount: number;
  platform_fee_amount: number;
  service_fee_amount: number;
  service_fee_rate: number;
  total_amount: number;
  is_floored: boolean;
  is_capped: boolean;
  /** Which ceiling bound this calculation: the SafeDeal-only cap or the combined cap. */
  capped_by: "safedeal_fee" | "total_service_fee" | null;
  /** The amount of the ceiling named by `capped_by`. */
  applied_cap_amount: number | null;
  non_refundable: boolean;
}

type PricingMode = "local" | "international";

/**
 * Paystack local NGN fee rules (current as of 2025):
 * - 1.5% + ₦100
 * - ₦100 flat fee waived for transactions under ₦2,500
 * - Local transaction fees capped at ₦2,000
 */
function computePaystackLocalFee(itemAmount: number): number {
  const percentageFee = itemAmount * 0.015;
  const flatFee = itemAmount < 2500 ? 0 : 100;
  const rawFee = percentageFee + flatFee;
  return Math.min(Math.round(rawFee), 2000);
}

/**
 * Paystack international fee rules (stubbed for future use):
 * - Mastercard/Visa/Verve: 3.9% + ₦100
 */
function computePaystackInternationalFee(itemAmount: number): number {
  const percentageFee = itemAmount * 0.039;
  const flatFee = 100;
  return Math.round(percentageFee + flatFee);
}

function tierRateFromConfig(itemAmount: number, tiers: Array<{ upto: number | null; rate: number }>): number {
  for (const t of tiers) {
    if (t.upto == null || itemAmount <= t.upto) return t.rate;
  }
  return tiers[tiers.length - 1]?.rate ?? 0.025;
}

/** A config is legacy-tiered when it names tiers but no flat-model rate. */
export function isLegacyTieredConfig(config?: PricingConfigOverride): boolean {
  return Boolean(
    config && config.platform_fee_rate == null && Array.isArray(config.tier_rates) && config.tier_rates.length > 0,
  );
}

/**
 * Compute full pricing breakdown for a transaction.
 */
export function computePricing(
  itemAmount: number,
  currencyCode: string = "NGN",
  mode: PricingMode = "local",
  config?: PricingConfigOverride,
): PricingResult {
  const minPlatformFee = config?.min_platform_fee ?? MIN_PLATFORM_FEE;
  const maxTotalFee = config?.max_total_service_fee ?? MAX_TOTAL_FEE;
  if (itemAmount <= 0) {
    return {
      currency_code: currencyCode,
      item_amount: 0,
      paystack_fee_amount: 0,
      platform_fee_amount: 0,
      service_fee_amount: 0,
      service_fee_rate: 0,
      total_amount: 0,
      is_floored: false,
      is_capped: false,
      capped_by: null,
      applied_cap_amount: null,
      non_refundable: true,
    };
  }

  // Step 1: Compute Paystack fee
  const paystackFee =
    mode === "international"
      ? computePaystackInternationalFee(itemAmount)
      : computePaystackLocalFee(itemAmount);

  // Step 2: Raw SafeDeal platform fee before the total-service-fee ceiling
  let rawPlatformFee: number;
  let platformCapBound = false;
  if (isLegacyTieredConfig(config)) {
    // G2 legacy: all-in tier rate, Paystack cost absorbed inside the rate.
    const baseTierRate = tierRateFromConfig(itemAmount, config!.tier_rates!);
    const tierRate = mode === "international" ? Math.max(baseTierRate, 0.039) : baseTierRate;
    rawPlatformFee = Math.max(minPlatformFee, Math.round(itemAmount * tierRate) - paystackFee);
  } else {
    // G3: 2% + ₦100, capped.
    const rate = config?.platform_fee_rate ?? DEFAULT_PRICING_CONFIG.platform_fee_rate;
    const flat = config?.platform_fee_flat ?? DEFAULT_PRICING_CONFIG.platform_fee_flat;
    const platformCap = config?.max_platform_fee ?? DEFAULT_PRICING_CONFIG.max_platform_fee;
    const uncapped = Math.max(minPlatformFee, Math.round(itemAmount * rate) + flat);
    platformCapBound = uncapped > platformCap;
    rawPlatformFee = Math.min(uncapped, platformCap);
  }

  // Step 3: Total service fee, clipped by the absolute ceiling
  const rawServiceFee = paystackFee + rawPlatformFee;
  const serviceFeeAmount = Math.min(rawServiceFee, maxTotalFee);

  // Step 4: Recalculate platform fee after the ceiling
  const platformFee = Math.max(serviceFeeAmount - paystackFee, 0);

  const is_floored = rawPlatformFee === minPlatformFee;
  const totalCapBound = rawServiceFee > maxTotalFee;
  const is_capped = platformCapBound || totalCapBound;
  const capped_by: "safedeal_fee" | "total_service_fee" | null = totalCapBound
    ? "total_service_fee"
    : platformCapBound
      ? "safedeal_fee"
      : null;
  const platformCapForReport = config?.max_platform_fee ?? DEFAULT_PRICING_CONFIG.max_platform_fee;

  // Step 5: Effective rate
  const serviceFeeRate = serviceFeeAmount / itemAmount;

  return {
    currency_code: currencyCode,
    item_amount: itemAmount,
    paystack_fee_amount: paystackFee,
    platform_fee_amount: platformFee,
    service_fee_amount: serviceFeeAmount,
    service_fee_rate: Math.round(serviceFeeRate * 10000) / 10000,
    total_amount: itemAmount + serviceFeeAmount,
    is_floored,
    is_capped,
    capped_by,
    applied_cap_amount:
      capped_by === "total_service_fee"
        ? maxTotalFee
        : capped_by === "safedeal_fee"
          ? platformCapForReport
          : null,
    non_refundable: true,
  };
}
