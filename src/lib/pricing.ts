/**
 * Client-side pricing calculator mirroring the server-side logic
 * in supabase/functions/_shared/pricing.ts.
 *
 * Accepts an optional `PricingConfigOverride` so per-vendor overrides from
 * `system_settings` (resolved via the `pricing-config` edge function and the
 * `useEffectivePricingConfig` hook) flow into checkout previews. When no
 * config is provided the platform defaults below are used.
 *
 * Fee generation G3 ("free forever, paid to grow"):
 *   platform fee = min(max_platform_fee, platform_fee_rate × item + platform_fee_flat)
 * Legacy tiered configs (G2) are still honoured when `tier_rates` is supplied
 * without `platform_fee_rate`.
 */

/**
 * DISASTER-RECOVERY FALLBACK ONLY. This is NOT where rates are defined.
 *
 * The only place a rate is DEFINED is the `pricing.*` rows in
 * `system_settings` (written solely through the admin settings page, resolved
 * vendor-over-platform by `supabase/functions/_shared/settings-resolver.ts`).
 * These literals exist for one case: the resolved config could not be read
 * (network/DB failure, or config rejected by the economic invariant), where
 * charging an *identical* price beats charging a silently different one.
 * They MUST equal the seeded platform rows. Enforced by
 * `src/__tests__/pricing-fallback-parity.contract.test.ts` and mirrored in
 * `supabase/functions/_shared/pricing.ts` (DEFAULT_PRICING_CONFIG).
 * See docs/pricing-source-of-truth.md.
 */
export const FALLBACK_PRICING_CONFIG: Required<PricingConfigOverride> = {
  min_platform_fee: 0,
  // Absolute guardrail only: platform cap (5,000) + Paystack local cap (2,000).
  max_total_service_fee: 7000,
  max_platform_fee: 5000,
  platform_fee_rate: 0.02,
  platform_fee_flat: 100,
  tier_rates: [],
};

/** Derived aliases kept for existing call sites; no independent definition. */
export const DEFAULT_MIN_PLATFORM_FEE = FALLBACK_PRICING_CONFIG.min_platform_fee;
export const DEFAULT_MAX_TOTAL_FEE = FALLBACK_PRICING_CONFIG.max_total_service_fee;
export const DEFAULT_PLATFORM_FEE_RATE = FALLBACK_PRICING_CONFIG.platform_fee_rate;
export const DEFAULT_PLATFORM_FEE_FLAT = FALLBACK_PRICING_CONFIG.platform_fee_flat;
export const DEFAULT_MAX_PLATFORM_FEE = FALLBACK_PRICING_CONFIG.max_platform_fee;

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
  /**
   * Which ceiling actually bound this calculation:
   *  - "safedeal_fee": the SafeDeal-only ceiling (`max_platform_fee`)
   *  - "total_service_fee": the combined SafeDeal + processing ceiling
   *    (`max_total_service_fee`)
   * `null` when nothing was capped. UI must name the cap it displays.
   */
  capped_by: "safedeal_fee" | "total_service_fee" | null;
  /** The amount of the ceiling named by `capped_by`. */
  applied_cap_amount: number | null;
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

/** A config is legacy-tiered when it names tiers but no flat-model rate. */
export function isLegacyTieredConfig(config?: PricingConfigOverride): boolean {
  return Boolean(
    config && config.platform_fee_rate == null && Array.isArray(config.tier_rates) && config.tier_rates.length > 0,
  );
}

export function computePricing(
  itemAmount: number,
  currencyCode: string = "NGN",
  config?: PricingConfigOverride,
): PricingResult {
  const minPlatformFee = config?.min_platform_fee ?? FALLBACK_PRICING_CONFIG.min_platform_fee;
  const maxTotalFee = config?.max_total_service_fee ?? FALLBACK_PRICING_CONFIG.max_total_service_fee;
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

  const paystackFee = computePaystackLocalFee(itemAmount);

  let rawPlatformFee: number;
  let platformCapBound = false;
  if (isLegacyTieredConfig(config)) {
    const rate = tierRate(itemAmount, config!.tier_rates!);
    rawPlatformFee = Math.max(minPlatformFee, Math.round(itemAmount * rate) - paystackFee);
  } else {
    const rate = config?.platform_fee_rate ?? FALLBACK_PRICING_CONFIG.platform_fee_rate;
    const flat = config?.platform_fee_flat ?? FALLBACK_PRICING_CONFIG.platform_fee_flat;
    const platformCap = config?.max_platform_fee ?? FALLBACK_PRICING_CONFIG.max_platform_fee;
    const uncapped = Math.max(minPlatformFee, Math.round(itemAmount * rate) + flat);
    platformCapBound = uncapped > platformCap;
    rawPlatformFee = Math.min(uncapped, platformCap);
  }

  const rawServiceFee = paystackFee + rawPlatformFee;
  const serviceFeeAmount = Math.min(rawServiceFee, maxTotalFee);
  const platformFee = Math.max(serviceFeeAmount - paystackFee, 0);

  const is_floored = rawPlatformFee === minPlatformFee;
  const totalCapBound = rawServiceFee > maxTotalFee;
  const is_capped = platformCapBound || totalCapBound;
  // The total-service-fee ceiling is evaluated last, so when both bind it is
  // the one that produced the number the buyer is charged.
  const capped_by: "safedeal_fee" | "total_service_fee" | null = totalCapBound
    ? "total_service_fee"
    : platformCapBound
      ? "safedeal_fee"
      : null;
  const platformCapForReport = config?.max_platform_fee ?? FALLBACK_PRICING_CONFIG.max_platform_fee;

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

export interface FeeBreakdownInput {
  itemAmount: number;
  config?: PricingConfigOverride;
}

/**
 * Produce a plain-language description of how a fee was derived, computed
 * from the actual rate, flat component, cap and floor inputs used by
 * `computePricing` (never hardcoded prose about rates/amounts).
 */
export function describeFeeBreakdown(input: FeeBreakdownInput, result: PricingResult): string {
  const cfg = input.config;
  const minPlatformFee = cfg?.min_platform_fee ?? FALLBACK_PRICING_CONFIG.min_platform_fee;
  const maxTotalFee = cfg?.max_total_service_fee ?? FALLBACK_PRICING_CONFIG.max_total_service_fee;

  const capLabel =
    result.capped_by === "safedeal_fee" ? "SafeDeal Fee" : "Total Service Fee";
  const capAmount = result.applied_cap_amount;
  const capSentence = (rest: string) =>
    capAmount != null
      ? `This order's fee was capped by the maximum ${capLabel} of ${capAmount.toLocaleString()} ${result.currency_code}. ${rest}`
      : `This order's fee was capped by the maximum ${capLabel}. ${rest}`;

  if (isLegacyTieredConfig(cfg)) {
    const rate = tierRate(input.itemAmount, cfg!.tier_rates!);
    const ratePct = (rate * 100).toFixed(1);
    if (result.is_capped) {
      return capSentence(
        `The standard ${ratePct}% tier rate would have produced a higher amount, so the cap applied instead.`,
      );
    }
    if (result.is_floored) {
      return `The minimum platform fee of ${minPlatformFee.toLocaleString()} ${result.currency_code} applied because the calculated fee for this order amount fell below it.`;
    }
    return `A ${ratePct}% service fee rate applies to orders of this size, giving a total service fee of ${result.service_fee_amount.toLocaleString()} ${result.currency_code} on an item amount of ${input.itemAmount.toLocaleString()} ${result.currency_code}.`;
  }

  const rate = cfg?.platform_fee_rate ?? FALLBACK_PRICING_CONFIG.platform_fee_rate;
  const flat = cfg?.platform_fee_flat ?? FALLBACK_PRICING_CONFIG.platform_fee_flat;
  const platformCap = cfg?.max_platform_fee ?? FALLBACK_PRICING_CONFIG.max_platform_fee;
  const ratePct = (rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 1);

  if (result.is_capped) {
    return capSentence(
      `The standard ${ratePct}% + ${flat.toLocaleString()} ${result.currency_code} fee would have been higher, so the cap applied instead.`,
    );
  }

  if (result.is_floored) {
    return `The minimum platform fee of ${minPlatformFee.toLocaleString()} ${result.currency_code} applied because ${ratePct}% + ${flat.toLocaleString()} ${result.currency_code} on this order amount came to less than it.`;
  }

  return `SafeDeal charges ${ratePct}% + ${flat.toLocaleString()} ${result.currency_code} on an item amount of ${input.itemAmount.toLocaleString()} ${result.currency_code}, plus the payment processing fee. A total service fee of ${result.service_fee_amount.toLocaleString()} ${result.currency_code}.`;
}

/**
 * Narrate a fee using ONLY the persisted snapshot's own numbers.
 *
 * `describeFeeBreakdown` reads rates from the caller's config and falls back to
 * `FALLBACK_PRICING_CONFIG` when none is supplied: which tells a buyer on a
 * 1.5% vendor plan that they were charged 2%. This variant states the rate that
 * was actually applied to this order (service fee ÷ item amount) and never
 * consults live configuration.
 */
export function describeChargedFee(input: {
  itemAmount: number;
  serviceFeeAmount: number;
  serviceFeeRate: number;
  currencyCode: string;
  isCapped: boolean;
  appliedCapAmount: number | null;
  cappedBy: "safedeal_fee" | "total_service_fee" | null;
}): string {
  const money = (n: number) => `${n.toLocaleString()} ${input.currencyCode}`;
  const ratePct = (input.serviceFeeRate * 100).toFixed(2).replace(/\.?0+$/, "");
  if (input.isCapped) {
    const capLabel = input.cappedBy === "safedeal_fee" ? "SafeDeal Fee" : "Total Service Fee";
    const cap = input.appliedCapAmount != null ? ` of ${money(input.appliedCapAmount)}` : "";
    return `This order's total service fee was capped by the maximum ${capLabel}${cap}. You were charged ${money(
      input.serviceFeeAmount,
    )} on an item amount of ${money(input.itemAmount)}.`;
  }
  return `You were charged a total service fee of ${money(input.serviceFeeAmount)} on an item amount of ${money(
    input.itemAmount,
  )}: ${ratePct}% of the item amount, covering the SafeDeal fee and payment processing.`;
}
