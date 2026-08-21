import { describe, expect, it } from "vitest";
import {
  buildCanonicalFinancials,
  checkCaptureIdentity,
  checkEscrowMovementIdentity,
  escrowBalanceMinor,
  type BuildInput,
} from "../financial-model.ts";

/**
 * Item 7 anti-regression: a release must book `payout_debit` at NET
 * (`seller_payout_amount`) with the matching `fee_record` entries already on
 * the chain, so that
 *   payment_credit = payout_debit + fee_record
 * reconciles with no compensating adjustment.
 */
const ITEM = "20000.00";
const PLATFORM_FEE = "400.00";
const PROCESSING_FEE = "380.00";
const BUYER_TOTAL = "20780.00";

function simulateRelease(payoutDebit: string): BuildInput {
  return {
    transactionId: "tx-release",
    pricing: {
      currency_code: "NGN",
      item_amount: ITEM,
      platform_fee_amount: PLATFORM_FEE,
      payment_processing_fee_amount: PROCESSING_FEE,
      seller_payout_amount: ITEM,
      buyer_total_amount: BUYER_TOTAL,
    },
    ledger: [
      { entry_type: "payment_credit", amount: BUYER_TOTAL },
      { entry_type: "fee_record", amount: PROCESSING_FEE },
      { entry_type: "fee_record", amount: PLATFORM_FEE },
      { entry_type: "escrow_hold", amount: ITEM },
      { entry_type: "payout_debit", amount: payoutDebit },
    ],
    payments: [{ status: "succeeded", amount: BUYER_TOTAL }],
    payouts: [{ status: "completed", amount: payoutDebit }],
    refunds: [],
  };
}

describe("release ledger invariants", () => {
  it("net payout_debit + fee_record reconciles the capture and movement identities", () => {
    const input = simulateRelease(ITEM);
    const built = buildCanonicalFinancials(input);
    expect(checkCaptureIdentity(built)).toBe(true);
    expect(checkEscrowMovementIdentity(input.ledger)).toBe(true);
    // payment_credit == payout_debit + fee_record
    expect(built.amount_captured).toBe(built.payout_amount + built.fees_retained);
    // escrow fully drained by the net release
    expect(built.available_escrow).toBe(0);
    expect(built.invariants).toEqual([]);
  });

  it("a gross payout_debit (the legacy bug) breaks the movement identity", () => {
    const input = simulateRelease(BUYER_TOTAL);
    const built = buildCanonicalFinancials(input);
    expect(built.amount_captured).not.toBe(built.payout_amount + built.fees_retained);
    // Booking gross drives the escrow position negative. An impossible state
    // that previously had to be papered over with a compensating adjustment.
    expect(escrowBalanceMinor(input.ledger)).toBeLessThan(0);
  });
});
