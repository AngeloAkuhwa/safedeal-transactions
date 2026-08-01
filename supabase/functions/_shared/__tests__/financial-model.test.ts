import { describe, expect, it } from "vitest";
import {
  buildCanonicalFinancials,
  canDisburse,
  canRelease,
  checkCaptureIdentity,
  checkEscrowMovementIdentity,
  escrowBalanceMinor,
  InvariantError,
  MAX_MINOR,
  parseMinor,
  parseMinorOrThrow,
  payoutCompletionDisplay,
  pendingReleaseSlaState,
  VALUE_AFFECTING_TYPES,
  type BuildInput,
  type LedgerRow,
} from "../financial-model.ts";

/* ---------------- fixtures ---------------- */

const base = (over: Partial<BuildInput> = {}): BuildInput => ({
  transactionId: "tx-1",
  pricing: {
    currency_code: "NGN",
    item_amount: "12345.00",
    platform_fee_amount: "481.46",
    payment_processing_fee_amount: "53.54",
    seller_payout_amount: "12345.00",
    buyer_total_amount: "12880.00",
  },
  ledger: [
    { entry_type: "payment_credit", amount: "12880.00" },
    { entry_type: "escrow_hold", amount: "12345.00" },
    { entry_type: "fee_record", amount: "535.00" },
  ],
  payments: [{ status: "succeeded", amount: "12880.00" }],
  payouts: [],
  refunds: [],
  ...over,
});

/* ---------------- exact decimal ingestion ---------------- */

describe("parseMinor", () => {
  it("converts numeric strings exactly without float error", () => {
    expect(parseMinor("12345.67", { field: "f" }).value).toBe(1234567);
    expect(parseMinor("0.07", { field: "f" }).value).toBe(7);
    expect(parseMinor("1.005", { field: "f" }).value).toBe(101); // half-up once
    expect(parseMinor("1.004", { field: "f" }).value).toBe(100);
    expect(parseMinor("100", { field: "f" }).value).toBe(10000);
  });

  it("fails closed on invalid money instead of clamping to zero", () => {
    for (const bad of ["-5.00", "abc", "", null, undefined, NaN, Infinity]) {
      const r = parseMinor(bad as never, { field: "amount" });
      expect(r.ok).toBe(false);
      expect(r.issue).toBeTruthy();
    }
  });

  it("allows negative values only for signed fields", () => {
    expect(parseMinor("-5.00", { field: "adjustment", signed: true }).value).toBe(-500);
    expect(parseMinor("-5.00", { field: "adjustment" }).ok).toBe(false);
  });

  it("rejects unsafe integers and overflow", () => {
    expect(parseMinor("999999999999999999", { field: "f" }).ok).toBe(false);
    expect(parseMinor(String(MAX_MINOR / 100 + 1), { field: "f" }).ok).toBe(false);
  });

  it("throws InvariantError in strict mode", () => {
    expect(() => parseMinorOrThrow("-1", { field: "f" })).toThrow(InvariantError);
  });
});

/* ---------------- conservation identities ---------------- */

describe("conservation identities", () => {
  it("mirrors escrow_available_balance exactly", () => {
    const ledger: LedgerRow[] = [
      { entry_type: "payment_credit", amount: "1000.00" },
      { entry_type: "escrow_hold", amount: "900.00" },
      { entry_type: "fee_record", amount: "100.00" },
      { entry_type: "freeze_hold", amount: "500.00" },
      { entry_type: "adjustment", amount: "50.00" },
      { entry_type: "payout_debit", amount: "200.00" },
      { entry_type: "refund_debit", amount: "100.00" },
      { entry_type: "payout_awaiting_release", amount: "300.00" },
    ];
    // 900 + 50 - 200 - 100 = 650
    expect(escrowBalanceMinor(ledger)).toBe(65000);
    expect(checkEscrowMovementIdentity(ledger)).toBe(true);
  });

  it("holds identity (A) on live-shaped totals", () => {
    expect(checkCaptureIdentity({
      amount_captured: 428766900, amount_in_escrow: 425972500, fees_retained: 2794400,
    })).toBe(true);
  });

  it("does not add historical escrow funding to remaining balance", () => {
    const f = buildCanonicalFinancials(base());
    expect(f.amount_in_escrow).toBe(1234500);
    expect(f.remaining_balance).toBe(f.available_escrow);
    expect(f.amount_captured).toBe(f.amount_in_escrow + f.fees_retained);
    expect(f.reconciliation_status).toBe("reconciled");
  });

  it("flags a capture identity violation as a mismatch", () => {
    const f = buildCanonicalFinancials(base({
      ledger: [
        { entry_type: "escrow_hold", amount: "12345.00" },
        { entry_type: "fee_record", amount: "1.00" },
      ],
    }));
    expect(f.reconciliation_status).toBe("mismatch");
    expect(f.mutations_blocked).toBe(true);
  });
});

/* ---------------- payment status vocabulary ---------------- */

describe("payment statuses", () => {
  it("uses only real enum values for authorised and captured", () => {
    const f = buildCanonicalFinancials(base({
      payments: [
        { status: "authorized", amount: "500.00" },
        { status: "succeeded", amount: "12880.00" },
        { status: "failed", amount: "999.00" },
        { status: "pending", amount: "999.00" },
        { status: "refunded", amount: "999.00" },
      ],
    }));
    expect(f.amount_authorised).toBe(1338000);
    expect(f.amount_captured).toBe(1288000);
  });
});

/* ---------------- settlement separation ---------------- */

describe("settlement amounts stay separate", () => {
  const withPayouts = (statuses: Array<[string, string]>) =>
    buildCanonicalFinancials(base({
      payouts: statuses.map(([status, amount]) => ({ status, amount })),
    }));

  it("separates pending release, pending payout and failed settlement", () => {
    const f = withPayouts([
      ["awaiting_release", "100.00"],
      ["pending", "200.00"],
      ["processing", "300.00"],
      ["failed", "400.00"],
    ]);
    expect(f.pending_release_amount).toBe(10000);
    expect(f.pending_payout_amount).toBe(50000);
    expect(f.failed_settlement_amount).toBe(40000);
    expect(f.committed_amount).toBe(100000);
  });

  it("never labels a failed payout as pending release", () => {
    const f = withPayouts([["failed", "400.00"]]);
    expect(f.pending_release_amount).toBe(0);
    expect(f.financial_execution_status).toBe("failed_settlement");
  });

  it("reduces disbursable by every reserved amount", () => {
    const f = withPayouts([["pending", "200.00"]]);
    expect(f.disbursable).toBe(f.available_escrow - 20000);
  });
});

/* ---------------- release / refund guards ---------------- */

describe("mutation guards", () => {
  it("permits a full release inside the disbursable balance", () => {
    const f = buildCanonicalFinancials(base());
    expect(canRelease(f, 1234500).allowed).toBe(true);
  });

  it("permits a partial release and blocks over-release", () => {
    const f = buildCanonicalFinancials(base());
    expect(canDisburse(f, 100000).allowed).toBe(true);
    expect(canDisburse(f, 9_999_999).allowed).toBe(false);
    expect(canDisburse(f, 0).allowed).toBe(false);
    expect(canDisburse(f, -1).allowed).toBe(false);
  });

  it("blocks release when the seller payout snapshot is missing", () => {
    const f = buildCanonicalFinancials(base({
      pricing: { ...base().pricing!, seller_payout_amount: null },
    }));
    expect(f.seller_release_amount).toBeNull();
    expect(f.seller_release_amount_display_estimate).toBe(1234500);
    expect(f.reconciliation_status).toBe("requires_review");
    expect(canRelease(f, 100).allowed).toBe(false);
    expect(canDisburse(f, 100).allowed).toBe(false);
  });

  it("blocks every mutation when an invariant failed", () => {
    const f = buildCanonicalFinancials(base({
      ledger: [{ entry_type: "escrow_hold", amount: "-1.00" }],
    }));
    expect(f.mutations_blocked).toBe(true);
    expect(canDisburse(f, 1).allowed).toBe(false);
  });
});

/* ---------------- refunds, adjustments, freeze ---------------- */

describe("refunds, adjustments, freeze", () => {
  it("counts only completed refunds", () => {
    const f = buildCanonicalFinancials(base({
      ledger: [
        { entry_type: "payment_credit", amount: "12880.00" },
        { entry_type: "escrow_hold", amount: "12345.00" },
        { entry_type: "fee_record", amount: "535.00" },
        { entry_type: "refund_debit", amount: "1000.00" },
      ],
      refunds: [
        { status: "completed", refund_amount: "1000.00" },
        { status: "pending", refund_amount: "500.00" },
        { status: "failed", refund_amount: "500.00" },
      ],
    }));
    expect(f.refund_amount).toBe(100000);
    expect(f.available_escrow).toBe(1234500 - 100000);
    expect(f.financial_execution_status).toBe("partially_refunded");
  });

  it("treats a reversal as a signed adjustment restoring escrow", () => {
    const f = buildCanonicalFinancials(base({
      ledger: [
        { entry_type: "payment_credit", amount: "12880.00" },
        { entry_type: "escrow_hold", amount: "12345.00" },
        { entry_type: "fee_record", amount: "535.00" },
        { entry_type: "payout_debit", amount: "12345.00" },
        { entry_type: "adjustment", amount: "12345.00" },
      ],
      payouts: [{ status: "reversed", amount: "12345.00" }],
    }));
    expect(f.available_escrow).toBe(1234500);
    expect(f.payout_amount).toBe(0);
  });

  it("nets freeze and unfreeze without touching available escrow", () => {
    const f = buildCanonicalFinancials(base({
      ledger: [
        { entry_type: "payment_credit", amount: "12880.00" },
        { entry_type: "escrow_hold", amount: "12345.00" },
        { entry_type: "fee_record", amount: "535.00" },
        { entry_type: "freeze_hold", amount: "1000.00" },
      ],
    }));
    expect(f.frozen_amount).toBe(100000);
    expect(f.available_escrow).toBe(1234500);
    expect(f.financial_execution_status).toBe("frozen");
    expect(f.disbursable).toBe(1234500 - 100000);
  });
});

/* ---------------- timestamps, SLA, currency ---------------- */

describe("timestamps, SLA and currency", () => {
  it("requires review for a completed payout without a trustworthy timestamp", () => {
    expect(payoutCompletionDisplay({ status: "completed", amount: "1", completed_at: null }))
      .toEqual({ value: null, needs_review: true });
    expect(payoutCompletionDisplay({
      status: "completed", amount: "1", completed_at: null, provider_completed_at: "2026-08-01T10:00:00Z",
    })).toEqual({ value: "2026-08-01T10:00:00Z", needs_review: false });
    expect(payoutCompletionDisplay({ status: "pending", amount: "1" }).needs_review).toBe(false);
  });

  it("derives the SLA state from the injected setting, never a hardcoded 24", () => {
    const now = "2026-08-02T00:00:00Z";
    expect(pendingReleaseSlaState({ pendingSinceIso: "2026-08-01T12:00:00Z", targetHours: 24, nowIso: now }))
      .toBe("normal");
    expect(pendingReleaseSlaState({ pendingSinceIso: "2026-07-30T00:00:00Z", targetHours: 24, nowIso: now }))
      .toBe("requires_review");
    expect(pendingReleaseSlaState({ pendingSinceIso: "2026-08-01T12:00:00Z", targetHours: 6, nowIso: now }))
      .toBe("requires_review");
  });

  it("rejects a mixed-currency ledger rather than summing it", () => {
    const f = buildCanonicalFinancials(base({
      ledger: [
        { entry_type: "payment_credit", amount: "12880.00", currency_code: "NGN" },
        { entry_type: "escrow_hold", amount: "12345.00", currency_code: "USD" },
        { entry_type: "fee_record", amount: "535.00", currency_code: "NGN" },
      ],
    }));
    expect(f.reconciliation_status).toBe("requires_review");
    expect(f.invariants.some((i) => i.code === "currency_mismatch")).toBe(true);
  });
});

/* ---------------- CP2C enforcement surface ---------------- */

describe("value-affecting entry types", () => {
  it("covers every reserving type, not only the four cash-movement types", () => {
    for (const t of [
      "payment_credit", "escrow_hold", "payout_debit", "refund_debit", "adjustment",
      "freeze_hold", "payout_awaiting_release", "dispute_refund_reserved",
      "dispute_release_approved_pending_admin_release",
    ]) expect(VALUE_AFFECTING_TYPES.has(t as never)).toBe(true);
    expect(VALUE_AFFECTING_TYPES.has("fee_record" as never)).toBe(false);
    expect(VALUE_AFFECTING_TYPES.has("dispute_no_action" as never)).toBe(false);
  });
});
