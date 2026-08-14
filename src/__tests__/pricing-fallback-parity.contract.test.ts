/**
 * Fallback-parity contract (G3 fee model).
 *
 * Client-side checkout previews (and the server's snapshot-read fallback
 * branches) fall back to the platform defaults in src/lib/pricing.ts whenever
 * a DB read of the seller's `system_settings` pricing row fails or hasn't
 * resolved yet. Those defaults MUST mirror the platform rows actually seeded
 * in the DB (platform_fee_rate 0.02, platform_fee_flat 100,
 * max_platform_fee 5,000, max_total_service_fee 7,000) so that a DB read
 * failure degrades to an *identical* price rather than a silently different
 * one.
 */
import { describe, it, expect } from "vitest";
import {
  computePricing,
  DEFAULT_MIN_PLATFORM_FEE,
  DEFAULT_MAX_TOTAL_FEE,
  DEFAULT_PLATFORM_FEE_RATE,
  DEFAULT_PLATFORM_FEE_FLAT,
  DEFAULT_MAX_PLATFORM_FEE,
} from "@/lib/pricing";

/**
 * Mirrors the platform-wide rows seeded into `system_settings`. Kept as a
 * literal (not re-derived from src/lib/pricing.ts) so this test actually
 * detects drift instead of trivially passing.
 */
const SEEDED_PLATFORM_PRICING_FIXTURE = {
  min_platform_fee: 0,
  max_total_service_fee: 7_000,
  max_platform_fee: 5_000,
  platform_fee_rate: 0.02,
  platform_fee_flat: 100,
  tier_rates: [],
};

describe("pricing fallback parity: no-config defaults mirror seeded platform rows", () => {
  it("exposes the seeded G3 fee components", () => {
    expect(DEFAULT_PLATFORM_FEE_RATE).toBe(SEEDED_PLATFORM_PRICING_FIXTURE.platform_fee_rate);
    expect(DEFAULT_PLATFORM_FEE_FLAT).toBe(SEEDED_PLATFORM_PRICING_FIXTURE.platform_fee_flat);
    expect(DEFAULT_MAX_PLATFORM_FEE).toBe(SEEDED_PLATFORM_PRICING_FIXTURE.max_platform_fee);
  });

  it("exposes the seeded floor and absolute total-fee guardrail", () => {
    expect(DEFAULT_MIN_PLATFORM_FEE).toBe(SEEDED_PLATFORM_PRICING_FIXTURE.min_platform_fee);
    expect(DEFAULT_MAX_TOTAL_FEE).toBe(SEEDED_PLATFORM_PRICING_FIXTURE.max_total_service_fee);
  });

  it("the no-config fallback exactly matches an explicit fixture config", () => {
    // A DB-read failure means checkout previews call computePricing() with no
    // config argument at all. If that no-config path diverges from an explicit
    // fixture built from the seeded rows, buyers would silently see a different
    // price than the one actually charged.
    for (const amount of [0, 1, 1_000, 100_000, 500_000, 2_000_000, 5_000_000]) {
      const noConfig = computePricing(amount, "NGN");
      const explicitFixtureConfig = computePricing(amount, "NGN", SEEDED_PLATFORM_PRICING_FIXTURE);
      expect(noConfig, `no-config vs fixture diverged at amount=${amount}`).toEqual(explicitFixtureConfig);
    }
  });

  it("applies rate + flat below the cap, and the cap above it", () => {
    const belowCap = computePricing(50_000, "NGN");
    expect(belowCap.is_capped).toBe(false);
    // 2% of 50,000 = 1,000 + ₦100 flat.
    expect(belowCap.platform_fee_amount).toBe(1_100);

    // The platform fee cap binds from ₦245,000 upwards (2% + 100 > 5,000).
    const aboveCap = computePricing(4_000_000, "NGN");
    expect(aboveCap.is_capped).toBe(true);
    expect(aboveCap.platform_fee_amount).toBe(5_000);
    expect(aboveCap.service_fee_amount).toBe(7_000);
  });
});
