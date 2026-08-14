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

/**
 * `src/lib/format.ts` is no longer blanket-allowlisted — only the `Intl`
 * constructions inside it are, because `new Intl.NumberFormat(..., { currency:
 * "NGN" })` is the one place a currency code legitimately appears as a literal.
 */
function stripIntlConstructions(src: string): string {
  return src.replace(/new Intl\.NumberFormat\([\s\S]*?\)/g, "");
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
  /(?:\?\?|\|\||(?<![=!<>])=|:)\s*["'`](NGN|USD|GBP|EUR)["'`]/g;
/**
 * Modules allowed to name a currency literally: they DEFINE the platform's
 * default currency or a provider's fixed settlement currency.
 */
const CURRENCY_DEFINITION_FILES = new Set([
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

/**
 * A positional currency argument — `formatMoney(x, "NGN")`. The `??`/`||`/`=`
 * regex above cannot see these, which is exactly how eight wrong-currency
 * escrow balances survived the previous pass.
 */
const CURRENCY_POSITIONAL =
  /\bformatMoney(?:Compact|Delta|OrDash)?\s*\([^()]*["'`](?:NGN|USD|GBP|EUR)["'`]/g;

/**
 * KNOWN DEBT — pre-existing positional `"NGN"` arguments. Shrink-only ratchet,
 * same rules as the lists above.
 */
const POSITIONAL_DEBT = [
  "src/components/admin/dashboard/IdentityAndPayoutHealth.tsx",
  "src/components/admin/dashboard/KpiCards.tsx",
  "src/components/admin/dashboard/RecentActivity.tsx",
  "src/components/admin/escrow/EscrowAlertsPanel.tsx",
  "src/components/admin/escrow/EscrowRecordDrawer.tsx",
  "src/components/admin/flagged-users/FlaggedUserCard.tsx",
  "src/components/admin/flagged-users/FlaggedUserDrawer.tsx",
  "src/components/admin/flagged-users/FlaggedUsersTable.tsx",
  "src/components/admin/payouts/PayoutBatchBar.tsx",
  "src/components/admin/payouts/PayoutMobileCards.tsx",
  "src/components/admin/payouts/PayoutSummaryCards.tsx",
  "src/components/admin/payouts/PayoutsTable.tsx",
  "src/components/disputes/AgreementSnapshotSection.tsx",
  "src/components/disputes/BuyerDisputeList.tsx",
  "src/components/profile/AccountVerificationSection.tsx",
  "src/components/profile/SellerVerificationSection.tsx",
  "src/components/seller-disputes/SellerDisputeTable.tsx",
  "src/components/seller/ExportPayoutsDialog.tsx",
  "src/components/seller/ExportPreviewDialog.tsx",
  "src/pages/AdminPayouts.tsx",
  "src/pages/AdminTransactionDetail.tsx",
  "src/pages/SellerAnalytics.tsx",
  "src/pages/SellerDisputeDetail.tsx",
  "src/pages/SellerProductPreview.tsx",
  "src/pages/SellerTransactions.tsx",
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
      const src = stripIntlConstructions(stripComments(fs.readFileSync(file, "utf8")));
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

  it("never passes a currency literal positionally", () => {
    const offenders: string[] = [];
    const debtSeen = new Set<string>();
    for (const file of FILES.filter((f) => relOf(f).startsWith("src/"))) {
      const rel = relOf(file);
      const src = stripIntlConstructions(stripComments(fs.readFileSync(file, "utf8")));
      const hits = [...src.matchAll(CURRENCY_POSITIONAL)];
      if (hits.length === 0) continue;
      if (POSITIONAL_DEBT.includes(rel)) {
        debtSeen.add(rel);
        continue;
      }
      for (const m of hits) offenders.push(`${rel}: ${m[0].trim()}`);
    }
    expect(offenders).toEqual([]);
    expect(POSITIONAL_DEBT.filter((f) => !debtSeen.has(f))).toEqual([]);
  });

  it("keeps the screens fixed in this pass off the debt list", () => {
    for (const f of [
      "src/pages/CartCheckoutReview.tsx",
      "src/pages/BuyerCart.tsx",
      "src/pages/BuyerTransactionVerify.tsx",
      "src/components/payment/PricingBreakdown.tsx",
    ]) {
      expect(CURRENCY_DEBT).not.toContain(f);
      expect(stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"))).not.toMatch(CURRENCY_DEFAULT);
    }
  });
});

/**
 * CURRENCY SYMBOL LOCK.
 *
 * Every rule above matches the ISO codes (`NGN|USD|GBP|EUR`). A glyph — `₦`,
 * `$`, `£`, `€` — is invisible to all of them, which is how two escrow
 * components shipped their own `₦`-hardcoding compact formatters that
 * disagreed with each other on the same screen. A symbol asserts a currency
 * with no data behind it, exactly like a `"NGN"` default does.
 */
const CURRENCY_SYMBOL = /[₦£€]|(?<![\/\\\w])\$(?=\d)/g;

/**
 * Modules allowed to name a symbol: they DEFINE how money is rendered, or they
 * are a currency PICKER whose options are labels for the codes themselves.
 */
const SYMBOL_DEFINITION_FILES = new Set([
  "src/lib/format.ts", // the single rendering authority
  "src/pages/SellerCreateTransaction.tsx", // currency picker options
]);

/**
 * DEFERRED — pre-existing hardcoded currency symbols, found by the sweep that
 * introduced this rule and NOT fixed in this pass. Every entry is a
 * Naira-denominated filter band, input adornment, settings prefix or
 * NGN-only formatter helper; none can mis-render while the book is NGN-only.
 * Shrink-only ratchet: a listed file that stops offending fails this test.
 */
const SYMBOL_DEBT: string[] = [
  "src/components/admin/escrow/EscrowFilters.tsx",
  "src/components/admin/payouts/PayoutAdvancedFilters.tsx",
  "src/components/admin/task-orchestration/TaskQueueFilters.tsx",
  "src/components/landing/FAQSection.tsx",
  "src/components/landing/FeesSection.tsx",
  "src/components/profile/AccountVerificationSection.tsx",
  "src/components/profile/EffectiveSettingsPanel.tsx",
  "src/components/profile/PayoutDestinationSection.tsx",
  "src/lib/admin-mappers.ts",
  "src/lib/pricing-invariant.ts",
  "src/pages/AdminDisputes.tsx",
  "src/pages/AdminSettings.tsx",
  "src/pages/AdminTransactions.tsx",
  "src/pages/Pricing.tsx",
  "src/pages/SellerProductCreate.tsx",
  "src/pages/SellerProductDetail.tsx",
  "src/pages/SellerTransactionShare.tsx",
  "src/services/vendor-plan.service.ts",
];

describe("hardcoded currency symbols", () => {
  it("never asserts a currency glyph outside the formatter", () => {
    const offenders: string[] = [];
    const debtSeen = new Set<string>();
    for (const file of FILES.filter((f) => relOf(f).startsWith("src/"))) {
      const rel = relOf(file);
      if (SYMBOL_DEFINITION_FILES.has(rel)) continue;
      const src = stripIntlConstructions(stripComments(fs.readFileSync(file, "utf8")));
      const hits = [...src.matchAll(CURRENCY_SYMBOL)];
      if (hits.length === 0) continue;
      if (SYMBOL_DEBT.includes(rel)) {
        debtSeen.add(rel);
        continue;
      }
      offenders.push(rel);
    }
    expect([...new Set(offenders)]).toEqual([]);
    expect(SYMBOL_DEBT.filter((f) => !debtSeen.has(f))).toEqual([]);
  });

  it("the escrow tiles and charts no longer format money themselves", () => {
    for (const f of [
      "src/components/admin/escrow/EscrowKpiCards.tsx",
      "src/components/admin/escrow/EscrowCharts.tsx",
    ]) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      expect(src, f).not.toMatch(/function fmtCompact/);
      expect(src, f).toMatch(/formatMoneyCompactOrDash/);
    }
  });
});
