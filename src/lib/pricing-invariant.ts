/**
 * Economic invariant guard for pricing configuration.
 *
 * SafeDeal pays Paystack a real per-transaction cost. `platform_fee_amount`
 * is what remains for SafeDeal AFTER that cost. The invariant therefore is:
 *
 *   for every item amount:  platform_fee_amount >= MIN_PLATFORM_MARGIN_NGN
 *   (equivalently: service_fee_amount >= paystack_fee + MIN_PLATFORM_MARGIN_NGN)
 *
 * MIN_PLATFORM_MARGIN_NGN is ₦100: it mirrors Paystack's flat per-transaction
 * component and is the smallest amount that keeps SafeDeal strictly positive
 * on every transaction once variable costs are paid. It is deliberately BELOW
 * the seeded ₦250 platform-fee floor. ₦250 is a commercial choice that may be
 * renegotiated, ₦100 is the hard economic line that must never be crossed.
 *
 * The check is a coupled sweep: tier rates, floor and cap interact, so any of
 * the three can individually look sane while the combination nets a loss
 * (e.g. a cap below the Paystack fee at high amounts).
 */

export const MIN_PLATFORM_MARGIN_NGN = 100;

export interface PricingConfigLike {
  min_platform_fee?: number;
  max_total_service_fee?: number;
  max_platform_fee?: number;
  platform_fee_rate?: number;
  platform_fee_flat?: number;
  tier_rates?: Array<{ upto: number | null; rate: number }>;
}

export interface InvariantResult {
  ok: boolean;
  /** Machine-readable code, present only when `ok` is false. */
  error?: string;
  /** Human-readable message naming the amount range that breaks the invariant. */
  message?: string;
  failing_amount?: number;
  platform_fee_at_failure?: number;
}

/** Base sweep: tier boundaries, Paystack flat-fee boundary, cap-binding range. */
const BASE_SWEEP = [
  1, 100, 500, 1_000, 2_499, 2_500, 2_501, 5_000, 10_000, 50_000,
  99_999, 100_000, 100_001, 250_000, 499_999, 500_000, 500_001,
  1_000_000, 1_999_999, 2_000_000, 2_000_001, 5_000_000, 20_000_000, 50_000_000,
];

export function buildSweep(config?: PricingConfigLike): number[] {
  const set = new Set<number>(BASE_SWEEP);
  for (const t of config?.tier_rates ?? []) {
    if (typeof t?.upto === "number" && Number.isFinite(t.upto) && t.upto > 0) {
      set.add(Math.max(1, t.upto - 1));
      set.add(t.upto);
      set.add(t.upto + 1);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

function describeRange(amount: number): string {
  if (amount <= 2_500) return `below ₦2,500`;
  if (amount <= 100_000) return `around ₦${amount.toLocaleString()} (≤ ₦100,000 band)`;
  if (amount <= 500_000) return `around ₦${amount.toLocaleString()} (≤ ₦500,000 band)`;
  if (amount <= 2_000_000) return `around ₦${amount.toLocaleString()} (≤ ₦2,000,000 band)`;
  return `at high amounts from ₦${amount.toLocaleString()} upward`;
}

/**
 * Validate a pricing config against the economic invariant.
 * `compute` is injected so this module never re-declares rate maths.
 */
export function checkPricingInvariant(
  config: PricingConfigLike | undefined,
  compute: (amount: number, config?: PricingConfigLike) => { platform_fee_amount: number },
): InvariantResult {
  for (const amount of buildSweep(config)) {
    const { platform_fee_amount } = compute(amount, config);
    if (!(platform_fee_amount >= MIN_PLATFORM_MARGIN_NGN)) {
      return {
        ok: false,
        error: "pricing_invariant_violated",
        failing_amount: amount,
        platform_fee_at_failure: platform_fee_amount,
        message:
          `Pricing configuration would net SafeDeal ₦${platform_fee_amount.toLocaleString()} ` +
          `${describeRange(amount)}, below the required minimum margin of ` +
          `₦${MIN_PLATFORM_MARGIN_NGN} after Paystack costs. Raise the tier rate, the minimum ` +
          `platform fee, or the total service-fee cap for that range.`,
      };
    }
  }
  return { ok: true };
}
