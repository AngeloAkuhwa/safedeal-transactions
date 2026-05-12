import { describe, it, expect } from "vitest";
import { deriveDisputeDisplay } from "@/lib/dispute-display-status";
import { formatMoney } from "@/lib/format";

describe("deriveDisputeDisplay", () => {
  it("returns null while dispute is not yet resolved", () => {
    expect(
      deriveDisputeDisplay({
        disputeStatus: "under_review",
        outcome: null,
        moneyStatus: "funds_held_in_escrow",
      }),
    ).toBeNull();
  });

  it("never reports 'In Dispute' once dispute is resolved", () => {
    const cases = [
      { type: "release_funds_to_seller" },
      { type: "refund_buyer" },
      { type: "partial_refund_release", refund_amount: 100, release_amount: 100 },
      { type: "close_case_without_resolution" },
    ] as const;
    for (const c of cases) {
      const r = deriveDisputeDisplay({
        disputeStatus: "resolved",
        outcome: { outcome_type: c.type, ...c },
        moneyStatus: "funds_held_in_escrow",
      });
      expect(r).not.toBeNull();
      expect(r!.label.toLowerCase()).not.toContain("in dispute");
    }
  });

  it("seller-favor outcome displays 'Awaiting Release'", () => {
    for (const t of ["release_funds_to_seller", "dismissed_seller_favor"] as const) {
      const r = deriveDisputeDisplay({
        disputeStatus: "resolved",
        outcome: { outcome_type: t },
        moneyStatus: "funds_pending_release",
      });
      expect(r?.label).toBe("Awaiting Release");
      expect(r?.moneyStatus).toBe("funds_pending_release");
      expect(r?.tone).toBe("info");
    }
  });

  it("buyer-favor outcome displays 'Refund Pending'", () => {
    for (const t of ["refund_buyer", "dismissed_buyer_favor"] as const) {
      const r = deriveDisputeDisplay({
        disputeStatus: "resolved",
        outcome: { outcome_type: t },
        moneyStatus: "refund_pending",
      });
      expect(r?.label).toBe("Refund Pending");
      expect(r?.moneyStatus).toBe("refund_pending");
      expect(r?.tone).toBe("warning");
    }
  });

  it("partial outcome displays 'Partially Resolved' with both amount rows", () => {
    const r = deriveDisputeDisplay({
      disputeStatus: "resolved",
      outcome: {
        outcome_type: "partial_refund_release",
        refund_amount: 1500,
        release_amount: 2500,
      },
      moneyStatus: "refund_pending",
    });
    expect(r?.label).toBe("Partially Resolved");
    expect(r?.parts).toHaveLength(2);
    expect(r?.parts?.[0]).toEqual({ label: "Refund Pending", amount: 1500 });
    expect(r?.parts?.[1]).toEqual({ label: "Release Pending", amount: 2500 });
  });

  it("close-no-action with frozen funds displays 'Manual Action Required'", () => {
    const r = deriveDisputeDisplay({
      disputeStatus: "resolved",
      outcome: { outcome_type: "close_case_without_resolution" },
      moneyStatus: "funds_frozen",
      escrow: { heldAmount: 0, frozenAmount: 5000 },
    });
    expect(r?.label).toBe("Manual Action Required");
    expect(r?.tone).toBe("danger");
    expect(r?.moneyStatus).toBe("funds_frozen");
  });

  it("close-no-action with held funds displays 'Funds Held in Escrow'", () => {
    const r = deriveDisputeDisplay({
      disputeStatus: "resolved",
      outcome: { outcome_type: "close_case_without_resolution" },
      moneyStatus: "funds_held_in_escrow",
      escrow: { heldAmount: 5000, frozenAmount: 0 },
    });
    expect(r?.label).toBe("Funds Held in Escrow");
  });

  it("close-no-action with pending release displays 'Awaiting Release'", () => {
    const r = deriveDisputeDisplay({
      disputeStatus: "resolved",
      outcome: { outcome_type: "close_case_without_resolution" },
      moneyStatus: "funds_pending_release",
    });
    expect(r?.label).toBe("Awaiting Release");
  });
});

describe("formatMoney NGN 2dp", () => {
  it("renders amounts in NGN with exactly 2 decimals", () => {
    expect(formatMoney(1500, "NGN")).toBe("₦1,500.00");
    expect(formatMoney(0, "NGN")).toBe("₦0.00");
    expect(formatMoney(1234567.5, "NGN")).toBe("₦1,234,567.50");
  });
});
