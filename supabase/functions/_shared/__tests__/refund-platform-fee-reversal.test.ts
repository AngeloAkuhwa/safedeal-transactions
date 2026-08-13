import { describe, expect, it } from "vitest";
import { planPlatformFeeReversal } from "../refund-eligibility.ts";
import {
  buildCanonicalFinancials,
  checkCaptureIdentity,
  checkEscrowMovementIdentity,
  escrowBalanceMinor,
  type BuildInput,
} from "../financial-model.ts";

/**
 * Money-layer anti-regression: a seller/platform-fault refund is
 * item + SafeDeal platform fee (processing fee non-refundable). Escrow only
 * holds the item amount, so the platform fee must be reversed back into the
 * available pool for the refund to execute and for the ledger to net to zero.
 */
const ITEM = "20000.00";
const PLATFORM_FEE = "400.00";
const PROCESSING_FEE = "380.00";
const BUYER_TOTAL = "20780.00";

const ITEM_MINOR = 2_000_000;
const PLATFORM_FEE_MINOR = 40_000;
const REFUND_MINOR = ITEM_MINOR + PLATFORM_FEE_MINOR;

function captureLedger() {
  return [
    { entry_type: "payment_credit", amount: BUYER_TOTAL },
    { entry_type: "fee_record", amount: PROCESSING_FEE },
    { entry_type: "fee_record", amount: PLATFORM_FEE },
    { entry_type: "escrow_hold", amount: ITEM },
  ];
}

function simulateRefund(): BuildInput {
  return {
    transactionId: "tx-refund",
    pricing: {
      currency_code: "NGN",
      item_amount: ITEM,
      platform_fee_amount: PLATFORM_FEE,
      payment_processing_fee_amount: PROCESSING_FEE,
      seller_payout_amount: ITEM,
      buyer_total_amount: BUYER_TOTAL,
    },
    ledger: [
      ...captureLedger(),
      // compensating reversal of the SafeDeal fee into the available pool
      { entry_type: "adjustment", amount: PLATFORM_FEE },
      { entry_type: "refund_debit", amount: "20400.00" },
    ],
    payments: [{ status: "succeeded", amount: BUYER_TOTAL }],
    payouts: [],
    refunds: [{ status: "completed", amount: "20400.00" }],
  };
}

describe("refund platform-fee reversal parity", () => {
  it("accepts a full item + platform fee refund by reversing the fee", () => {
    const plan = planPlatformFeeReversal({
      requiredMinor: REFUND_MINOR,
      availableMinor: ITEM_MINOR,
      platformFeeBookedMinor: PLATFORM_FEE_MINOR,
    });
    expect(plan.accepted).toBe(true);
    expect(plan.reversalMinor).toBe(PLATFORM_FEE_MINOR);
    expect(plan.availableAfterMinor).toBe(REFUND_MINOR);
  });

  it("needs no reversal for an item-only (buyer-fault) refund", () => {
    const plan = planPlatformFeeReversal({
      requiredMinor: ITEM_MINOR,
      availableMinor: ITEM_MINOR,
      platformFeeBookedMinor: PLATFORM_FEE_MINOR,
    });
    expect(plan.accepted).toBe(true);
    expect(plan.reversalMinor).toBe(0);
  });

  it("rejects a refund above item + platform fee (processing fee stays non-refundable)", () => {
    const plan = planPlatformFeeReversal({
      requiredMinor: REFUND_MINOR + 1,
      availableMinor: ITEM_MINOR,
      platformFeeBookedMinor: PLATFORM_FEE_MINOR,
    });
    expect(plan.accepted).toBe(false);
    expect(plan.reversalMinor).toBe(0);
  });

  it("does not reverse the same platform fee twice", () => {
    const plan = planPlatformFeeReversal({
      requiredMinor: REFUND_MINOR,
      availableMinor: ITEM_MINOR,
      platformFeeBookedMinor: PLATFORM_FEE_MINOR,
      alreadyReversedMinor: PLATFORM_FEE_MINOR,
    });
    expect(plan.accepted).toBe(false);
  });

  it("capture identity holds and the refunded ledger nets to zero", () => {
    const input = simulateRefund();
    const built = buildCanonicalFinancials(input);
    // payment_credit = escrow_hold + both fee_records
    expect(checkCaptureIdentity(built)).toBe(true);
    expect(checkEscrowMovementIdentity(input.ledger)).toBe(true);
    // refund_debit + reversal drain the escrow pool exactly
    expect(escrowBalanceMinor(input.ledger)).toBe(0);
    expect(built.available_escrow).toBe(0);
    expect(built.invariants).toEqual([]);
  });
});
