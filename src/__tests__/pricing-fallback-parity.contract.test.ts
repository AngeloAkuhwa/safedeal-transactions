/**
 * Fallback-parity contract.
 *
 * Client-side checkout previews (and the server's snapshot-read fallback
 * branches) fall back to `DEFAULT_PRICING_CONFIG` whenever a DB read of the
 * seller's `system_settings` pricing row fails or hasn't resolved yet. That
 * fallback config MUST mirror the platform rows actually seeded in the DB
 * (min_platform_fee 250, max_total_service_fee 2500, and the four tiered
 * rates: <=100k @ 3.9%, <=500k @ 3.5%, <=2,000,000 @ 2.9%, else 2.5%) so that
 * a DB read failure degrades to an *identical* price rather than a silently
 * different one.
 *
 * This fixture is checked in independently of src/lib/pricing.ts's internal
 * constants so that an accidental edit to the defaults (drifting away from
 * the seeded DB rows) is caught here, rather than only being caught by the
 * client/server parity test (which would happily agree on the *wrong*
 * shared default).
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_PRICING_CONFIG } from "@/lib/pricing";

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

describe("pricing fallback parity: DEFAULT_PRICING_CONFIG mirrors seeded platform rows", () => {
  it("matches the checked-in fixture of the seeded system_settings platform rows", () => {
    expect(DEFAULT_PRICING_CONFIG).toEqual(SEEDED_PLATFORM_PRICING_FIXTURE);
  });

  it("has a min_platform_fee of 250 (matches seeded system_settings row)", () => {
    expect(DEFAULT_PRICING_CONFIG.min_platform_fee).toBe(250);
  });

  it("has a max_total_service_fee of 2500 (matches seeded system_settings row)", () => {
    expect(DEFAULT_PRICING_CONFIG.max_total_service_fee).toBe(2500);
  });

  it("has the four seeded tier rates in ascending order", () => {
    expect(DEFAULT_PRICING_CONFIG.tier_rates).toEqual(SEEDED_PLATFORM_PRICING_FIXTURE.tier_rates);
  });
});
