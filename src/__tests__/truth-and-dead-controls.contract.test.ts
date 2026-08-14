/**
 * PHASE 0 CONTRACT — truth and dead controls.
 *
 * Locks the removal of fabricated trust signals (ratings, review counts,
 * transaction counts, response times, unconditional Verified badges, fake
 * testimonials, placeholder contact details) and guarantees that every support
 * control on the money screens actually does something.
 *
 * These are source-level assertions on purpose: they fail the moment the
 * fabricated markup reappears anywhere in `src/`, which is exactly the
 * regression we are guarding against.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FEE_NAME, FEE_CAPTION, REFUND_BULLET } from "@/lib/payment/fee-policy";
import { PRICING_LINE_LABELS } from "@/lib/payment/payment-labels";

const SRC = path.resolve(__dirname, "..");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

const FILES = walk(SRC);
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

describe("no fabricated trust signals anywhere in src/", () => {
  const BANNED: [string, RegExp][] = [
    ["fabricated reviewer Adebayo Ogunlesi", /Adebayo Ogunlesi/],
    ["fabricated reviewer Ngozi Eze", /Ngozi Eze/],
    ["VERIFIED PURCHASE badge", /VERIFIED PURCHASE/],
    ["placeholderReviews constant", /placeholderReviews/],
    ["placeholder support address", /support@safedeal\.example/],
    ["placeholder contact banner", /Placeholder contact details/],
    ["invented review count", /Based on \d+ reviews/],
    ["invented transaction count", /\d+ transactions["'`<·]/],
    ["invented response time", /Under 2 hours/],
  ];

  for (const [name, re] of BANNED) {
    it(`does not contain ${name}`, () => {
      const hits = FILES.filter((f) => re.test(fs.readFileSync(f, "utf8"))).map((f) =>
        path.relative(SRC, f),
      );
      expect(hits).toEqual([]);
    });
  }

  it("has no hardcoded star ratings on buyer-facing surfaces", () => {
    const surfaces = [
      "pages/PublicProductDetail.tsx",
      "pages/BuyerTransactionDetail.tsx",
      "pages/BuyerTransactionTracking.tsx",
      "pages/StorefrontCheckout.tsx",
      "components/verification/VerificationSidebar.tsx",
    ];
    for (const rel of surfaces) {
      expect(read(rel), rel).not.toMatch(/>\s*4\.[0-9]\s*</);
      expect(read(rel), rel).not.toMatch(/["'`]4\.[0-9](\s|·|["'`])/);
    }
  });
});

describe("PublicProductDetail shows an honest reviews empty state", () => {
  const src = read("pages/PublicProductDetail.tsx");
  it("renders a No reviews yet state", () => {
    expect(src).toContain("No reviews yet");
  });
  it("renders no rating distribution bars", () => {
    expect(src).not.toContain("@/components/ui/progress");
  });
});

describe("BuyerTransactionDetail seller card is bound to real verification state", () => {
  const src = read("pages/BuyerTransactionDetail.tsx");

  it("gates every Verified badge on seller.is_verified", () => {
    const verifiedBadges = [...src.matchAll(/Verified\s*<\/Badge>/g)];
    expect(verifiedBadges.length).toBeGreaterThan(0);
    // Both the desktop and the mobile copy must be behind the flag.
    const gated = [...src.matchAll(/seller\.is_verified\s*\?/g)];
    expect(gated.length).toBe(verifiedBadges.length);
  });

  it("gates the inline BadgeCheck ticks on seller.is_verified", () => {
    const inlineTicks = [...src.matchAll(/seller\.is_verified\s*&&/g)];
    expect(inlineTicks.length).toBeGreaterThanOrEqual(2);
  });

  it("shows no invented rating, transaction count or response time", () => {
    expect(src).not.toMatch(/4\.9/);
    expect(src).not.toMatch(/127/);
    expect(src).not.toMatch(/Response Time/);
  });
});

describe("no dead controls on the money screens", () => {
  const targets = ["pages/BuyerTransactionDetail.tsx", "pages/BuyerPaymentSummary.tsx"];

  for (const rel of targets) {
    it(`every <button> in ${rel} has a handler`, () => {
      const src = read(rel);
      const tags = [...src.matchAll(/<button\b[\s\S]*?>/g)].map((m) => m[0]);
      const dead = tags.filter((t) => !/onClick|type="submit"|disabled/.test(t));
      expect(dead).toEqual([]);
    });

    it(`${rel} routes support actions to /contact with the transaction reference`, () => {
      const src = read(rel);
      expect(src).toMatch(/\/contact\?/);
      expect(src).toMatch(/ref=/);
    });
  }

  it("DropdownMenuItem support entries in the transaction detail have handlers", () => {
    const src = read("pages/BuyerTransactionDetail.tsx");
    const items = [...src.matchAll(/<DropdownMenuItem\b[^>]*>/g)].map((m) => m[0]);
    expect(items.length).toBeGreaterThan(0);
    expect(items.filter((t) => !t.includes("onClick"))).toEqual([]);
  });
});

describe("/contact is a working form, not a placeholder", () => {
  const src = read("pages/Contact.tsx");
  it("submits through the contact service", () => {
    expect(src).toContain("submitContactMessage");
    expect(src).toContain("<form");
  });
  it("prefills the transaction reference from the query string", () => {
    expect(src).toContain('params.get("ref")');
  });
});

describe("the cancelled page never attributes a reason it does not know", () => {
  const src = read("pages/TransactionCancelled.tsx");
  it("does not hardcode Buyer Declined Transaction", () => {
    expect(src).not.toContain("Buyer Declined Transaction");
  });
  it("reads the recorded reason and actor", () => {
    expect(src).toContain("cancellation_reason");
    expect(src).toContain("cancelled_by_role");
  });
  it("falls back to a non-attributing sentence", () => {
    expect(src).toContain("This transaction was cancelled");
  });
});

describe("one fee name and one refund sentence, shared", () => {
  it("the fee name is bound to the canonical pricing label", () => {
    expect(FEE_NAME).toBe(PRICING_LINE_LABELS.service_fee_amount);
  });

  it("the refund copy is internally consistent with a non-refundable fee", () => {
    expect(REFUND_BULLET).toContain(FEE_NAME);
    expect(FEE_CAPTION).toMatch(/not refunded/i);
  });

  it("no screen re-words the fee or the refund promise inline", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      if (f.endsWith("fee-policy.ts")) continue;
      const s = fs.readFileSync(f, "utf8");
      if (/Full refund if item/i.test(s)) offenders.push(path.relative(SRC, f));
      if (/Includes payment processing/i.test(s)) offenders.push(path.relative(SRC, f));
      if (/SafeDeal Protection Fee|SafeDeal Service Fee/.test(s)) offenders.push(path.relative(SRC, f));
    }
    expect(offenders).toEqual([]);
  });
});
