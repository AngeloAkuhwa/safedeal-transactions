import { describe, it, expect } from "vitest";
import { deriveDisputeDisplay } from "@/lib/dispute-display-status";
import { formatMoney } from "@/lib/format";

/**
 * Backstop tests for the queue's display logic. The queue mirrors
 * `deriveDisputeDisplay` for status text and `formatMoney` for amounts.
 */
describe("AdminDisputes queue display", () => {
  it("seller-favor resolved → Awaiting Release", () => {
    const r = deriveDisputeDisplay({
      disputeStatus: "resolved",
      outcome: { outcome_type: "release_funds_to_seller" },
      moneyStatus: "funds_pending_release",
    });
    expect(r?.label).toBe("Awaiting Release");
  });

  it("buyer-favor resolved → Refund Pending", () => {
    const r = deriveDisputeDisplay({
      disputeStatus: "resolved",
      outcome: { outcome_type: "refund_buyer" },
      moneyStatus: "refund_pending",
    });
    expect(r?.label).toBe("Refund Pending");
  });

  it("resolved disputes never surface 'In Dispute'", () => {
    const r = deriveDisputeDisplay({
      disputeStatus: "resolved",
      outcome: { outcome_type: "release_funds_to_seller" },
      moneyStatus: "funds_pending_release",
    });
    expect(r?.label).not.toMatch(/in dispute/i);
  });

  it("renders NGN amounts with 2 decimals", () => {
    expect(formatMoney(5200, "NGN")).toMatch(/5,200\.00/);
    expect(formatMoney(5200000, "NGN")).toMatch(/5,200,000\.00/);
  });
});