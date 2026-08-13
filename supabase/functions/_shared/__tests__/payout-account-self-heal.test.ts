import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PAYOUT_ACCOUNT_BLOCK_REASONS,
  IN_FLIGHT_PAYOUT_STATUSES,
  blocksPayoutAccountEdit,
  isAccountBlockReason,
  isInFlightPayoutStatus,
} from "../payout-blocking";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const updateSrc = read("supabase/functions/update-payout-account/index.ts");
const sellerSrc = read("supabase/functions/seller-confirm-completion/index.ts");

describe("payout block reason alignment", () => {
  it("covers both reason strings the system writes", () => {
    expect(PAYOUT_ACCOUNT_BLOCK_REASONS).toContain("payout_account_missing");
    expect(PAYOUT_ACCOUNT_BLOCK_REASONS).toContain("payout_account_unverified");
    expect(isAccountBlockReason("payout_account_missing")).toBe(true);
    expect(isAccountBlockReason("dispute_open")).toBe(false);
  });

  it("both functions use the shared constants (no drift)", () => {
    expect(sellerSrc).toMatch(/from "\.\.\/_shared\/payout-blocking\.ts"/);
    expect(sellerSrc).not.toMatch(/payout_blocked_reason: "payout_account_missing"/);
    expect(updateSrc).toMatch(/PAYOUT_ACCOUNT_BLOCK_REASONS/);
    expect(updateSrc).not.toMatch(/\.eq\("payout_blocked_reason", "payout_account_unverified"\)/);
  });
});

describe("self-heal on successful verification", () => {
  it("unblocks blocked payouts for either reason", () => {
    expect(updateSrc).toMatch(/status: "awaiting_release"/);
    expect(updateSrc).toMatch(/release_blocked: false/);
    expect(updateSrc).toMatch(/payout_blocked_reason: null/);
    expect(updateSrc).toMatch(
      /\.in\("payout_blocked_reason", PAYOUT_ACCOUNT_BLOCK_REASONS/,
    );
  });

  it("resolves the open release_review_queue rows", () => {
    expect(updateSrc).toMatch(/release_review_queue/);
    expect(updateSrc).toMatch(/status: "resolved", resolved_at/);
    expect(updateSrc).toMatch(/PAYOUT_ACCOUNT_QUEUE_TYPE/);
    expect(updateSrc).toMatch(/OPEN_RELEASE_REVIEW_STATUSES/);
  });

  it("clears needs_release_review on affected transactions", () => {
    expect(updateSrc).toMatch(/needs_release_review: false, release_review_reason: null/);
  });

  it("reports what was unblocked in the response", () => {
    expect(updateSrc).toMatch(/unblocked_payout_count/);
    expect(updateSrc).toMatch(/unblocked_payout_ids/);
  });
});

describe("payout_in_flight edit guard", () => {
  it("blocks on genuine in-flight release states", () => {
    for (const status of IN_FLIGHT_PAYOUT_STATUSES) {
      expect(isInFlightPayoutStatus(status)).toBe(true);
      expect(blocksPayoutAccountEdit([{ status }])).toBe(true);
    }
    expect(blocksPayoutAccountEdit([{ status: "awaiting_release" }])).toBe(true);
  });

  it("allows the edit when only a blocked payout exists", () => {
    expect(isInFlightPayoutStatus("blocked")).toBe(false);
    expect(blocksPayoutAccountEdit([{ status: "blocked" }])).toBe(false);
    expect(blocksPayoutAccountEdit([{ status: "blocked" }, { status: "completed" }])).toBe(false);
    expect(blocksPayoutAccountEdit([])).toBe(false);
  });

  it("returns 409 payout_in_flight before parking the account", () => {
    expect(updateSrc).toMatch(/error: "payout_in_flight"[\s\S]*?\}, 409\)/);
    const guardIdx = updateSrc.indexOf('"payout_in_flight"');
    const parkIdx = updateSrc.indexOf('verification_status: "requires_update"');
    const paystackIdx = updateSrc.indexOf("createTransferRecipient({");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(parkIdx);
    expect(guardIdx).toBeLessThan(paystackIdx);
  });
});
