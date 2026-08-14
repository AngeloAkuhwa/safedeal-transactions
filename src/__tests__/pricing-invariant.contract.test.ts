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
import { resolveAppliedCap } from "@/types/payment-flow.types";

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

  it("accepts a zero floor under G3, because the flat component carries the margin", () => {
    // The ₦100 flat component replaces the old ₦250 floor as the small-ticket
    // margin guarantee, so min_platform_fee 0 is no longer a violation.
    const verdict = checkPricingInvariant(
      { ...FALLBACK_PRICING_CONFIG, min_platform_fee: 0 },
      compute,
    );
    expect(verdict.ok).toBe(true);
  });

  it("rejects a zero floor AND zero flat, which leaves sub-margin fees on small amounts", () => {
    const verdict = checkPricingInvariant(
      { ...FALLBACK_PRICING_CONFIG, min_platform_fee: 0, platform_fee_flat: 0 },
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

/**
 * Cap naming. `PricingBreakdown` may only name the ceiling that actually bound
 * the charge. A vendor whose SafeDeal-fee ceiling binds below the total
 * service-fee ceiling must not be told "Total Service Fee capped at ₦7,000"
 * next to a smaller figure.
 */
describe("resolveAppliedCap names the binding ceiling", () => {
  const stamp = (tsf: number, pf: number) => `NG_MVP_TSFCAP_${tsf}_PFCAP_${pf}_MIN_250_Tabc`;

  it("names the SafeDeal-fee cap when the platform ceiling binds alone", () => {
    expect(
      resolveAppliedCap({
        pricing_model_version: stamp(7000, 5000),
        service_fee_amount: 5200,
        safedeal_fee_amount: 5000,
      }),
    ).toEqual({ kind: "safedeal_fee", amount: 5000 });
  });

  it("names the total-service-fee cap when it is the one that bound", () => {
    expect(
      resolveAppliedCap({
        pricing_model_version: stamp(7000, 5000),
        service_fee_amount: 7000,
        safedeal_fee_amount: 4000,
      }),
    ).toEqual({ kind: "total_service_fee", amount: 7000 });
  });

  it("prefers the total ceiling when both bind, since it is applied last", () => {
    expect(
      resolveAppliedCap({
        pricing_model_version: stamp(7000, 5000),
        service_fee_amount: 7000,
        safedeal_fee_amount: 5000,
      })?.kind,
    ).toBe("total_service_fee");
  });

  it("returns null when nothing bound", () => {
    expect(
      resolveAppliedCap({
        pricing_model_version: stamp(7000, 5000),
        service_fee_amount: 900,
        safedeal_fee_amount: 700,
      }),
    ).toBeNull();
  });

  it("declines to name a SafeDeal-fee cap on legacy stamps without PFCAP_", () => {
    expect(
      resolveAppliedCap({
        pricing_model_version: "NG_MVP_TSFCAP_7000_MIN_250_Tabc",
        service_fee_amount: 5000,
        safedeal_fee_amount: 5000,
      }),
    ).toBeNull();
  });
});
