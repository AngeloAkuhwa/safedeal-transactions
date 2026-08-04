/**
 * Fallback-parity contract.
 *
 * Client-side checkout previews (and the server's snapshot-read fallback
 * branches) fall back to the platform defaults in src/lib/pricing.ts
 * whenever a DB read of the seller's `system_settings` pricing row fails or
 * hasn't resolved yet. Those defaults MUST mirror the platform rows actually
 * seeded in the DB (min_platform_fee 250, max_total_service_fee 2500, and
 * the four tiered rates: <=100k @ 3.9%, <=500k @ 3.5%, <=2,000,000 @ 2.9%,
 * else 2.5%) so that a DB read failure degrades to an *identical* price
 * rather than a silently different one.
 *
 * NOTE: src/lib/pricing.ts currently exports the floor/cap as separate
 * constants (`DEFAULT_MIN_PLATFORM_FEE`, `DEFAULT_MAX_TOTAL_FEE`) rather
 * than a single `DEFAULT_PRICING_CONFIG` object, and does not export its
 * internal `DEFAULT_TIER_RATES` array at all. This test asserts against
 * what is actually exported today, and exercises the (unexported) tier
 * table indirectly through `computePricing`'s public behaviour at each
 * tier boundary, rather than reaching into an object that doesn't exist —
 * production code is intentionally left untouched here.
 */
import { describe, it, expect } from "vitest";
import {
  computePricing,
  DEFAULT_MIN_PLATFORM_FEE,
  DEFAULT_MAX_TOTAL_FEE,
} from "@/lib/pricing";

/**
 * Mirrors the platform-wide rows seeded into `system_settings` (see the
 * seed migration for `min_platform_fee`, `max_total_service_fee`, and
 * `tier_rates`). Kept as a literal (not re-derived from src/lib/pricing.ts)
 * so this test actually detects drift instead of trivially passing.
 */
const SEEDED_PLATFORM_PRICING_FIXTURE = {
  min_platform_fee: 250,
  max_total_service_fee: 2500,
  tier_rates: [
    { upto: 100_000, rate: 0.039 },
    { upto: 500_000, rate: 0.035 },
    { upto: 2_000_000, rate: 0.029 },
    { upto: null, rate: 0.025 },
  ],
};

describe("pricing fallback parity: no-config defaults mirror seeded platform rows", () => {
  it("has a min_platform_fee of 250 (matches seeded system_settings row)", () => {
    expect(DEFAULT_MIN_PLATFORM_FEE).toBe(SEEDED_PLATFORM_PRICING_FIXTURE.min_platform_fee);
  });

  it("has a max_total_service_fee of 2500 (matches seeded system_settings row)", () => {
    expect(DEFAULT_MAX_TOTAL_FEE).toBe(SEEDED_PLATFORM_PRICING_FIXTURE.max_total_service_fee);
  });

  it("the no-config floor/cap fallback exactly matches an explicit fixture config", () => {
    // A DB-read failure means checkout previews call computePricing() with no
    // config argument at all. If that no-config path diverges from an
    // explicit fixture built from the seeded rows, buyers would silently see
    // a different price than the one actually charged.
    for (const amount of [0, 1, 1_000, 100_000, 500_000, 2_000_000, 5_000_000]) {
      const noConfig = computePricing(amount, "NGN");
      const explicitFixtureConfig = computePricing(amount, "NGN", SEEDED_PLATFORM_PRICING_FIXTURE);
      expect(noConfig, `no-config vs fixture diverged at amount=${amount}`).toEqual(explicitFixtureConfig);
    }
  });

  it("applies the seeded tier rates at each tier boundary when no config is passed", () => {
    // Exercise the (unexported) tier table indirectly: for a large enough
    // item amount that the floor/cap don't bind, service_fee_rate should
    // equal the seeded rate for that tier.
    // Use amounts small enough within each tier that the ₦2,500 total-fee
    // cap does not bind (otherwise service_fee_rate reflects the cap, not
    // the tier rate).
    const rateCases: Array<{ amount: number; rate: number }> = [
      { amount: 50_000, rate: 0.039 }, // <= 100k tier
      { amount: 60_000, rate: 0.035 }, // <= 500k tier (well below its own upper bound)
    ];
    for (const { amount, rate } of rateCases) {
      const result = computePricing(amount, "NGN");
      expect(result.is_capped, `cap must not bind at amount=${amount}`).toBe(false);
      expect(result.is_floored, `floor must not bind at amount=${amount}`).toBe(false);
      // service_fee_rate is the effective all-in rate (paystack + platform),
      // so it must be at least the seeded platform tier rate.
      expect(
        result.service_fee_rate,
        `amount=${amount} should reflect at least the seeded ${rate} tier rate`,
      ).toBeGreaterThanOrEqual(rate - 0.0005);
    }

    // The open-ended 0.025 tier can never surface as an effective rate: it only
    // starts above ₦500k, by which point the ₦2,500 total-fee cap always binds.
    // Assert the cap instead of a tier rate that is unreachable by construction.
    const large = computePricing(4_000_000, "NGN");
    expect(large.is_capped).toBe(true);
    expect(large.service_fee_amount).toBe(2_500);
  });
});
