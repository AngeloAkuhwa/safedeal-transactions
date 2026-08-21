import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MAX_OPEN_DISPUTES_BY_LEVEL,
  countOpenDisputes,
  isAtOpenDisputeCap,
  isDisputeStillAllowed,
  maxOpenDisputesForLevel,
} from "../dispute-limits";

const verifySrc = readFileSync(
  resolve(process.cwd(), "supabase/functions/transaction-verify/index.ts"),
  "utf8",
);
const buyerDisputesSrc = readFileSync(
  resolve(process.cwd(), "supabase/functions/buyer-disputes/index.ts"),
  "utf8",
);
const cronSrc = readFileSync(
  resolve(process.cwd(), "supabase/functions/flag-stuck-confirmations/index.ts"),
  "utf8",
);

describe("per-tier open dispute cap", () => {
  it("exposes the documented caps per verification level", () => {
    expect(MAX_OPEN_DISPUTES_BY_LEVEL).toEqual({
      unverified: 0,
      basic_verified: 1,
      trusted_buyer: 3,
      high_trust_buyer: 5,
    });
  });

  it("treats unknown/missing levels as unverified (cap 0)", () => {
    expect(maxOpenDisputesForLevel(undefined)).toBe(0);
    expect(maxOpenDisputesForLevel("bogus")).toBe(0);
  });

  it("counts only non-resolved disputes as open", () => {
    const rows = [
      { status: "open" },
      { status: "seller_response_pending" },
      { status: "under_review" },
      { status: "escalated" },
      { status: "resolved" },
      { status: "closed" },
    ];
    expect(countOpenDisputes(rows)).toBe(4);
  });

  it("blocks at or above the cap and allows below it", () => {
    expect(isAtOpenDisputeCap("basic_verified", 0)).toBe(false);
    expect(isAtOpenDisputeCap("basic_verified", 1)).toBe(true);
    expect(isAtOpenDisputeCap("trusted_buyer", 2)).toBe(false);
    expect(isAtOpenDisputeCap("trusted_buyer", 3)).toBe(true);
    expect(isAtOpenDisputeCap("high_trust_buyer", 4)).toBe(false);
    expect(isAtOpenDisputeCap("high_trust_buyer", 5)).toBe(true);
    expect(isAtOpenDisputeCap("unverified", 0)).toBe(true);
  });

  it("is enforced server-side in transaction-verify raiseDispute", () => {
    expect(verifySrc).toContain('from "../_shared/dispute-limits.ts"');
    expect(verifySrc).toContain("isAtOpenDisputeCap");
    expect(verifySrc).toContain("dispute_limit_reached");
  });

  it("buyer-disputes reads the same shared map so the caps cannot drift", () => {
    expect(buyerDisputesSrc).toContain('from "../_shared/dispute-limits.ts"');
    expect(buyerDisputesSrc).not.toMatch(/const MAX_OPEN_DISPUTES_BY_LEVEL/);
  });
});

describe("dispute recourse after the verification deadline", () => {
  const held = {
    status: "delivered_awaiting_verification",
    money_status: "funds_held_in_escrow",
    dispute_status: "none",
  };

  it("still allows a dispute while the case is unresolved and funds are held", () => {
    expect(isDisputeStillAllowed(held)).toBe(true);
    expect(isDisputeStillAllowed({ ...held, status: "under_review" })).toBe(true);
  });

  it("does not depend on verification_deadline_at at all", () => {
    // deadline long past: recourse must remain
    expect(isDisputeStillAllowed({ ...held, verification_deadline_at: "2000-01-01T00:00:00Z" } as never)).toBe(true);
  });

  it("blocks once the money has left escrow or the case moved on", () => {
    expect(isDisputeStillAllowed({ ...held, money_status: "funds_released" })).toBe(false);
    expect(isDisputeStillAllowed({ ...held, status: "completed" })).toBe(false);
    expect(isDisputeStillAllowed({ ...held, dispute_status: "open" })).toBe(false);
  });

  it("raiseDispute no longer hard-410s on an expired verification window", () => {
    const raiseBody = verifySrc.slice(verifySrc.indexOf("async function raiseDispute"));
    expect(raiseBody).not.toContain("Verification window has expired");
    expect(raiseBody).toContain("isDisputeStillAllowed");
  });
});

describe("no recourse dead-zone in flag-stuck-confirmations", () => {
  it("flags as soon as the transaction's own verification deadline passes", () => {
    expect(cronSrc).toContain("verification_deadline_at");
    expect(cronSrc).not.toContain("BUYER_TIMEOUT_HOURS");
  });

  it("stays idempotent by only scanning unflagged transactions", () => {
    expect(cronSrc).toContain('.eq("needs_release_review", false)');
  });
});
