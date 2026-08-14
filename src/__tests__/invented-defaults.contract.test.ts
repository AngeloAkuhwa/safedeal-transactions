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
  "src/lib/settings-catalog.ts", // declares the platform default-currency setting
  "src/pages/SellerCreateTransaction.tsx", // currency PICKER options, not a default
  "supabase/functions/_shared/pricing.ts",
]);

/**
 * KNOWN DEBT — `"NGN"` defaults inside edge functions. `supabase/functions/`
 * was previously excluded from this rule entirely, which is how the edge
 * formatter kept its `currency = "NGN"` signature for fourteen rounds. Same
 * shrink-only ratchet as the front-end list.
 */
const EDGE_CURRENCY_DEBT: string[] = [
  "supabase/functions/_shared/financial-model.ts",
  "supabase/functions/_shared/flagged-users-engine.ts",
  "supabase/functions/_shared/flagged-users-sql.ts",
  "supabase/functions/_shared/money-copy.ts",
  "supabase/functions/_shared/orchestration.ts",
  "supabase/functions/_shared/payment-capture-guard.ts",
  "supabase/functions/_shared/paystack.ts",
  "supabase/functions/_shared/safedeal-money-policy.ts",
  "supabase/functions/_shared/security-resolver.ts",
  "supabase/functions/_shared/share-meta.ts",
  "supabase/functions/_shared/users-directory-engine.ts",
  "supabase/functions/_shared/users-directory-sql.ts",
  "supabase/functions/admin-agent-performance/index.ts",
  "supabase/functions/admin-dashboard/index.ts",
  "supabase/functions/admin-disputes-queue/index.ts",
  "supabase/functions/admin-export-transaction-data/index.ts",
  "supabase/functions/admin-flagged-user-detail/index.ts",
  "supabase/functions/admin-payouts-list/index.ts",
  "supabase/functions/admin-payouts-summary/index.ts",
  "supabase/functions/admin-transaction-detail/index.ts",
  "supabase/functions/admin-transactions-monitor/index.ts",
  "supabase/functions/buyer-dashboard/index.ts",
  "supabase/functions/buyer-transactions/index.ts",
  "supabase/functions/cart-checkout/index.ts",
  "supabase/functions/claim-offer/index.ts",
  "supabase/functions/create-transaction/index.ts",
  "supabase/functions/dispute-detail/index.ts",
  "supabase/functions/initiate-paystack-payment/index.ts",
  "supabase/functions/payout-watchdog/index.ts",
  "supabase/functions/paystack-webhook/index.ts",
  "supabase/functions/reconcile-escrow/index.ts",
  "supabase/functions/resolve-share-token/index.ts",
  "supabase/functions/seller-analytics/index.ts",
  "supabase/functions/seller-confirm-completion/index.ts",
  "supabase/functions/seller-dashboard/index.ts",
  "supabase/functions/seller-dispute-detail/index.ts",
  "supabase/functions/seller-drafts/index.ts",
  "supabase/functions/seller-payouts/index.ts",
  "supabase/functions/seller-products/index.ts",
  "supabase/functions/seller-transaction-detail/index.ts",
  "supabase/functions/seller-transactions/index.ts",
  "supabase/functions/transaction-agreement/index.ts",
  "supabase/functions/transaction-detail/index.ts",
  "supabase/functions/transaction-verify/index.ts",
  "supabase/functions/update-payout-account/index.ts",
  "supabase/functions/vendor-plan/index.ts",
  "supabase/functions/verify-paystack-payment/index.ts",
];

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

  it("never defaults a currency, front end or edge function", () => {
    const offenders: string[] = [];
    const debtSeen = new Set<string>();
    // Scope: the WHOLE tree. Edge-function notification and receipt copy
    // renders to a person exactly like a component does.
    for (const file of FILES) {
      const rel = relOf(file);
      if (CURRENCY_DEFINITION_FILES.has(rel)) continue;
      const src = stripIntlConstructions(stripComments(fs.readFileSync(file, "utf8")));
      const hits = [...src.matchAll(CURRENCY_DEFAULT)];
      if (hits.length === 0) continue;
      if (CURRENCY_DEBT.includes(rel) || EDGE_CURRENCY_DEBT.includes(rel)) {
        debtSeen.add(rel);
        continue;
      }
      for (const m of hits) offenders.push(`${rel}: ${m[0].trim()}`);
    }
    expect(offenders).toEqual([]);
    expect([...CURRENCY_DEBT, ...EDGE_CURRENCY_DEBT].filter((f) => !debtSeen.has(f))).toEqual([]);
  });

  it("never passes a currency literal positionally", () => {
    const offenders: string[] = [];
    const debtSeen = new Set<string>();
    for (const file of FILES) {
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

/**
 * DEFERRED — edge-function glyphs. `supabase/functions/` was previously never
 * scanned for symbols; this list records what that first scan found. Every
 * entry is NGN-denominated notification copy, a limit message or an
 * NGN-only formatter helper. Same shrink-only ratchet.
 */
const EDGE_SYMBOL_DEBT: string[] = [
  "supabase/functions/create-transaction/index.ts",
  "supabase/functions/initiate-paystack-payment/index.ts",
  "supabase/functions/paystack-webhook/index.ts",
  "supabase/functions/_shared/pricing-invariant.ts",
  "supabase/functions/_shared/security-resolver.ts",
  "supabase/functions/_shared/share-meta.ts",
  "supabase/functions/_shared/showcase-slots.ts",
];

describe("hardcoded currency symbols", () => {
  it("never asserts a currency glyph outside the formatter", () => {
    const offenders: string[] = [];
    const debtSeen = new Set<string>();
    // Scope: the whole tree. Edge-function email/receipt copy renders to a
    // person exactly like a component does.
    for (const file of FILES) {
      const rel = relOf(file);
      if (SYMBOL_DEFINITION_FILES.has(rel)) continue;
      const src = stripIntlConstructions(stripComments(fs.readFileSync(file, "utf8")));
      const hits = [...src.matchAll(CURRENCY_SYMBOL)];
      if (hits.length === 0) continue;
      if (SYMBOL_DEBT.includes(rel) || EDGE_SYMBOL_DEBT.includes(rel)) {
        debtSeen.add(rel);
        continue;
      }
      offenders.push(rel);
    }
    expect([...new Set(offenders)]).toEqual([]);
    expect([...SYMBOL_DEBT, ...EDGE_SYMBOL_DEBT].filter((f) => !debtSeen.has(f))).toEqual([]);
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

/**
 * EXEMPTION STALENESS RATCHET.
 *
 * The debt lists are shrink-only, but the *definition* allowlists had no such
 * check — an entry there was permanent and invisible. That is precisely how
 * `supabase/functions/_shared/format.ts` was added to `SYMBOL_DEFINITION_FILES`
 * and thereby escaped every currency rule at once.
 *
 * A definition-file exemption is only legitimate while the file actually still
 * contains the pattern it is exempted from. The moment it stops, the entry must
 * be deleted.
 */
describe("exemption lists cannot rot", () => {
  const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

  it("every SYMBOL_DEFINITION_FILES entry exists and still needs the exemption", () => {
    const stale: string[] = [];
    for (const rel of SYMBOL_DEFINITION_FILES) {
      if (!exists(rel)) {
        stale.push(`${rel}: file no longer exists`);
        continue;
      }
      const src = stripIntlConstructions(stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8")));
      if (![...src.matchAll(CURRENCY_SYMBOL)].length) {
        stale.push(`${rel}: no longer contains a currency glyph — drop the exemption`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("every CURRENCY_DEFINITION_FILES entry exists and still needs the exemption", () => {
    const stale: string[] = [];
    for (const rel of CURRENCY_DEFINITION_FILES) {
      if (!exists(rel)) {
        stale.push(`${rel}: file no longer exists`);
        continue;
      }
      const src = stripIntlConstructions(stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8")));
      if (![...src.matchAll(CURRENCY_DEFAULT)].length) {
        stale.push(`${rel}: no longer names a currency literal — drop the exemption`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("the edge formatter no longer defaults its currency", () => {
    for (const rel of [
      "supabase/functions/_shared/format.ts",
      "supabase/functions/_shared/admin-mappers.ts",
    ]) {
      const src = stripIntlConstructions(stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8")));
      expect(src, rel).not.toMatch(/currency\s*(?::\s*string\s*)?=\s*["'`]NGN["'`]/);
      expect(SYMBOL_DEFINITION_FILES.has(rel), `${rel} must not be blanket-exempt`).toBe(false);
      expect(CURRENCY_DEFINITION_FILES.has(rel), `${rel} must not be blanket-exempt`).toBe(false);
    }
  });
});


/**
 * MONEY NEVER FAILS TO ZERO.
 *
 * `?? 0` / `|| 0` on a monetary value is the most dangerous invented default
 * in the codebase: it is silent, it type-checks, and it renders as a real
 * amount. It is how the buyer payment screen could say "Pay ₦0.00" and how an
 * admin release drawer could claim an agreement snapshot recorded ₦0.00.
 *
 * A missing amount must reach `formatMoneyOrDash` and render `—`, or block the
 * screen. Scope is the whole tree — edge functions compose receipts and
 * notification copy that a person reads.
 */
const MONEY_ZERO_FALLBACK =
  /\b[A-Za-z_$][\w$]*(?:\.[\w$]+)*(?:amount|Amount|payout|Payout|fee|Fee|price|Price|total|Total|balance|Balance|charged|Charged|refund|Refund|payable|Payable|held|Held)\s*(?:\?\?|\|\|)\s*0\b/g;

/**
 * KNOWN DEBT — shrink-only ratchet, exactly like the currency lists. Entries
 * may be REMOVED as files are fixed, never added; a listed file that no longer
 * offends fails the staleness assertion below.
 */
const MONEY_ZERO_DEBT: string[] = [
  "src/components/admin/transactions/AgreementPreviewDialog.tsx",
  "src/components/admin/transactions/MoneyStatus.ts",
  "src/components/admin/transactions/ResolveDisputeDialog.tsx",
  "src/components/seller/SellerMetricsCards.tsx",
  "src/lib/admin-active-state.ts",
  "src/lib/dispute-display-status.ts",
  "src/pages/AdminDisputeDetail.tsx",
  "src/pages/AdminPermissionMatrix.tsx",
  "src/pages/AdminTransactionDetail.tsx",
  "src/pages/BuyerPrivateOffers.tsx",
  "src/pages/BuyerTransactionReview.tsx",
  "src/pages/BuyerTransactionTracking.tsx",
  "src/pages/SellerTransactionShare.tsx",
  "src/pages/SellerUpdateDelivery.tsx",
  "supabase/functions/_shared/flagged-users-engine.ts",
  "supabase/functions/_shared/provider-refund.ts",
  "supabase/functions/_shared/reconciliation.ts",
  "supabase/functions/_shared/release-core.ts",
  "supabase/functions/_shared/users-directory-engine.ts",
  "supabase/functions/_shared/users-directory-sql.ts",
  "supabase/functions/admin-agent-performance/index.ts",
  "supabase/functions/admin-dashboard/index.ts",
  "supabase/functions/admin-disputes-queue/index.ts",
  "supabase/functions/admin-escrow-detail/index.ts",
  "supabase/functions/admin-escrow-export/index.ts",
  "supabase/functions/admin-escrow-overview/index.ts",
  "supabase/functions/admin-export-worker/index.ts",
  "supabase/functions/admin-flagged-user-detail/index.ts",
  "supabase/functions/admin-payouts-list/index.ts",
  "supabase/functions/admin-transaction-actions/index.ts",
  "supabase/functions/admin-transaction-detail/index.ts",
  "supabase/functions/admin-transactions-monitor/index.ts",
  "supabase/functions/admin-user-detail-export/index.ts",
  "supabase/functions/admin-user-detail/index.ts",
  "supabase/functions/dispute-detail/index.ts",
  "supabase/functions/seller-dashboard/index.ts",
  "supabase/functions/seller-dispute-detail/index.ts",
  "supabase/functions/seller-drafts/index.ts",
  "supabase/functions/seller-transaction-detail/index.ts",
  "supabase/functions/seller-transactions/index.ts",
];

describe("money never falls back to zero", () => {
  it("has no un-recorded `?? 0` on a monetary value", () => {
    const offenders: string[] = [];
    const debtSeen = new Set<string>();
    for (const file of FILES) {
      const r = relOf(file);
      const src = stripComments(fs.readFileSync(file, "utf8"));
      const hits = [...src.matchAll(MONEY_ZERO_FALLBACK)];
      if (hits.length === 0) continue;
      if (MONEY_ZERO_DEBT.includes(r)) { debtSeen.add(r); continue; }
      for (const m of hits) offenders.push(`${r}: ${m[0].trim()}`);
    }
    expect(offenders).toEqual([]);
    expect(MONEY_ZERO_DEBT.filter((f) => !debtSeen.has(f))).toEqual([]);
  });

  it("keeps the surfaces fixed in this pass clean", () => {
    for (const f of [
      "src/pages/BuyerPaymentSummary.tsx",
      "src/components/admin/payouts/PayoutDetailDrawer.tsx",
      "src/components/admin/escrow/EscrowRecordDrawer.tsx",
      "src/components/admin/payouts/PayoutSummaryCards.tsx",
      "supabase/functions/admin-payouts-detail/index.ts",
    ]) {
      expect(MONEY_ZERO_DEBT).not.toContain(f);
      expect(stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"))).not.toMatch(
        MONEY_ZERO_FALLBACK,
      );
    }
  });

  it("the money formatters do not coerce a missing amount to zero", () => {
    for (const f of ["src/lib/format.ts", "supabase/functions/_shared/format.ts"]) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      expect(src).toContain("MISSING_AMOUNT");
      expect(src).not.toMatch(/Number\.isNaN\([\s\S]{0,40}\)\s*\n?\s*\?\s*0/);
    }
  });
});
