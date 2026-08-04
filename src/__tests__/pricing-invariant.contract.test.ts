/**
 * Economic invariant guard (Batch 5, Item 2).
 *
 * The resolved platform fee must never fall below MIN_PLATFORM_MARGIN_NGN
 * once Paystack's real per-transaction cost is paid, for ANY item amount.
 * Rates, floor and cap are validated as a coupled formula.
 */
import { describe, it, expect } from "vitest";
import { computePricing, FALLBACK_PRICING_CONFIG } from "@/lib/pricing";
import {
  checkPricingInvariant,
  buildSweep,
  MIN_PLATFORM_MARGIN_NGN,
} from "@/lib/pricing-invariant";

const compute = (amount: number, config?: any) => computePricing(amount, "NGN", config);

describe("pricing economic invariant", () => {
  it("accepts the seeded platform rate card across the full sweep", () => {
    const verdict = checkPricingInvariant(FALLBACK_PRICING_CONFIG, compute);
    expect(verdict.message ?? "").toBe("");
    expect(verdict.ok).toBe(true);
  });

  it("keeps a positive margin at every swept amount for the seeded card", () => {
    for (const amount of buildSweep(FALLBACK_PRICING_CONFIG)) {
      const r = computePricing(amount, "NGN", FALLBACK_PRICING_CONFIG);
      expect(r.platform_fee_amount, `amount=${amount}`).toBeGreaterThanOrEqual(MIN_PLATFORM_MARGIN_NGN);
    }
  });

  it("rejects a cap below the Paystack cost at high amounts (cap-too-low)", () => {
    const verdict = checkPricingInvariant(
      { ...FALLBACK_PRICING_CONFIG, max_total_service_fee: 1_500 },
      compute,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.error).toBe("pricing_invariant_violated");
    expect(verdict.failing_amount).toBeGreaterThanOrEqual(50_000);
    expect(verdict.message).toMatch(/minimum margin/);
  });

  it("rejects a zero floor that leaves sub-margin fees on small amounts (floor-zero)", () => {
    const verdict = checkPricingInvariant(
      { ...FALLBACK_PRICING_CONFIG, min_platform_fee: 0 },
      compute,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.failing_amount).toBeLessThanOrEqual(2_500);
  });

  it("rejects a tier rate at or below Paystack's own cost (rate-below-paystack-cost)", () => {
    const verdict = checkPricingInvariant(
      {
        min_platform_fee: 0,
        max_total_service_fee: 2_500,
        tier_rates: [{ upto: null, rate: 0.01 }],
      },
      compute,
    );
    expect(verdict.ok).toBe(false);
  });

  it("accepts a stricter-but-valid alternative card (valid sweep)", () => {
    const verdict = checkPricingInvariant(
      {
        min_platform_fee: 300,
        max_total_service_fee: 4_000,
        tier_rates: [
          { upto: 250_000, rate: 0.04 },
          { upto: null, rate: 0.03 },
        ],
      },
      compute,
    );
    expect(verdict.ok).toBe(true);
  });
});
