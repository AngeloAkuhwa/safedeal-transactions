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

describe("pricing parity: internal consistency under config variations", () => {
  const CONSISTENCY_AMOUNTS = [0, -50, 1, 999, 2_500, 50_000, 250_000, 1_000_000, 3_000_000, 10_000_000];

  function assertInternallyConsistent(result: ReturnType<typeof clientComputePricing>, amount: number, label: string) {
    // No NaN / negatives anywhere in the breakdown.
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === "number") {
        expect(Number.isNaN(value), `${label}: ${key} is NaN for amount=${amount}`).toBe(false);
        expect(value, `${label}: ${key} is negative for amount=${amount}`).toBeGreaterThanOrEqual(0);
      }
    }

    // total = item + fees
    expect(result.total_amount, `${label}: total_amount mismatch for amount=${amount}`).toBe(
      result.item_amount + result.service_fee_amount,
    );

    // service fee = paystack fee + platform fee
    expect(result.service_fee_amount, `${label}: service_fee_amount mismatch for amount=${amount}`).toBe(
      result.paystack_fee_amount + result.platform_fee_amount,
    );

    // seller payout = item - platform fee (client result has no seller_payout_amount
    // field, so derive it the same way callers do and check it's non-negative and
    // internally consistent).
    const sellerPayout = result.item_amount - result.platform_fee_amount;
    expect(sellerPayout, `${label}: derived seller payout went negative for amount=${amount}`).toBeGreaterThanOrEqual(0);
  }

  const CONFIG_VARIATIONS: Array<{ label: string; config: PricingConfigOverride }> = [
    {
      label: "differing tier count (2 tiers)",
      config: {
        min_platform_fee: 200,
        max_total_service_fee: 3_000,
        tier_rates: [
          { upto: 200_000, rate: 0.04 },
          { upto: null, rate: 0.02 },
        ],
      },
    },
    {
      label: "differing tier count (5 tiers)",
      config: {
        min_platform_fee: 300,
        max_total_service_fee: 4_000,
        tier_rates: [
          { upto: 50_000, rate: 0.05 },
          { upto: 150_000, rate: 0.04 },
          { upto: 500_000, rate: 0.035 },
          { upto: 2_000_000, rate: 0.03 },
          { upto: null, rate: 0.02 },
        ],
      },
    },
    {
      label: "floor above cap (degenerate config: min platform fee exceeds max total fee)",
      config: {
        min_platform_fee: 5_000,
        max_total_service_fee: 2_500,
        tier_rates: [{ upto: null, rate: 0.01 }],
      },
    },
    {
      label: "single open-ended tier",
      config: {
        min_platform_fee: 250,
        max_total_service_fee: 2_500,
        tier_rates: [{ upto: null, rate: 0.03 }],
      },
    },
    {
      label: "zero floor",
      config: {
        min_platform_fee: 0,
        max_total_service_fee: 2_500,
        tier_rates: [
          { upto: 100_000, rate: 0.039 },
          { upto: null, rate: 0.025 },
        ],
      },
    },
  ];

  for (const { label, config } of CONFIG_VARIATIONS) {
    it(`stays internally consistent for: ${label}`, () => {
      for (const amount of CONSISTENCY_AMOUNTS) {
        const result = clientComputePricing(amount, "NGN", config);
        assertInternallyConsistent(result, amount, label);

        if (amount > 0) {
          // Total service fee never exceeds the configured cap.
          expect(
            result.service_fee_amount,
            `${label}: service_fee_amount exceeded max_total_service_fee for amount=${amount}`,
          ).toBeLessThanOrEqual(config.max_total_service_fee!);

          // The floor only fails to bind when the cap forces the fee lower
          // than the configured minimum (the "floor above cap" case) —
          // otherwise platform fee should never fall below the floor.
          if (result.service_fee_amount < config.max_total_service_fee!) {
            expect(
              result.platform_fee_amount,
              `${label}: platform fee under-floored for amount=${amount}`,
            ).toBeGreaterThanOrEqual(config.min_platform_fee!);
          }
        }
      }
    });

    it(`matches the server implementation for: ${label}`, () => {
      for (const amount of CONSISTENCY_AMOUNTS) {
        expect(
          clientComputePricing(amount, "NGN", config),
          `${label}: client/server diverged at amount=${amount}`,
        ).toEqual(serverComputePricing(amount, "NGN", "local", config));
      }
    });
  }
});
