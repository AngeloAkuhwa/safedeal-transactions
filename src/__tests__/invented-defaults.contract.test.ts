/**
 * Invented-default lock.
 *
 * Two figures have repeatedly been conjured client-side when the real value
 * was missing:
 *
 *  - a verification window of `72` hours, which is AGREEMENT data — inventing
 *    it showed buyer and seller different deadlines for the same transaction;
 *  - a currency of `"NGN"`, which is a money claim about someone else's order.
 *
 * Both must fail closed (render `—`, or omit the statement) instead. This test
 * fails on any literal default for either.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|ts)$/.test(e.name) && !p.includes("__tests__")) out.push(p);
  }
  return out;
}

const FILES = [
  ...walk(path.join(ROOT, "src")),
  ...walk(path.join(ROOT, "supabase/functions")),
];

/** `verification_window_hours ?? 72`, `windowHours || 48`, `= 72` defaults. */
const WINDOW_DEFAULT =
  /\b([A-Za-z_$][\w$]*(?:\.[\w$]+)*)?\s*(?:verification_window_hours|verificationWindowHours|windowHours)\s*(?:\?\?|\|\|)\s*(\d+)/g;
/** A default parameter: `windowHours = 72`. */
const WINDOW_PARAM_DEFAULT =
  /\b(?:verification_window_hours|verificationWindowHours|windowHours)\s*(?::\s*number\s*)?=\s*(\d+)\b/g;

/** `?? "NGN"`, `|| "NGN"`, `currency = "NGN"`, `currency: "NGN"`. */
const CURRENCY_DEFAULT =
  /(?:\?\?|\|\||=|:)\s*["'`](NGN|USD|GBP|EUR)["'`]/g;
/**
 * Modules allowed to name a currency literally: they DEFINE the platform's
 * default currency or a provider's fixed settlement currency.
 */
const CURRENCY_DEFINITION_FILES = new Set([
  "src/lib/format.ts",
  "src/lib/pricing.ts",
  "src/lib/payment/money-format.ts",
  "src/services/vendor-plan.service.ts",
  "src/lib/settings-catalog.ts", // declares the platform default-currency setting
  "src/pages/SellerCreateTransaction.tsx", // currency PICKER options, not a default
  "supabase/functions/_shared/pricing.ts",
]);

/**
 * KNOWN DEBT — pre-existing `"NGN"` defaults, recorded rather than hidden.
 * This list is a ratchet: entries may be REMOVED as files are fixed, never
 * added. A file listed here that no longer offends fails the test below, so
 * the list cannot rot.
 */
const CURRENCY_DEBT = [
  "src/components/admin/dashboard/RecentActivity.tsx",
  "src/components/admin/escrow/ConfigureAlertsModal.tsx",
  "src/components/admin/payouts/PayoutMobileCards.tsx",
  "src/components/admin/payouts/PayoutsTable.tsx",
  "src/components/payment/PricingBreakdown.tsx",
  "src/components/payment/SellerPayoutLine.tsx",
  "src/components/seller/SellerConfirmCompletionCard.tsx",
  "src/lib/admin-mappers.ts",
  "src/pages/AdminDisputeDetail.tsx",
  "src/pages/AdminTransactionDetail.tsx",
  "src/pages/BuyerDisputeDetail.tsx",
  "src/pages/BuyerPaymentSummary.tsx",
  "src/pages/BuyerPrivateOffers.tsx",
  "src/pages/BuyerTransactionReview.tsx",
  "src/pages/OfferClaimLanding.tsx",
  "src/pages/PublicProductDetail.tsx",
  "src/pages/SellerDisputeDetail.tsx",
  "src/pages/SellerOfferDetail.tsx",
  "src/pages/SellerPrivateOffers.tsx",
  "src/pages/SellerProductDetail.tsx",
  "src/pages/SellerProductPreview.tsx",
  "src/pages/SellerTransactionDetail.tsx",
  "src/pages/SellerTransactionShare.tsx",
  "src/pages/SellerUpdateDelivery.tsx",
  "src/services/admin-disputes.service.ts",
  "src/services/admin-transactions-monitor.service.ts",
  "src/services/admin-users-directory.service.ts",
  "src/services/payment-flow.service.ts",
  "src/services/seller-analytics.service.ts",
];

/**
 * KNOWN DEBT — server-side `verification_window_hours ?? 72`. These persist a
 * platform default rather than narrating one to a user; they belong in
 * `system_settings`. Same ratchet rules as above.
 */
const WINDOW_DEBT = [
  "supabase/functions/create-transaction/index.ts",
  "supabase/functions/delivery-token-confirm/index.ts",
  "supabase/functions/seller-drafts/index.ts",
  "supabase/functions/transaction-verify/index.ts",
  "supabase/functions/update-delivery-status/index.ts",
];

function relOf(file: string) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

describe("invented defaults", () => {
  it("never invents a verification window", () => {
    const offenders: string[] = [];
    const debtSeen = new Set<string>();
    for (const file of FILES) {
      const rel = relOf(file);
      const src = stripComments(fs.readFileSync(file, "utf8"));
      const hits = [...src.matchAll(WINDOW_DEFAULT), ...src.matchAll(WINDOW_PARAM_DEFAULT)];
      if (hits.length === 0) continue;
      if (WINDOW_DEBT.includes(rel)) {
        debtSeen.add(rel);
        continue;
      }
      for (const m of hits) offenders.push(`${rel}: ${m[0].trim()}`);
    }
    expect(offenders).toEqual([]);
    // Ratchet: a cleaned-up file must be dropped from the debt list.
    expect(WINDOW_DEBT.filter((f) => !debtSeen.has(f))).toEqual([]);
  });

  it("never defaults a currency in front-end code", () => {
    const offenders: string[] = [];
    const debtSeen = new Set<string>();
    // Scope: the front end, where a wrong currency is shown to a person.
    // Edge functions are tracked separately (see Limitations in the report).
    for (const file of FILES.filter((f) => relOf(f).startsWith("src/"))) {
      const rel = relOf(file);
      if (CURRENCY_DEFINITION_FILES.has(rel)) continue;
      const src = stripComments(fs.readFileSync(file, "utf8"));
      const hits = [...src.matchAll(CURRENCY_DEFAULT)];
      if (hits.length === 0) continue;
      if (CURRENCY_DEBT.includes(rel)) {
        debtSeen.add(rel);
        continue;
      }
      for (const m of hits) offenders.push(`${rel}: ${m[0].trim()}`);
    }
    expect(offenders).toEqual([]);
    expect(CURRENCY_DEBT.filter((f) => !debtSeen.has(f))).toEqual([]);
  });

  it("keeps the screens fixed in this pass off the debt list", () => {
    for (const f of ["src/pages/CartCheckoutReview.tsx", "src/pages/BuyerCart.tsx", "src/pages/BuyerTransactionVerify.tsx"]) {
      expect(CURRENCY_DEBT).not.toContain(f);
      expect(stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"))).not.toMatch(CURRENCY_DEFAULT);
    }
  });
});
