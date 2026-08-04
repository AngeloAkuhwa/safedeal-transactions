/**
 * Pricing parity contract.
 *
 * `src/lib/pricing.ts` (Vite bundle, checkout previews) and
 * `supabase/functions/_shared/pricing.ts` (Deno, the amount actually charged)
 * are hand-duplicated. They cannot be merged: the Deno functions directory
 * cannot import from `src/`, so a "shared" module would just be a third copy.
 *
 * This test fails if either file is edited one-sidedly.
 */
import { describe, it, expect } from "vitest";
import { computePricing as clientComputePricing } from "@/lib/pricing";
import type { PricingConfigOverride } from "@/lib/pricing";
import { computePricing as serverComputePricing } from "../../supabase/functions/_shared/pricing";

/** Deterministic pseudo-random amounts from a fixed seed (no test flakiness). */
function seededAmounts(count: number): number[] {
  let seed = 20260804;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    out.push(seed % 5_000_000);
  }
  return out;
}

const BOUNDARY_AMOUNTS = [
  0,
  1,
  999,
  2_499, // Paystack flat-fee boundary
  2_500,
  6_410, // ~ where the ₦250 platform-fee floor stops binding
  50_000,
  99_999,
  100_000, // tier boundary 3.9% -> 3.5%
  100_001,
  500_000, // tier boundary 3.5% -> 2.9%
  500_001,
  2_000_000, // tier boundary 2.9% -> 2.5%
  2_000_001,
  5_000_000,
];

const AMOUNTS = [...BOUNDARY_AMOUNTS, ...seededAmounts(40)];

describe("pricing parity: src/lib/pricing.ts vs supabase/functions/_shared/pricing.ts", () => {
  it("produces identical breakdowns for the default platform config", () => {
    for (const amount of AMOUNTS) {
      const client = clientComputePricing(amount);
      const server = serverComputePricing(amount, "NGN", "local");
      expect(client, `default config diverged at itemAmount=${amount}`).toEqual(server);
    }
  });

  it("produces identical breakdowns for a non-NGN currency label", () => {
    for (const amount of [1_000, 250_000, 3_000_000]) {
      expect(clientComputePricing(amount, "USD")).toEqual(
        serverComputePricing(amount, "USD", "local"),
      );
    }
  });

  it("produces identical breakdowns under a vendor pricing override", () => {
    const override: PricingConfigOverride = {
      min_platform_fee: 500,
      max_total_service_fee: 7_500,
      tier_rates: [
        { upto: 50_000, rate: 0.045 },
        { upto: 1_000_000, rate: 0.03 },
        { upto: null, rate: 0.02 },
      ],
    };
    for (const amount of AMOUNTS) {
      const client = clientComputePricing(amount, "NGN", override);
      const server = serverComputePricing(amount, "NGN", "local", override);
      expect(client, `override config diverged at itemAmount=${amount}`).toEqual(server);
    }
  });

  it("agrees on the ₦250 platform-fee floor and the ₦2,500 total-fee cap", () => {
    // Floor: a tiny amount is floored, both sides flag it and charge the same.
    const floored = clientComputePricing(1_000);
    expect(floored.is_floored).toBe(true);
    expect(floored).toEqual(serverComputePricing(1_000, "NGN", "local"));

    // Cap: a large amount is capped at 2,500 total service fee on both sides.
    const capped = clientComputePricing(1_000_000);
    expect(capped.is_capped).toBe(true);
    expect(capped.service_fee_amount).toBe(2_500);
    expect(capped).toEqual(serverComputePricing(1_000_000, "NGN", "local"));
  });

  it("agrees on the zero / negative amount short-circuit", () => {
    for (const amount of [0, -1, -100_000]) {
      expect(clientComputePricing(amount)).toEqual(serverComputePricing(amount, "NGN", "local"));
    }
  });
});