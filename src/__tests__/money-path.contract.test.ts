/**
 * @vitest-environment node
 *
 * Source-level contracts on the money path.
 *
 * These read the edge function sources the same way auth-precedes-answers
 * does, because the deployed functions cannot be exercised from CI with a
 * real charge. A source contract cannot prove the deployed copy matches,
 * and does not claim to; what it can do is stop the repository's copy of
 * the money path from losing its guarantees silently, which is how both of
 * the defects below shipped in the first place.
 *
 * 1. verify-paystack-payment must compare the amount Paystack actually
 *    collected against the amount the payment row was initiated for,
 *    before anything is marked paid. Until the audit, "status: success"
 *    alone marked the transaction paid.
 *
 * 2. verify-paystack-payment must refuse a payment row that is not
 *    "pending". initiate marks superseded rows "failed" before issuing a
 *    fresh charge, but verify never refused them, so a buyer keeping the
 *    older, cheaper Paystack link open could complete it after a retry.
 *
 * 3. resolve-share-token answers to a bare share token with no login, and
 *    must not select or return seller_payout_amount. No buyer screen
 *    consumed it; it was one devtools tab from disclosing the seller's cut.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("money path contracts", () => {
  const verifySrc = stripComments(
    readFileSync("supabase/functions/verify-paystack-payment/index.ts", "utf8"),
  );
  const resolveSrc = stripComments(
    readFileSync("supabase/functions/resolve-share-token/index.ts", "utf8"),
  );

  it("verify compares paid amount to the initiated amount", () => {
    // The comparison, not merely the ingredients: psData.amount converted
    // out of kobo on one side, the payment row's amount on the other, and
    // an amount_mismatch refusal path.
    expect(verifySrc).toMatch(/koboToNairaSafe\(psData\.amount\)/);
    expect(verifySrc).toMatch(/payment\.amount/);
    expect(verifySrc).toContain("amount_mismatch");
    // The refusal must precede the paid transition: the mismatch return
    // appears in the source before the first money_status update to a paid
    // state. Ordering by index is crude but it is exactly the property that
    // matters and it survives refactors that keep the shape.
    const mismatchAt = verifySrc.indexOf("amount_mismatch");
    const paidAt = verifySrc.search(/money_status:\s*"(secured|held|paid)/);
    expect(mismatchAt).toBeGreaterThan(-1);
    if (paidAt !== -1) expect(mismatchAt).toBeLessThan(paidAt);
  });

  it("verify refuses a payment row that is not pending", () => {
    expect(verifySrc).toMatch(/payment\.status\s*!==\s*"pending"/);
  });

  it("resolve-share-token does not ship the seller's payout", () => {
    expect(resolveSrc).not.toContain("seller_payout_amount");
  });
});
