import { describe, it, expect } from "vitest";
import { computePricing, describeFeeBreakdown } from "@/lib/pricing";

describe("describeFeeBreakdown", () => {
  it("describes the cap-bound case without implying the raw rate was charged", () => {
    const itemAmount = 5_000_000;
    const result = computePricing(itemAmount, "NGN");
    expect(result.is_capped).toBe(true);
    const desc = describeFeeBreakdown({ itemAmount }, result);
    expect(desc).toMatch(/capped/i);
    // The G3 platform-fee cap, not the raw 2% + ₦100 amount.
    expect(desc).toContain("5,000");
    expect(desc).not.toMatch(/A [\d.]+% service fee rate applies/i);
  });

  it("describes the floor-bound case when a vendor floor is configured", () => {
    const itemAmount = 500;
    const config = { min_platform_fee: 250 };
    const result = computePricing(itemAmount, "NGN", config);
    expect(result.is_floored).toBe(true);
    expect(result.is_capped).toBe(false);
    const desc = describeFeeBreakdown({ itemAmount, config }, result);
    expect(desc).toContain("250");
  });

  it("describes the normal case with the actual rate, flat and amount", () => {
    const itemAmount = 50_000;
    const result = computePricing(itemAmount, "NGN");
    expect(result.is_capped).toBe(false);
    const desc = describeFeeBreakdown({ itemAmount }, result);
    expect(desc).toMatch(/2%/);
    expect(desc).toContain("100");
    expect(desc).toContain(result.service_fee_amount.toLocaleString());
    expect(desc).toContain(itemAmount.toLocaleString());
  });

  it("respects vendor overrides when deriving the tier rate", () => {
    // Headroom on both bounds so neither the floor nor the cap binds and the
    // raw tier rate is what actually gets described.
    const itemAmount = 200_000;
    const config = {
      tier_rates: [{ upto: null, rate: 0.02 }],
      max_total_service_fee: 100_000,
    };
    const result = computePricing(itemAmount, "NGN", config);
    expect(result.is_floored).toBe(false);
    expect(result.is_capped).toBe(false);
    const desc = describeFeeBreakdown({ itemAmount, config }, result);
    expect(desc).toMatch(/2\.0%/);
  });
});
