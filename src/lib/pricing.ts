/**
 * Client-side pricing calculator mirroring the server-side logic
 * in supabase/functions/_shared/pricing.ts.
 *
 * Accepts an optional `PricingConfigOverride` so per-vendor overrides from
 * `system_settings` (resolved via the `pricing-config` edge function and the
 * `useEffectivePricingConfig` hook) flow into checkout previews. When no
 * config is provided the platform defaults below are used, keeping legacy
 * callers unchanged.
 */

/**
 * DISASTER-RECOVERY FALLBACK ONLY — this is NOT where rates are defined.
 *
 * The only place a rate is DEFINED is the `pricing.*` rows in
 * `system_settings` (written solely through the admin settings page, resolved
 * vendor-over-platform by `supabase/functions/_shared/settings-resolver.ts`).
 * These literals exist for one case: the resolved config could not be read
 * (network/DB failure, or config rejected by the economic invariant), where
 * charging an *identical* price beats charging a silently different one.
 * They MUST equal the seeded platform rows — enforced by
 * `src/__tests__/pricing-fallback-parity.contract.test.ts` and mirrored in
 * `supabase/functions/_shared/settings-resolver.ts` (DEFAULT_PRICING_CONFIG).
 * See docs/pricing-source-of-truth.md.
 */
export const FALLBACK_PRICING_CONFIG: Required<PricingConfigOverride> = {
  min_platform_fee: 250,
  max_total_service_fee: 2500,
  tier_rates: [
    { upto: 100_000, rate: 0.039 },
    { upto: 500_000, rate: 0.035 },
    { upto: 2_000_000, rate: 0.029 },
    { upto: null, rate: 0.025 },
  ],
};

/** Derived aliases kept for existing call sites; no independent definition. */
export const DEFAULT_MIN_PLATFORM_FEE = FALLBACK_PRICING_CONFIG.min_platform_fee;
export const DEFAULT_MAX_TOTAL_FEE = FALLBACK_PRICING_CONFIG.max_total_service_fee;

export interface PricingConfigOverride {
  min_platform_fee?: number;
  max_total_service_fee?: number;
  tier_rates?: Array<{ upto: number | null; rate: number }>;
}

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
  non_refundable: boolean;
}

function computePaystackLocalFee(itemAmount: number): number {
  const percentageFee = itemAmount * 0.015;
  const flatFee = itemAmount < 2500 ? 0 : 100;
  const rawFee = percentageFee + flatFee;
  return Math.min(Math.round(rawFee), 2000);
}

function tierRate(itemAmount: number, tiers: Array<{ upto: number | null; rate: number }>): number {
  for (const t of tiers) {
    if (t.upto == null || itemAmount <= t.upto) return t.rate;
  }
  return tiers[tiers.length - 1]?.rate ?? 0.025;
}

export function computePricing(
  itemAmount: number,
  currencyCode: string = "NGN",
  config?: PricingConfigOverride,
): PricingResult {
  const minPlatformFee = config?.min_platform_fee ?? FALLBACK_PRICING_CONFIG.min_platform_fee;
  const maxTotalFee = config?.max_total_service_fee ?? FALLBACK_PRICING_CONFIG.max_total_service_fee;
  const tiers = config?.tier_rates ?? FALLBACK_PRICING_CONFIG.tier_rates;
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
      non_refundable: true,
    };
  }

  const paystackFee = computePaystackLocalFee(itemAmount);
  const rate = tierRate(itemAmount, tiers);

  const rawPlatformFee = Math.max(minPlatformFee, Math.round(itemAmount * rate) - paystackFee);
  const rawServiceFee = paystackFee + rawPlatformFee;
  const serviceFeeAmount = Math.min(rawServiceFee, maxTotalFee);
  const platformFee = Math.max(serviceFeeAmount - paystackFee, 0);

  const is_floored = rawPlatformFee === minPlatformFee;
  const is_capped = rawServiceFee > maxTotalFee;

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
    non_refundable: true,
  };
}

export interface FeeBreakdownInput {
  itemAmount: number;
  config?: PricingConfigOverride;
}

/**
 * Produce a plain-language description of how a fee was derived, computed
 * from the actual tier rate, cap and floor inputs used by `computePricing`
 * (never hardcoded prose about rates/amounts).
 */
export function describeFeeBreakdown(input: FeeBreakdownInput, result: PricingResult): string {
  const minPlatformFee = input.config?.min_platform_fee ?? FALLBACK_PRICING_CONFIG.min_platform_fee;
  const maxTotalFee = input.config?.max_total_service_fee ?? FALLBACK_PRICING_CONFIG.max_total_service_fee;
  const tiers = input.config?.tier_rates ?? FALLBACK_PRICING_CONFIG.tier_rates;
  const rate = tierRate(input.itemAmount, tiers);
  const ratePct = (rate * 100).toFixed(1);

  if (result.is_capped) {
    return `This order's fee was capped at the maximum service fee of ${maxTotalFee.toLocaleString()} ${result.currency_code}. The standard ${ratePct}% tier rate would have produced a higher amount, so the cap applied instead.`;
  }

  if (result.is_floored) {
    return `The minimum platform fee of ${minPlatformFee.toLocaleString()} ${result.currency_code} applied because the calculated fee for this order amount fell below it.`;
  }

  return `A ${ratePct}% service fee rate applies to orders of this size, giving a total service fee of ${result.service_fee_amount.toLocaleString()} ${result.currency_code} on an item amount of ${input.itemAmount.toLocaleString()} ${result.currency_code}.`;
}
