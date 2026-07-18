import { describe, it, expect } from "vitest";
import { computePricing, type PricingConfigOverride } from "../pricing";

/** Default config that mirrors the constants baked into `computePricing`. */
const DEFAULT_MIRROR: PricingConfigOverride = {
  min_platform_fee: 250,
  max_total_service_fee: 2500,
  tier_rates: [
    { upto: 100_000, rate: 0.039 },
    { upto: 500_000, rate: 0.035 },
    { upto: 2_000_000, rate: 0.029 },
    { upto: null, rate: 0.025 },
  ],
};

const AMOUNTS = [1_000, 25_000, 100_000, 450_000, 1_500_000, 5_000_000];

describe("computePricing — platform defaults", () => {
  it("floors small transactions to min platform fee", () => {
    const r = computePricing(1_000);
    expect(r.is_floored).toBe(true);
    expect(r.platform_fee_amount).toBe(250);
  });

  it("caps large transactions to the service-fee cap", () => {
    const r = computePricing(1_000_000);
    expect(r.is_capped).toBe(true);
    expect(r.service_fee_amount).toBe(2500);
    expect(r.total_amount).toBe(1_002_500);
  });

  it("returns zeroed result for non-positive input", () => {
    const r = computePricing(0);
    expect(r.total_amount).toBe(0);
    expect(r.service_fee_amount).toBe(0);
  });
});

describe("computePricing — snapshot parity (no config == mirrored default config)", () => {
  it.each(AMOUNTS)("matches for amount %i", (amount) => {
    const a = computePricing(amount);
    const b = computePricing(amount, "NGN", DEFAULT_MIRROR);
    expect(b).toEqual(a);
  });
});

describe("computePricing — vendor override", () => {
  it("respects a vendor cap raised to 5000", () => {
    const cfg: PricingConfigOverride = { max_total_service_fee: 5000 };
    const r = computePricing(1_000_000, "NGN", cfg);
    // Base tier at 1M is 2.9% = 29,000 → capped to 5000, not 2500
    expect(r.service_fee_amount).toBeLessThanOrEqual(5000);
    expect(r.service_fee_amount).toBeGreaterThan(2500);
  });

  it("respects a vendor min platform fee floor raised to 500", () => {
    const cfg: PricingConfigOverride = { min_platform_fee: 500 };
    const r = computePricing(1_000, "NGN", cfg);
    expect(r.platform_fee_amount).toBe(500);
    expect(r.is_floored).toBe(true);
  });

  it("respects vendor tier_rates override", () => {
    const cfg: PricingConfigOverride = {
      tier_rates: [{ upto: null, rate: 0.01 }],
    };
    const r = computePricing(100_000, "NGN", cfg);
    // 1% of 100k = 1000 → but Paystack fee ~1600 pushes service fee higher than min floor
    // Ensure service fee reflects the flat 1% target (or floor), never the default 3.9%
    expect(r.service_fee_amount).toBeLessThan(computePricing(100_000).service_fee_amount);
  });
});