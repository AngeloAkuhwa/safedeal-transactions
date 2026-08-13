import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SHARE_LINK_TTL_DAYS,
  shareLinkExpiresAt,
  isShareLinkExpired,
  resolveCancelActorRole,
  canCancelTransaction,
} from "../share-links";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const declineSrc = read("supabase/functions/decline-transaction/index.ts");
const resolveSrc = read("supabase/functions/resolve-share-token/index.ts");

const TX = {
  seller_id: "seller-1",
  buyer_id: "buyer-1",
  buyer_contact_email: "invited@example.com",
};

describe("decline-transaction authorization", () => {
  it("allows the buyer and the seller", () => {
    expect(resolveCancelActorRole({ userId: "buyer-1" }, TX)).toBe("buyer");
    expect(resolveCancelActorRole({ userId: "seller-1" }, TX)).toBe("seller");
  });

  it("rejects a random link holder (403 path)", () => {
    expect(canCancelTransaction({ userId: "stranger-9" }, TX)).toBe(false);
    expect(resolveCancelActorRole({ userId: "stranger-9", email: "x@y.com" }, TX)).toBeNull();
  });

  it("rejects an unauthenticated caller (no user id)", () => {
    expect(canCancelTransaction({ userId: "" }, TX)).toBe(false);
  });

  it("allows the invited buyer by contact email only when no buyer is bound", () => {
    const unbound = { ...TX, buyer_id: null };
    expect(resolveCancelActorRole({ userId: "u2", email: "INVITED@example.com " }, unbound))
      .toBe("invited_buyer");
    expect(resolveCancelActorRole({ userId: "u2", email: "invited@example.com" }, TX)).toBeNull();
  });

  it("requires a bearer token and resolves the caller in code", () => {
    expect(declineSrc).toMatch(/authHeader\?\.startsWith\("Bearer "\)/);
    expect(declineSrc).toMatch(/status: 401/);
    expect(declineSrc).toMatch(/auth\.getUser\(accessToken\)/);
    expect(declineSrc).toMatch(/resolveCancelActorRole/);
    expect(declineSrc).toMatch(/status: 403/);
  });

  it("attributes history rows to the real caller, not the buyer", () => {
    expect(declineSrc).not.toMatch(/changed_by_user_id:\s*tx\.buyer_id/);
    expect(declineSrc.match(/changed_by_user_id:\s*callerId/g)?.length).toBe(2);
  });

  it("keeps the cancellable-status guard and stock release", () => {
    expect(declineSrc).toMatch(/CANCELLABLE_STATUSES/);
    expect(declineSrc).toMatch(/reserved_quantity/);
  });
});

describe("resolve-share-token does not leak the seller email", () => {
  it("does not select or return the seller email", () => {
    expect(resolveSrc).not.toMatch(/email:\s*sellerRes\.data\.email/);
    expect(resolveSrc).not.toMatch(/select\("full_name, avatar_url, email/);
    expect(resolveSrc).toMatch(/full_name: sellerRes\.data\.full_name/);
    expect(resolveSrc).toMatch(/member_since: sellerRes\.data\.created_at/);
  });
});

describe("share link expiry", () => {
  it("defaults to a 14 day lifetime", () => {
    expect(SHARE_LINK_TTL_DAYS).toBe(14);
    const base = new Date("2026-01-01T00:00:00.000Z");
    expect(shareLinkExpiresAt(base)).toBe("2026-01-15T00:00:00.000Z");
  });

  it("flags expired links", () => {
    expect(isShareLinkExpired("2020-01-01T00:00:00.000Z")).toBe(true);
    expect(isShareLinkExpired(null)).toBe(false);
  });

  it("is applied at every share-link insert site", () => {
    for (const fn of ["cart-checkout", "storefront-checkout", "claim-offer"]) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      const idx = src.indexOf('from("transaction_links")');
      expect(idx, `${fn} inserts a transaction_links row`).toBeGreaterThan(-1);
      expect(src.slice(idx, idx + 400)).toMatch(/expires_at: shareLinkExpiresAt\(\)/);
    }
  });

  it("keeps the 410 expiry checks on read paths", () => {
    expect(resolveSrc).toMatch(/status: 410/);
    expect(declineSrc).toMatch(/status: 410/);
  });
});
