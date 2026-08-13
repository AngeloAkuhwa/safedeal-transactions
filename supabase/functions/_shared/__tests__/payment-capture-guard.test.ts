import { describe, expect, it } from "vitest";
import {
  checkReferenceBinding,
  verifyChargeAgainstSnapshot,
  resolveInitiationCharge,
} from "../payment-capture-guard.ts";

const snapshot = { currency_code: "NGN", buyer_total_amount: "12880.00" };

describe("verifyChargeAgainstSnapshot", () => {
  it("(a) accepts the exact charged amount and currency", () => {
    const r = verifyChargeAgainstSnapshot({ amount: 1288000, currency: "NGN" }, snapshot);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.expectedKobo).toBe(1288000);
      expect(r.chargedKobo).toBe(1288000);
    }
  });

  it("(a) accepts string amounts and lowercase currency", () => {
    expect(verifyChargeAgainstSnapshot({ amount: "1288000", currency: "ngn" }, snapshot).ok).toBe(true);
  });

  it("(b) rejects an underpayment of 1 kobo", () => {
    const r = verifyChargeAgainstSnapshot({ amount: 1287999, currency: "NGN" }, snapshot);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("amount_mismatch");
      expect(r.reason).toBe("amount");
    }
  });

  it("(b) rejects an overpayment of 1 kobo", () => {
    expect(verifyChargeAgainstSnapshot({ amount: 1288001, currency: "NGN" }, snapshot).ok).toBe(false);
  });

  it("(c) rejects a wrong currency even when the numeric amount matches", () => {
    const r = verifyChargeAgainstSnapshot({ amount: 1288000, currency: "USD" }, snapshot);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("amount_mismatch");
      expect(r.reason).toBe("currency");
    }
  });

  it("defaults the snapshot currency to NGN when absent", () => {
    expect(verifyChargeAgainstSnapshot({ amount: 100, currency: "NGN" }, { buyer_total_amount: 1 }).ok).toBe(true);
    expect(verifyChargeAgainstSnapshot({ amount: 100, currency: "GHS" }, { buyer_total_amount: 1 }).ok).toBe(false);
  });

  it("rejects unusable amounts", () => {
    expect(verifyChargeAgainstSnapshot({ amount: null, currency: "NGN" }, snapshot).ok).toBe(false);
    expect(verifyChargeAgainstSnapshot({ amount: 1288000, currency: "NGN" }, { currency_code: "NGN", buyer_total_amount: null }).ok).toBe(false);
  });
});

describe("checkReferenceBinding", () => {
  it("(d) rejects when the advisory reference resolves to a different payment", () => {
    const r = checkReferenceBinding("pay-verified", "pay-other");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("reference_mismatch");
  });

  it("(d) rejects when the advisory reference resolves to nothing", () => {
    expect(checkReferenceBinding("pay-verified", "__unresolved__").ok).toBe(false);
  });

  it("accepts when both resolve to the same payment", () => {
    expect(checkReferenceBinding("pay-verified", "pay-verified").ok).toBe(true);
  });

  it("accepts when no advisory reference was supplied", () => {
    expect(checkReferenceBinding("pay-verified", null).ok).toBe(true);
  });
});

describe("resolveInitiationCharge", () => {
  it("charges the locked snapshot total even when vendor pricing config has since changed", () => {
    // Snapshot locked at checkout: ₦12,880.00
    // Live recomputation after a fee-rate change would produce ₦13,400.00
    const r = resolveInitiationCharge({
      snapshot: { currency_code: "NGN", buyer_total_amount: "12880.00" },
      computed: { currency_code: "NGN", total_amount: 13400 },
    });
    expect(r.source).toBe("snapshot");
    expect(r.total_amount).toBe(12880);
    expect(r.amount_kobo).toBe(1288000);
    expect(r.currency_code).toBe("NGN");
  });

  it("matches the capture-path guard for the same snapshot", () => {
    const snap = { currency_code: "NGN", buyer_total_amount: "12880.00" };
    const charge = resolveInitiationCharge({
      snapshot: snap,
      computed: { currency_code: "NGN", total_amount: 13400 },
    });
    expect(
      verifyChargeAgainstSnapshot({ amount: charge.amount_kobo, currency: charge.currency_code }, snap).ok,
    ).toBe(true);
  });

  it("falls back to live pricing only when no snapshot total exists", () => {
    expect(
      resolveInitiationCharge({ snapshot: null, computed: { currency_code: "NGN", total_amount: 13400 } }),
    ).toMatchObject({ source: "computed", amount_kobo: 1340000 });
    expect(
      resolveInitiationCharge({
        snapshot: { currency_code: "NGN", buyer_total_amount: null },
        computed: { currency_code: "NGN", total_amount: 100 },
      }).source,
    ).toBe("computed");
  });
});
