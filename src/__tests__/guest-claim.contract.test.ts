/**
 * The share-token pay path attaches identity, atomically (plan 4.1).
 *
 * The frontend has held up its half since #33: seeing is public, paying is
 * not, and `requireIdentity()` sends an anonymous buyer to make an account
 * with `returnTo` pointing straight back at `/t/:shareToken/pay`. The
 * backend half was missing. `initiate-paystack-payment` refused everyone
 * except the transaction's recorded buyer, and nothing anywhere ever made
 * the account a guest just created into that buyer. The whole sign-up round
 * trip therefore ended at "Only the buyer can initiate payment", a 403 the
 * buyer could do nothing about.
 *
 * The fix keeps identity attachment at the point money moves, which is the
 * same principle the frontend states: an unclaimed transaction (buyer_id
 * null) is claimed by the first signed-in link holder to initiate payment,
 * with a conditional UPDATE so a race between two claimers has exactly one
 * winner. A transaction already bound to someone else still refuses.
 *
 * Like guest-pay.contract, this reads the source rather than calling the
 * live function: the live path needs credentials and a seeded unclaimed
 * transaction, and the defect this guards against (the claim quietly
 * becoming unconditional, or disappearing) is visible in the source.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const FN = "supabase/functions/initiate-paystack-payment/index.ts";

/** Strip comments so prose (including this file's own story) cannot satisfy a check. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("share-token pay attaches the guest's new identity", () => {
  const src = code(fs.readFileSync(path.join(ROOT, FN), "utf8"));

  it("still refuses a caller when the transaction is bound to someone else", () => {
    expect(
      src.includes("Only the buyer can initiate payment"),
      "the strict refusal for a transaction bound to another account must remain",
    ).toBe(true);
    expect(
      /tx\.buyer_id !== null && tx\.buyer_id !== userId/.test(src),
      "the refusal must fire only for a mismatch, never for an unclaimed " +
        "(null) buyer, or the guest journey dead-ends at 403 again",
    ).toBe(true);
  });

  it("claims an unclaimed transaction with a conditional update", () => {
    // The atomicity lives in the WHERE clause: update ... where buyer_id is
    // null. Two racing claimers cannot both match it, so exactly one wins
    // and the loser gets the same refusal a stranger gets.
    expect(
      /\.update\(\{ buyer_id: userId \}\)[\s\S]{0,200}\.is\("buyer_id", null\)/.test(src),
      "the claim must be a conditional update guarded by buyer_id IS NULL; " +
        "an unconditional update lets a second claimer silently steal a " +
        "transaction the first has already paid into",
    ).toBe(true);
  });

  it("claims only a transaction that is genuinely payable", () => {
    // Binding a buyer to a cancelled or already-paid transaction creates a
    // relationship money never confirmed. The claim must sit after the
    // status gate, so it can only happen on the awaiting_payment path.
    const claimAt = src.indexOf('.is("buyer_id", null)');
    const statusGateAt = src.indexOf("Invalid state: status=");
    expect(claimAt, "the conditional claim must exist").toBeGreaterThan(-1);
    expect(
      claimAt,
      "the claim must come after the awaiting_payment check",
    ).toBeGreaterThan(statusGateAt);
  });

  it("fills the buyer participant seat without overwriting an occupied one", () => {
    expect(
      /transaction_participants[\s\S]{0,400}\.is\("user_id", null\)/.test(src),
      "the participants update must be guarded by user_id IS NULL so a seat " +
        "already held by an account is never reassigned",
    ).toBe(true);
  });

  it("leaves an audit event for the claim", () => {
    expect(
      src.includes("buyer_claimed_by_link"),
      "claiming by link is an ownership change and must appear in " +
        "transaction_events like every other one",
    ).toBe(true);
  });
});
