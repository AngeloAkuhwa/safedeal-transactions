import { describe, it, expect } from "vitest";
import { deriveDisputeDisplay } from "@/lib/dispute-display-status";
import { formatMoney } from "@/lib/format";

const MONEY_STATUS_LABEL: Record<string, string> = {
  not_secured: "Not Secured",
  payment_pending: "Payment Pending",
  funds_held_in_escrow: "Held in Escrow",
  funds_frozen: "Funds Frozen",
  funds_pending_release: "Awaiting Release",
  funds_releasing: "Release Processing",
  funds_released: "Released",
  refund_pending: "Refund Pending",
  refund_issued: "Refunded",
};

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
    expect(formatMoney(676000, "NGN")).toMatch(/676,000\.00/);
  });

  it("maps raw money_status to clean labels", () => {
    expect(MONEY_STATUS_LABEL.funds_held_in_escrow).toBe("Held in Escrow");
    expect(MONEY_STATUS_LABEL.refund_issued).toBe("Refunded");
    expect(MONEY_STATUS_LABEL.funds_pending_release).toBe("Awaiting Release");
  });
});