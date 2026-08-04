import { describe, it, expect } from "vitest";
import { computePricing, describeFeeBreakdown } from "@/lib/pricing";

describe("describeFeeBreakdown", () => {
  it("describes the cap-bound case without implying the raw tier rate was charged", () => {
    const itemAmount = 5_000_000;
    const result = computePricing(itemAmount, "NGN");
    expect(result.is_capped).toBe(true);
    const desc = describeFeeBreakdown({ itemAmount }, result);
    expect(desc).toMatch(/capped/i);
    expect(desc).toContain("2,500");
    expect(desc).not.toMatch(/A [\d.]+% service fee rate applies/i);
  });

  it("describes the floor-bound case", () => {
    const itemAmount = 500;
    const result = computePricing(itemAmount, "NGN");
    expect(result.is_floored).toBe(true);
    expect(result.is_capped).toBe(false);
    const desc = describeFeeBreakdown({ itemAmount }, result);
    expect(desc).toMatch(/minimum/i);
    expect(desc).toContain("250");
  });

  it("describes the normal tier case with the actual rate and amount band", () => {
    const itemAmount = 50_000;
    const result = computePricing(itemAmount, "NGN");
    expect(result.is_capped).toBe(false);
    expect(result.is_floored).toBe(false);
    const desc = describeFeeBreakdown({ itemAmount }, result);
    expect(desc).toMatch(/3\.9%/);
    expect(desc).toContain(result.service_fee_amount.toLocaleString());
    expect(desc).toContain(itemAmount.toLocaleString());
  });

  it("respects vendor overrides when deriving the tier rate", () => {
    const itemAmount = 50_000;
    const config = { tier_rates: [{ upto: null, rate: 0.02 }] };
    const result = computePricing(itemAmount, "NGN", config);
    const desc = describeFeeBreakdown({ itemAmount, config }, result);
    expect(desc).toMatch(/2\.0%/);
  });
});
