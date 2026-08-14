/**
 * PHASE 0 CONTRACT — truth and dead controls.
 *
 * Locks the removal of fabricated trust signals (ratings, review counts,
 * transaction counts, response times, unconditional Verified badges, fake
 * testimonials, placeholder contact details) and guarantees that every support
 * control on the money screens actually does something.
 *
 * Two layers on purpose:
 *  1. Repo-wide GENERIC source scans (patterns, not literal strings) so a new
 *     invented rating or address is caught wherever it is added.
 *  2. Real render tests for the badges and buttons that matter, so gating can
 *     never be faked by matching regex counts.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";
import { FEE_NAME, FEE_CAPTION, REFUND_BULLET } from "@/lib/payment/fee-policy";
import { PRICING_LINE_LABELS } from "@/lib/payment/payment-labels";
import {
  SUPPORT_RESPONSE_PROMISE,
  SUPPORT_RESPONSE_TARGET,
  supportLink,
} from "@/lib/support/support-copy";

const SRC = path.resolve(__dirname, "..");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

const FILES = walk(SRC).filter((f) => !/\.test\.tsx?$/.test(f));

/** Input placeholders are not claims — strip them before scanning for fake data. */
const readScannable = (f: string) =>
  fs
    .readFileSync(f, "utf8")
    .split("\n")
    .filter((line) => !/placeholder=/.test(line))
    .join("\n");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");
const rel = (f: string) => path.relative(SRC, f);

/* ───────────────────────── generic source scans ───────────────────────── */

describe("no fabricated trust signals anywhere in src/", () => {
  const BANNED: [string, RegExp][] = [
    // Generic: any hardcoded x.y star rating rendered as text.
    ["a hardcoded star rating", />\s*[1-5]\.\d\s*</],
    ["a hardcoded rating string literal", /["'`][1-5]\.\d\s*(?:★|stars?|\/\s*5)/i],
    ["an invented review count", /\b(?:Based on\s+)?\d[\d,]*\s+(?:reviews?|ratings?)\b/i],
    ["an invented transaction count", /\b\d[\d,]*\s+(?:completed\s+)?transactions\b/i],
    ["an invented response time", /\b(?:responds?|response time)[^\n]{0,24}\b(?:under|within)\s+\d/i],
    ["a VERIFIED PURCHASE badge", /verified purchase/i],
    ["a placeholder reviews constant", /placeholderReviews/],
    ["a placeholder/example contact address", /[\w.+-]+@(?:[\w-]+\.)*(?:example|test|localhost)\b/i],
    ["a placeholder contact banner", /Placeholder contact details/i],
    ["a hardcoded support mailbox", /[\w.+-]+@safedeal\.(?:ng|com|io)/i],
    ["a lorem ipsum block", /lorem ipsum/i],
  ];

  for (const [name, re] of BANNED) {
    it(`does not contain ${name}`, () => {
      const hits = FILES.filter((f) => re.test(readScannable(f))).map(rel);
      expect(hits).toEqual([]);
    });
  }
});

describe("PublicProductDetail shows an honest reviews empty state", () => {
  const src = read("pages/PublicProductDetail.tsx");
  it("renders a No reviews yet state", () => {
    expect(src).toContain("No reviews yet");
  });
  it("renders no rating distribution bars", () => {
    expect(src).not.toContain("@/components/ui/progress");
  });
  it("never renders a Verified Seller chip unconditionally", () => {
    // Every occurrence of the chip text must sit inside a verification guard.
    const guardedBlocks = src.split(/seller\.(?:identity|email)_verified/).length - 1;
    const chips = (src.match(/Verified Seller/g) ?? []).length;
    expect(guardedBlocks).toBeGreaterThanOrEqual(chips);
  });
});

/* ───────────────────────── render-level truth tests ───────────────────── */

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderPage(node: React.ReactElement) {
  return render(
    <QueryClientProvider client={qc()}>
      <MemoryRouter initialEntries={["/dashboard/transactions/tx-1"]}>
        <Routes>
          <Route path="/dashboard/transactions/:transactionId" element={node} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let sellerVerified = false;

vi.mock("@/hooks/useBuyerIdentity", () => ({
  useBuyerIdentity: () => ({ buyerName: "Test Buyer", avatarUrl: null }),
}));

vi.mock("@/services/transaction-detail.service", () => ({
  getTransactionDetail: vi.fn(async () => ({
    transaction: {
      id: "tx-1",
      transaction_code: "SD-2026-000123",
      status: "delivered_awaiting_verification",
      money_status: "held_in_escrow",
      dispute_status: "none",
      created_at: "2026-01-01T00:00:00Z",
      delivered_at: "2026-01-05T00:00:00Z",
      verification_deadline_at: "2026-01-07T00:00:00Z",
      cancellation_reason: null,
      cancelled_by_role: null,
    },
    seller: {
      id: "seller-1",
      full_name: "Test Seller",
      avatar_url: null,
      is_verified: sellerVerified,
      member_since: "2025-01-01T00:00:00Z",
    },
    item: {
      title: "Test item",
      description: "A test item",
      quantity: 1,
      condition_label: "new",
      brand: null,
      model: null,
    },
    items: [],
    pricing: {
      currency_code: "NGN",
      item_amount: 100000,
      service_fee_amount: 2100,
      buyer_total_amount: 102100,
      seller_net_amount: 100000,
      delivery_fee_amount: 0,
    },
    escrow: { state: "held" },
    dispute: null,
    timeline: [],
    agreement: null,
    delivery: null,
    media: [],
  })),
}));

vi.mock("@/components/dashboard/BuyerNav", () => ({ BuyerNav: () => <nav /> }));
vi.mock("@/components/landing/Footer", () => ({ Footer: () => <footer /> }));
vi.mock("@/components/transactions/MessageThread", () => ({ MessageThread: () => <div /> }));

afterEach(() => cleanup());

describe("BuyerTransactionDetail renders verification state truthfully", () => {
  it("renders NO Verified badge or tick when the seller is not verified", async () => {
    sellerVerified = false;
    const { default: Page } = await import("@/pages/BuyerTransactionDetail");
    renderPage(<Page />);
    const notVerified = await screen.findAllByText("Not verified");
    // Desktop + mobile copies of the seller card.
    expect(notVerified.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryAllByText("Verified")).toEqual([]);
  });

  it("renders the Verified badge on BOTH the desktop and mobile card when verified", async () => {
    sellerVerified = true;
    const { default: Page } = await import("@/pages/BuyerTransactionDetail");
    renderPage(<Page />);
    const verified = await screen.findAllByText("Verified");
    expect(verified.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryAllByText("Not verified")).toEqual([]);
  });

  it("labels the receipt control by what it actually does", async () => {
    sellerVerified = true;
    const { default: Page } = await import("@/pages/BuyerTransactionDetail");
    renderPage(<Page />);
    expect((await screen.findAllByText(/Print receipt/i)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Download Receipt/i)).toEqual([]);
  });
});

/* ───────────────────────── dead control scans ─────────────────────────── */

describe("no dead controls on buyer-facing and support surfaces", () => {
  const SURFACES = [
    "pages/BuyerTransactionDetail.tsx",
    "pages/BuyerPaymentSummary.tsx",
    "pages/AdminSupport.tsx",
    "components/verification/VerificationSidebar.tsx",
  ];

  const isDead = (tag: string, before: string) =>
    !/onClick|onSubmit|type="submit"|disabled|asChild|href=|to=/.test(tag) &&
    // A trigger that opens a menu/dialog is live even without its own handler.
    !/asChild>\s*$/.test(before);

  for (const file of SURFACES) {
    it(`every <button> and <Button> in ${file} does something`, () => {
      const src = read(file);
      const matches = [...src.matchAll(/<(?:button|Button)\b[\s\S]*?>/g)];
      expect(matches.length).toBeGreaterThan(0);
      const dead = matches
        .filter((m) => isDead(m[0], src.slice(Math.max(0, m.index! - 120), m.index!)))
        .map((m) => m[0]);
      expect(dead).toEqual([]);
    });
  }

  it("DropdownMenuItem support entries in the transaction detail have handlers", () => {
    const src = read("pages/BuyerTransactionDetail.tsx");
    const items = [...src.matchAll(/<DropdownMenuItem\b[^>]*>/g)].map((m) => m[0]);
    expect(items.length).toBeGreaterThan(0);
    expect(items.filter((t) => !t.includes("onClick"))).toEqual([]);
  });

  it("support controls route to /contact carrying the reference", () => {
    expect(supportLink("SD-1", "transaction")).toBe("/contact?topic=transaction&ref=SD-1");
    for (const file of ["pages/BuyerTransactionDetail.tsx", "components/verification/VerificationSidebar.tsx"]) {
      expect(read(file), file).toContain("supportLink(");
    }
  });
});

/* ───────────────────────── contact form + inbox ───────────────────────── */

describe("/contact is a working form whose failures reach the user", () => {
  const src = read("pages/Contact.tsx");
  it("submits through the contact service", () => {
    expect(src).toContain("submitContactMessage");
    expect(src).toContain("<form");
  });
  it("prefills the transaction reference from the query string", () => {
    expect(src).toContain('params.get("ref")');
  });
  it("surfaces submission failures with an error toast", () => {
    expect(src).toMatch(/catch\s*\([\s\S]{0,60}toast\.error/);
  });
  it("only claims an acknowledgement email when one was actually sent", () => {
    expect(src).toContain("acknowledged");
    expect(read("../src/services/contact.service.ts").length).toBeGreaterThan(0);
  });
});

describe("support messages are readable and answerable by a human", () => {
  const inbox = read("pages/AdminSupport.tsx");
  it("the admin console reads the contact_messages queue", () => {
    expect(inbox).toContain("fetchSupportInbox");
  });
  it("the admin console can reply, claim and resolve", () => {
    for (const action of ["reply", "claim", "resolve"]) {
      expect(inbox).toContain(`action: "${action}"`);
    }
  });
  it("the inbox is gated on the support permissions", () => {
    expect(inbox).toContain('has("support.view")');
    expect(inbox).toContain('has("support.update")');
  });
  it("does not invent hours or an SLA of its own", () => {
    expect(inbox).toContain("SUPPORT_INTERNAL_SLA");
    expect(inbox).not.toMatch(/\d\s*business hours/i);
  });
});

describe("one support promise, one fee name, one refund sentence", () => {
  it("the buyer promise and the internal SLA quote the same target", () => {
    expect(SUPPORT_RESPONSE_PROMISE).toContain(SUPPORT_RESPONSE_TARGET);
  });

  it("no screen restates the response time inline", () => {
    const offenders = FILES.filter((f) => {
      if (f.endsWith("support-copy.ts")) return false;
      return /(?:repl(?:y|ies)|respond|response)[^\n]{0,40}within \d+\s+business day/i.test(
        fs.readFileSync(f, "utf8"),
      );
    }).map(rel);
    expect(offenders).toEqual([]);
  });

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
      if (/Full refund if item/i.test(s)) offenders.push(rel(f));
      if (/Includes payment processing/i.test(s)) offenders.push(rel(f));
      if (/SafeDeal Protection Fee|SafeDeal Service Fee/.test(s)) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
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
