import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateReleaseBlocks,
  hasOpenDispute,
  hasActiveHold,
  ACTIVE_HOLD_QUEUE_STATUSES,
} from "../dispute-guard";

const coreSrc = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/release-core.ts"),
  "utf8",
);

describe("release dispute/hold guard: rules", () => {
  it("blocks release when a dispute is open on a funds_pending_release transaction", () => {
    expect(evaluateReleaseBlocks([{ status: "open" }], [])).toEqual({ error: "dispute_open" });
  });

  it("blocks for every non-resolved dispute status", () => {
    for (const status of ["open", "seller_response_pending", "under_review", "escalated", "none"]) {
      expect(evaluateReleaseBlocks([{ status }], [])).toEqual({ error: "dispute_open" });
    }
  });

  it("allows release once the dispute is resolved in the seller's favour (queue row pending)", () => {
    expect(
      evaluateReleaseBlocks([{ status: "resolved" }], [{ status: "pending" }]),
    ).toBeNull();
  });

  it("does not block on the normal review states pending/claimed/processing", () => {
    for (const status of ["pending", "claimed", "processing", "released", "resolved", "dismissed"]) {
      expect(evaluateReleaseBlocks([], [{ status }])).toBeNull();
    }
  });

  it("blocks with release_on_hold for a 'held' queue row", () => {
    expect(evaluateReleaseBlocks([{ status: "resolved" }], [{ status: "held" }])).toEqual({
      error: "release_on_hold",
    });
  });

  it("blocks with release_on_hold for an 'awaiting_info' queue row", () => {
    expect(evaluateReleaseBlocks([], [{ status: "awaiting_info" }])).toEqual({
      error: "release_on_hold",
    });
  });

  it("only 'held' and 'awaiting_info' count as active holds", () => {
    expect([...ACTIVE_HOLD_QUEUE_STATUSES]).toEqual(["held", "awaiting_info"]);
  });

  it("open dispute takes precedence over a hold", () => {
    expect(evaluateReleaseBlocks([{ status: "open" }], [{ status: "held" }])).toEqual({
      error: "dispute_open",
    });
  });

  it("allows release when there is nothing on file", () => {
    expect(evaluateReleaseBlocks([], [])).toBeNull();
    expect(evaluateReleaseBlocks(null, undefined)).toBeNull();
    expect(hasOpenDispute(undefined)).toBe(false);
    expect(hasActiveHold(undefined)).toBe(false);
  });
});

describe("release dispute/hold guard: wiring", () => {
  it("releasePayoutCore runs the guard BEFORE release_payout_atomic", () => {
    const guardAt = coreSrc.indexOf("evaluateReleaseBlocks(");
    const rpcAt = coreSrc.indexOf('admin.rpc("release_payout_atomic"');
    expect(guardAt).toBeGreaterThan(-1);
    expect(rpcAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(rpcAt);
  });

  it("does not block merely on needs_release_review", () => {
    const codeLines = coreSrc
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    expect(codeLines.some((l) => l.includes("needs_release_review"))).toBe(false);
  });

  it("refundBuyerCore blocks ad-hoc refunds on an open dispute before start_refund_atomic", () => {
    const guardAt = coreSrc.indexOf("hasOpenDispute(refundDisputes");
    const rpcAt = coreSrc.indexOf('admin.rpc("start_refund_atomic"');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(rpcAt);
  });
});
