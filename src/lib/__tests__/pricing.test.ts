import { describe, it, expect } from "vitest";
import { computePricing, FALLBACK_PRICING_CONFIG, type PricingConfigOverride } from "../pricing";

/**
 * G3 fee model: platform fee = 2% + ₦100, capped at ₦5,000, on top of the
 * Paystack processing cost (itself capped at ₦2,000), for an absolute total
 * service-fee ceiling of ₦7,000.
 *
 * DEFAULT_MIRROR is written out literally rather than spread from the
 * fallback so this test detects drift instead of trivially passing.
 */
const DEFAULT_MIRROR: PricingConfigOverride = {
  min_platform_fee: 0,
  max_total_service_fee: 7_000,
  max_platform_fee: 5_000,
  platform_fee_rate: 0.02,
  platform_fee_flat: 100,
  tier_rates: [],
};

const AMOUNTS = [1_000, 25_000, 100_000, 450_000, 1_500_000, 5_000_000];

describe("computePricing: platform defaults (G3)", () => {
  it("mirrors the shipped fallback config", () => {
    expect(FALLBACK_PRICING_CONFIG).toEqual(DEFAULT_MIRROR);
  });

  it("charges rate + flat on small transactions", () => {
    const r = computePricing(1_000);
    // 2% of 1,000 = 20, + ₦100 flat = ₦120 platform fee.
    expect(r.platform_fee_amount).toBe(120);
    expect(r.is_capped).toBe(false);
  });

  it("caps the platform fee at ₦5,000 on large transactions", () => {
    const r = computePricing(1_000_000);
    expect(r.is_capped).toBe(true);
    expect(r.platform_fee_amount).toBe(5_000);
    // Paystack local fee is capped at ₦2,000 → ₦7,000 total service fee.
    expect(r.service_fee_amount).toBe(7_000);
    expect(r.total_amount).toBe(1_007_000);
  });

  it("never exceeds the ₦5,000 platform cap at any amount", () => {
    for (const amount of [...AMOUNTS, 50_000_000]) {
      expect(computePricing(amount).platform_fee_amount).toBeLessThanOrEqual(5_000);
    }
  });

  it("returns zeroed result for non-positive input", () => {
    const r = computePricing(0);
    expect(r.total_amount).toBe(0);
    expect(r.service_fee_amount).toBe(0);
  });
});

describe("computePricing: snapshot parity (no config == mirrored default config)", () => {
  it.each(AMOUNTS)("matches for amount %i", (amount) => {
    const a = computePricing(amount);
    const b = computePricing(amount, "NGN", DEFAULT_MIRROR);
    expect(b).toEqual(a);
  });
});

describe("computePricing: vendor override", () => {
  it("applies a reduced vendor plan rate (Growth 1.5%)", () => {
    const cfg: PricingConfigOverride = { platform_fee_rate: 0.015 };
    const r = computePricing(100_000, "NGN", cfg);
    // 1.5% of 100,000 = 1,500 + ₦100 flat.
    expect(r.platform_fee_amount).toBe(1_600);
    expect(r.platform_fee_amount).toBeLessThan(computePricing(100_000).platform_fee_amount);
  });

  it("respects a lowered vendor platform-fee cap", () => {
    const cfg: PricingConfigOverride = { max_platform_fee: 2_000 };
    const r = computePricing(1_000_000, "NGN", cfg);
    expect(r.platform_fee_amount).toBe(2_000);
    expect(r.is_capped).toBe(true);
  });

  it("respects a vendor min platform fee floor raised to 500", () => {
    const cfg: PricingConfigOverride = { min_platform_fee: 500 };
    const r = computePricing(1_000, "NGN", cfg);
    expect(r.platform_fee_amount).toBe(500);
    expect(r.is_floored).toBe(true);
  });

  it("still honours legacy tiered snapshots (G2 historical transactions)", () => {
    const cfg: PricingConfigOverride = {
      min_platform_fee: 250,
      max_total_service_fee: 2_500,
      tier_rates: [{ upto: null, rate: 0.039 }],
    };
    const r = computePricing(50_000, "NGN", cfg);
    // Legacy model is all-in: 3.9% of 50,000 = 1,950 total service fee.
    expect(r.service_fee_amount).toBe(1_950);
  });
});
