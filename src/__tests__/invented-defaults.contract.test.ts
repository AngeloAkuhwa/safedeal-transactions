/**
 * Invented-default lock.
 *
 * Two figures have repeatedly been conjured client-side when the real value
 * was missing:
 *
 *  - a verification window of `72` hours, which is AGREEMENT data: inventing
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
 * `src/lib/format.ts` is no longer blanket-allowlisted. Only the `Intl`
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
/**
 * A POSITIONAL window fallback: `loadEffectiveTimeoutHours(id, "…", 48)`.
 * Neither rule above can see it, which is how `cart-checkout` persisted a
 * literal 48-hour verification window unnoticed.
 */
const WINDOW_POSITIONAL =
  /\b(?:loadEffectiveTimeoutHours|resolveEffectiveTimeoutHours|getEffectiveTimeout|get_effective_timeout|loadAutoReleaseWindowHours)\s*\([^()]*,\s*["']?\d+["']?\s*\)/g;
/**
 * A DELIVERY-ESTIMATE default: `estimated_delivery_days || "7"`, `days ?? 7`.
 * Not window-named, so the two rules above miss it, yet it invents a promise
 * about someone else's goods just as a window default does.
 */
const DAYS_DEFAULT =
  /\b[\w$.?]*(?:estimated_delivery_days|delivery_days|deliveryDays|fulfilmentDays|fulfillmentDays)\s*(?:\?\?|\|\|)\s*["']?\d+["']?/g;

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
 * KNOWN DEBT: `"NGN"` defaults inside edge functions. `supabase/functions/`
 * was previously excluded from this rule entirely, which is how the edge
 * formatter kept its `currency = "NGN"` signature for fourteen rounds. Same
 * shrink-only ratchet as the front-end list.
 */
const EDGE_CURRENCY_DEBT: string[] = [
  "supabase/functions/_shared/financial-model.ts",
  "supabase/functions/_shared/flagged-users-engine.ts",
  "supabase/functions/_shared/flagged-users-sql.ts",
  "supabase/functions/_shared/money-copy.ts",
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
  "supabase/functions/dispute-detail/index.ts",
  "supabase/functions/payout-watchdog/index.ts",
  "supabase/functions/paystack-webhook/index.ts",
  "supabase/functions/reconcile-escrow/index.ts",
  "supabase/functions/seller-analytics/index.ts",
  "supabase/functions/seller-dashboard/index.ts",
  "supabase/functions/seller-dispute-detail/index.ts",
  "supabase/functions/seller-payouts/index.ts",
  "supabase/functions/seller-products/index.ts",
  "supabase/functions/seller-transaction-detail/index.ts",
  "supabase/functions/seller-transactions/index.ts",
  "supabase/functions/transaction-agreement/index.ts",
  "supabase/functions/transaction-detail/index.ts",
  "supabase/functions/update-payout-account/index.ts",
  "supabase/functions/vendor-plan/index.ts",
  "supabase/functions/verify-paystack-payment/index.ts",
];

/**
 * KNOWN DEBT: pre-existing `"NGN"` defaults, recorded rather than hidden.
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
  "src/pages/BuyerTransactionReview.tsx",
  "src/pages/OfferClaimLanding.tsx",
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
 * KNOWN DEBT: server-side `verification_window_hours ?? 72`. These persist a
 * platform default rather than narrating one to a user; they belong in
 * `system_settings`. Same ratchet rules as above.
 */
const WINDOW_DEBT = [
  // Newly VISIBLE under the positional + delivery-estimate rules added in this
  // pass. Recorded, not narrowed away.
];

/**
 * A positional currency argument: `formatMoney(x, "NGN")`. The `??`/`||`/`=`
 * regex above cannot see these, which is exactly how eight wrong-currency
 * escrow balances survived the previous pass.
 */
const CURRENCY_POSITIONAL =
  /\b(?:formatMoney(?:Compact|Delta|OrDash)?|computePricing|buildPricingSnapshot|toMinorUnits|fromMinorUnits)\s*\([^()]*["'`](?:NGN|USD|GBP|EUR)["'`]/g;

/**
 * KNOWN DEBT: pre-existing positional `"NGN"` arguments. Shrink-only ratchet,
 * same rules as the lists above.
 */
const POSITIONAL_DEBT = [
  "supabase/functions/_shared/settings-resolver.ts",

  "src/components/admin/dashboard/IdentityAndPayoutHealth.tsx",
  "supabase/functions/_shared/safedeal-money-policy.ts",
  "supabase/functions/admin-system-settings/index.ts",
  "supabase/functions/seller-transaction-detail/index.ts",
  "supabase/functions/transaction-agreement/index.ts",
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
      const hits = [
        ...src.matchAll(WINDOW_DEFAULT),
        ...src.matchAll(WINDOW_PARAM_DEFAULT),
        ...src.matchAll(WINDOW_POSITIONAL),
        ...src.matchAll(DAYS_DEFAULT),
      ];
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
      // The two pricing engines DEFINE the platform default currency.
      if (CURRENCY_DEFINITION_FILES.has(rel)) continue;
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
 * Every rule above matches the ISO codes (`NGN|USD|GBP|EUR`). A glyph. `₦`,
 * `$`, `£`, `€`: is invisible to all of them, which is how two escrow
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
 * DEFERRED: pre-existing hardcoded currency symbols, found by the sweep that
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
 * DEFERRED: edge-function glyphs. `supabase/functions/` was previously never
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
 * check: an entry there was permanent and invisible. That is precisely how
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
        stale.push(`${rel}: no longer contains a currency glyph. Drop the exemption`);
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
        stale.push(`${rel}: no longer names a currency literal. Drop the exemption`);
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
 * screen. Scope is the whole tree. Edge functions compose receipts and
 * notification copy that a person reads.
 */
const MONEY_NOUN =
  "(?:amount|Amount|payout|Payout|fee|Fee|price|Price|total|Total|balance|Balance|charged|Charged|refund|Refund|payable|Payable|held|Held)";
/** Map/table names that hold monetary limits: `LIMIT_BY_LEVEL[level] ?? 0`. */
const MONEY_MAP_NOUN = `(?:${MONEY_NOUN}|limit|Limit|LIMIT|cap|Cap|CAP|amounts|AMOUNT|FEE|PRICE|TOTAL)`;
/**
 * Widened again in this pass to cover the three shapes that still evaded it:
 * optional chaining (`x?.amount ?? 0`), a cast receiver
 * (`(x as any)?.fee ?? 0`) and bracket access (`LIMIT_BY_LEVEL[level] ?? 0`).
 *
 * Every zero here carries `(?!\.)`: `?? 0.02` is a documented default RATE
 * (safedeal-money-policy's 2% platform fee), not a zero fallback, and the
 * bare `0\b` matched it because a digit-to-dot transition is a word
 * boundary. An instrument that cries wolf on a legitimate default teaches
 * people to ignore it, which is worse than a blind spot.
 */
const MONEY_ZERO_FALLBACK = new RegExp(
  [
    // member access, optionally chained, on an identifier / call / cast /
    // index result: `x.amount ?? 0`, `x?.amount ?? 0`, `(p as any)?.fee ?? 0`.
    String.raw`[\w$)\]]\s*\??\.\s*(?:[\w$]+\s*\??\.\s*)*[\w$]*${MONEY_NOUN}[\w$]*\s*(?:\?\?|\|\|)\s*0\b(?!\.)`,
    // bare money-named identifier: `totalAmount ?? 0`, and one whose money
    // noun starts at index 0 (`amountDue ?? 0`): the old leading
    // `[A-Za-z_$]` forced the noun to start at index >= 1.
    String.raw`\b[\w$]*${MONEY_NOUN}[\w$]*\s*(?:\?\?|\|\|)\s*0\b(?!\.)`,
    // bracket lookup on a money-named table: `LIMIT_BY_LEVEL[level] ?? 0`.
    // Same leading-character fix: `LIMIT_BY_LEVEL` begins with its noun, so
    // the rule could not see the very line its comment cites.
    String.raw`\b[\w$]*${MONEY_MAP_NOUN}[\w$]*(?:\??\.[\w$]+)*\s*\[[^\]\n]*\]\s*(?:\?\?|\|\|)\s*0\b(?!\.)`,
  ].join("|"),
  "g",
);

/**
 * KNOWN DEBT: shrink-only ratchet, exactly like the currency lists. Entries
 * may be REMOVED as files are fixed, never added; a listed file that no longer
 * offends fails the staleness assertion below.
 *
 * Widened in this pass: the pattern now also matches a bare member access
 * (`p.amount ?? 0`), which the previous form could not see. The three files
 * appended below are newly VISIBLE offences, not new offences.
 */
/**
 * A COUNTER is not money. `total_count ?? 0`, `total_users ?? 0` and
 * `failed_payouts_count ?? 0` are honest zeroes: a row count that is absent
 * really is zero rows. Only explicitly count-shaped names are excused; a bare
 * `.total ?? 0` stays an offence, because it may well be a money total.
 */
function isCountName(match: string): boolean {
  return /(?:_count|_users|_flagged|_transactions|_items|_disputes|Count)\s*(?:\?\?|\|\|)\s*0\b(?!\.)/.test(match);
}

const MONEY_ZERO_DEBT: string[] = [
  "supabase/functions/admin-flagged-users-export/index.ts",
  "supabase/functions/admin-users-directory-export/index.ts",
  "supabase/functions/buyer-dashboard/index.ts",
  "supabase/functions/buyer-transactions/index.ts",
  "supabase/functions/paystack-webhook/index.ts",
  "supabase/functions/reconcile-escrow/index.ts",
  "supabase/functions/verify-paystack-payment/index.ts",
  "supabase/functions/_shared/flagged-users-engine.ts",
  "supabase/functions/_shared/provider-refund.ts",
  "supabase/functions/_shared/reconciliation.ts",
  "supabase/functions/_shared/refund-eligibility.ts",
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
  "supabase/functions/admin-payouts-summary/index.ts",
  "supabase/functions/admin-transaction-actions/index.ts",
  "supabase/functions/admin-transaction-detail/index.ts",
  "supabase/functions/admin-transactions-monitor/index.ts",
  "supabase/functions/admin-user-detail-export/index.ts",
  "supabase/functions/admin-user-detail/index.ts",
  "supabase/functions/dispute-detail/index.ts",
  "supabase/functions/seller-dashboard/index.ts",
  "supabase/functions/seller-dispute-detail/index.ts",
  "supabase/functions/seller-transaction-detail/index.ts",
  "supabase/functions/seller-transactions/index.ts",
  // Newly VISIBLE after the bracket rule was fixed to allow a money noun at
  // index 0 (`LIMIT_BY_LEVEL[level] ?? 0`) and after the bare-identifier rule
  // lost the same leading-character requirement. Recorded, not narrowed away.
  "supabase/functions/admin-audit-logs/index.ts",
];

describe("a CSV money column never claims zero for an absent figure", () => {
  /**
   * D8, answered by measuring rather than by sweeping.
   *
   * The decision assumed admin exports print `0` for absent escrow figures.
   * For `admin-escrow-export` that premise is false: it iterates real
   * `escrow_states` rows and all four amount columns are NOT NULL DEFAULT 0,
   * so its `?? 0` is dead defensive code that can never fire.
   *
   * It was true in exactly one place. `admin-export-worker` builds
   * `priceMap` from `transaction_pricing`, a map lookup that genuinely
   * misses when a transaction has no pricing row, and printed the miss as
   * `0` in the `buyer_total_ngn` column. In a financial export that is a
   * claim the transaction was worth nothing, rather than an admission that
   * we do not know what it was worth.
   *
   * The two `?? 0` uses in the amount-range filters directly above it are
   * correct and deliberately left alone: there, absent genuinely means
   * "outside the range". Only an exported VALUE is a statement.
   */
  const worker = fs.readFileSync(
    path.resolve(ROOT, "supabase/functions/admin-export-worker/index.ts"),
    "utf8",
  );

  it("the exported total is empty when no price is known", () => {
    expect(worker).toMatch(/priceMap\.get\(t\.id\) \?\? ""/);
    expect(worker).not.toMatch(/priceMap\.get\(t\.id\) \?\? 0,/);
  });

  it("keeps the zero default in the range filters, where absent means excluded", () => {
    const filters = worker.match(/if \(amount(Min|Max) > 0\)[^\n]*/g) ?? [];
    expect(filters.length).toBe(2);
    for (const f of filters) expect(f).toContain("?? 0");
  });
});

describe("money never falls back to zero", () => {
  it("has no un-recorded `?? 0` on a monetary value", () => {
    const offenders: string[] = [];
    const debtSeen = new Set<string>();
    for (const file of FILES) {
      const r = relOf(file);
      const src = stripComments(fs.readFileSync(file, "utf8"));
      const hits = [...src.matchAll(MONEY_ZERO_FALLBACK)].filter((m) => !isCountName(m[0]));
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

/**
 * MONEY NEVER FAILS TO ZERO: WRAPPED FORM.
 *
 * The rule above requires the money identifier to sit immediately next to
 * `??`/`||`, so `Number(x) || 0` and `num(row.fee) ?? 0` were invisible. That
 * is the exact shape that carried the payment-screen defect in
 * `resolve-share-token`. This catches a wrapped call whose result defaults to
 * zero when the ASSIGNMENT NAME is money-shaped.
 */
const MONEY_NAME = `(?:${MONEY_NOUN.slice(3, -1)}|net|Net|kobo|Kobo)`;
const MONEY_ZERO_WRAPPED = new RegExp(
  [
    // `const totalAmount = Number(x) || 0;`: money-named declaration.
    String.raw`\b(?:const|let|var)\s+[\w$]*${MONEY_NAME}[\w$]*\s*(?::[^=]+?)?=\s*[\w$.]+\([^;\n]*?\)\s*(?:\?\?|\|\|)\s*0\b(?!\.)`,
    // `amount: Number(x) ?? 0,` / `this.fee = num(x) || 0`: money-named
    // object-literal property or assignment target.
    String.raw`\b[\w$.]*${MONEY_NAME}[\w$]*\s*[:=]\s*[\w$.]+\([^;\n]*?\)\s*(?:\?\?|\|\|)\s*0\b(?!\.)`,
    // `Number(pricingRow.platform_fee_amount) || 0` anywhere: call argument,
    // return expression, nested property. The money noun is inside the call.
    String.raw`\([^()\n]*${MONEY_NAME}[^()\n]*\)\s*(?:\?\?|\|\|)\s*0\b(?!\.)`,
  ].join("|"),
  "g",
);

/**
 * Shrink-only ratchet. Entries may be removed, never added.
 *
 * The pattern was widened in this pass to cover object-literal values, call
 * arguments and return expressions. Not only `const`/`let` declarations. The
 * 18 files appended below were always offending; the previous regex could not
 * see them. They are recorded rather than narrowed away.
 */
const MONEY_ZERO_WRAPPED_DEBT: string[] = [
  "src/components/admin/transactions/ResolveDisputeDialog.tsx",
  "src/services/payment-flow.service.ts",
  "supabase/functions/_shared/money-copy.ts",
  "supabase/functions/_shared/safedeal-money-policy.ts",
  "supabase/functions/_shared/share-meta.ts",
  "supabase/functions/_shared/users-directory-engine.ts",
  "supabase/functions/admin-dashboard/index.ts",
  "supabase/functions/admin-escrow-overview/index.ts",
  "supabase/functions/admin-export-worker/index.ts",
  "supabase/functions/admin-flagged-user-detail/index.ts",
  "supabase/functions/buyer-disputes/index.ts",
  "supabase/functions/buyer-transactions/index.ts",
  "supabase/functions/paystack-webhook/index.ts",
  "supabase/functions/reconcile-escrow/index.ts",
  "supabase/functions/seller-dashboard/index.ts",
  "supabase/functions/seller-disputes/index.ts",
  "supabase/functions/seller-payouts/index.ts",
  "supabase/functions/seller-transaction-detail/index.ts",
  "supabase/functions/seller-transactions/index.ts",
  "supabase/functions/share-meta/index.ts",
  "supabase/functions/transaction-agreement/index.ts",
  "supabase/functions/transaction-detail/index.ts",
  "supabase/functions/verify-paystack-payment/index.ts",
];

/**
 * Fixed in this pass and pinned clean under the WIDENED patterns. These two
 * were invisible to the old rules and are now proven to carry no zero
 * fabrication at all.
 */
const MONEY_ZERO_FIXED_THIS_PASS = [
  "supabase/functions/initiate-paystack-payment/index.ts",
  "supabase/functions/payout-watchdog/index.ts",
];

describe("money never falls back to zero (wrapped calls)", () => {
  it("has no un-recorded wrapped zero default on a money-named assignment", () => {
    const offenders: string[] = [];
    const debtSeen = new Set<string>();
    for (const file of FILES) {
      const r = relOf(file);
      const src = stripComments(fs.readFileSync(file, "utf8"));
      const hits = [...src.matchAll(MONEY_ZERO_WRAPPED)];
      if (hits.length === 0) continue;
      if (MONEY_ZERO_WRAPPED_DEBT.includes(r)) { debtSeen.add(r); continue; }
      for (const m of hits) offenders.push(`${r}: ${m[0].trim()}`);
    }
    expect(offenders).toEqual([]);
    expect(MONEY_ZERO_WRAPPED_DEBT.filter((f) => !debtSeen.has(f))).toEqual([]);
  });

  it("the buyer payment payload builder is clean in both forms", () => {
    const src = stripComments(
      fs.readFileSync(path.join(ROOT, "supabase/functions/resolve-share-token/index.ts"), "utf8"),
    );
    for (const f of MONEY_ZERO_FIXED_THIS_PASS) {
      const s = stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"));
      expect(s, `${f}: base rule`).not.toMatch(MONEY_ZERO_FALLBACK);
      expect(s, `${f}: wrapped rule`).not.toMatch(MONEY_ZERO_WRAPPED);
      expect(MONEY_ZERO_DEBT).not.toContain(f);
      expect(MONEY_ZERO_WRAPPED_DEBT).not.toContain(f);
    }
    expect(src).not.toMatch(MONEY_ZERO_WRAPPED);
    expect(src).not.toMatch(MONEY_ZERO_FALLBACK);
  });
});

/**
 * SNAPSHOT + RELEASE GUARDS.
 *
 * `transaction_agreement_snapshots.snapshot_json.pricing.service_fee_rate` is
 * load-bearing evidence on the payment screen. `transaction_pricing` has no
 * rate column, so both capture paths must DERIVE it (service fee ÷ item
 * amount, null when it cannot be derived) and persist it explicitly.
 */
describe("agreement snapshots persist the charged fee rate", () => {
  for (const f of [
    "supabase/functions/verify-paystack-payment/index.ts",
    "supabase/functions/paystack-webhook/index.ts",
  ]) {
    it(`${f} declares and derives service_fee_rate`, () => {
      const src = stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"));
      // The pricing shape must DECLARE the field, so a missing one is a type error.
      expect(src).toMatch(/service_fee_rate:\s*number\s*\|\s*null;/);
      // …and derive it from the charged fees rather than reading an absent key.
      expect(src).toMatch(/rawProcessingFee\s*!==\s*null\s*&&\s*rawPlatformFee\s*!==\s*null\s*&&\s*itemAmount\s*>\s*0/);
      // The persisted snapshot still writes it.
      expect(src).toMatch(/service_fee_rate:\s*pricing\.service_fee_rate/);
    });
  }
});

describe("the release fee-chain guard fails closed", () => {
  const src = stripComments(
    fs.readFileSync(path.join(ROOT, "supabase/functions/_shared/release-core.ts"), "utf8"),
  );

  it("refuses the release when a snapshot fee is missing", () => {
    expect(src).toContain("fee_chain_unverifiable");
    // The old shape zeroed the expectation and skipped reconciliation entirely.
    expect(src).not.toMatch(/platform_fee_amount\s*\?\?\s*0/);
    expect(src).not.toMatch(/payment_processing_fee_amount\s*\?\?\s*0/);
    expect(src).not.toMatch(/if\s*\(expectedFees\s*>\s*0\.005\)/);
  });

  it("treats a payout row with no amount as a mismatch, not as zero", () => {
    expect(src).not.toMatch(/payout\s+as\s+any\)\.amount\s*\?\?\s*0/);
    expect(src).toMatch(/payoutAmount\s*==\s*null/);
  });
});

/**
 * BOTH CHECKOUT PATHS. `cart-checkout` (multi-item) and `storefront-checkout`
 * ("Buy Now") are twins: every rule here is asserted against both, because
 * four rounds of fixes landed on one half of a pair.
 *
 * Note the deliberate asymmetry between the two commitments:
 *  - the VERIFICATION WINDOW is a real commitment, so an unresolvable window
 *    refuses the checkout (`verification_window_unresolved`);
 *  - the DELIVERY ESTIMATE is optional seller-supplied information, so a
 *    missing one is carried through as `null` and simply not displayed. It
 *    must never block a sale, and must never be invented as "7 days".
 */
describe.each([
  "supabase/functions/cart-checkout/index.ts",
  "supabase/functions/storefront-checkout/index.ts",
])("%s invents nothing about someone else's goods", (rel) => {
  const src = stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));

  it("never names a currency literally", () => {
    expect(src).not.toMatch(CURRENCY_DEFAULT);
  });

  it("fails closed on an unmapped condition or delivery method", () => {
    expect(src).toMatch(/function mapCondition\([^)]*\):\s*string\s*\|\s*null/);
    expect(src).toMatch(/function mapDeliveryMethod\([^)]*\):\s*string\s*\|\s*null/);
    expect(src).toContain("condition_unmapped");
    expect(src).toContain("delivery_method_unmapped");
  });

  it("resolves the verification window from real data, or refuses", () => {
    expect(src).not.toMatch(WINDOW_POSITIONAL);
    expect(src).toContain("verification_window_unresolved");
  });

  it("treats a missing delivery estimate as absent, not as a default", () => {
    expect(src).not.toMatch(DAYS_DEFAULT);
    // No estimate => no date persisted, and no refusal.
    expect(src).not.toContain("delivery_estimate_missing");
    expect(src).toMatch(/expectedDeliveryDate/);
  });
});

describe("cart checkout session currency", () => {
  const src = stripComments(
    fs.readFileSync(path.join(ROOT, "supabase/functions/cart-checkout/index.ts"), "utf8"),
  );
  it("takes the session currency from the products", () => {
    expect(src).toContain("mixed_currency_cart");
    expect(src).toContain("currency_code: sessionCurrency");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The database is a writer too. Every rule above reads TypeScript, but triggers
// and RPCs fabricate the same classes. `'courier'` enum defaults, `+ interval
// '7 days'` estimates, hardcoded currency literals. Scanned over the migration
// SQL, which is the authored source for every live `pg_proc` body.
// Shrink-only ratchets: a listed file may stop offending, none may be added.
// ─────────────────────────────────────────────────────────────────────────────
function stripSqlComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

/**
 * Seed fixtures are not covered by these rules, and the distinction is not a
 * loophole: it is the whole point of the rules.
 *
 * What this file guards against is a migration inventing a fact that then
 * applies to data it does not own: `DEFAULT 'NGN'` on a column silently makes
 * a currency claim about every future row, including someone else's order.
 * A seed fixture does the opposite. It INSERTs rows it creates itself and
 * states their values explicitly: the literal `'NGN'` there is the fixture
 * saying what its own disposable product costs, which is exactly as
 * authoritative as a currency literal can be.
 *
 * Rewriting those literals into lookups would make the fixture harder to read
 * and no safer, and parking it on the debt list would mark it for a cleanup
 * that must never happen.
 *
 * The exemption is deliberately hard to abuse: a file has to declare itself
 * with an explicit marker AND contain no schema at all. The moment a
 * seed-marked file grows a CREATE, an ALTER, or a DEFAULT clause, it is
 * checked like anything else: so this cannot be used to smuggle in a real
 * invented default by writing one comment.
 */
const SEED_FIXTURE_MARKER = /^[ \t]*--[ \t]*safedeal:seed-fixture\b/m;
const ANY_SCHEMA_STATEMENT =
  /\b(?:CREATE|ALTER|DROP)\s+(?:OR\s+REPLACE\s+)?(?:TABLE|FUNCTION|PROCEDURE|TYPE|DOMAIN|VIEW|MATERIALIZED|TRIGGER|POLICY|INDEX|SCHEMA|SEQUENCE|RULE)\b|\bDEFAULT\b/i;

function isSeedFixture(src: string): boolean {
  // The marker is a comment, so it must be read before comments are stripped;
  // the schema check must happen after, or a commented-out CREATE would count.
  if (!SEED_FIXTURE_MARKER.test(src)) return false;
  return !ANY_SCHEMA_STATEMENT.test(stripSqlComments(src));
}

const SQL_FILES = [
  ...(fs.existsSync(path.join(ROOT, "supabase/migrations"))
    ? fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).map((f) => path.join(ROOT, "supabase/migrations", f))
    : []),
  ...(fs.existsSync(path.join(ROOT, "src/db/migrations"))
    ? fs.readdirSync(path.join(ROOT, "src/db/migrations")).filter((f) => f.endsWith(".sql")).map((f) => path.join(ROOT, "src/db/migrations", f))
    : []),
].sort();

const SQL_RULES: Array<{ name: string; pattern: RegExp; debt: string[] }> = [
  {
    name: "hardcoded enum default",
    pattern: /'(courier|brand_new)'/,
    debt: [
        "supabase/migrations/20260308083516_36f7be7a-972f-4467-934c-8b12858d0cf1.sql",
        "supabase/migrations/20260419165835_75c559da-03a0-4412-9a4e-4a0987d8309d.sql",
        "src/db/migrations/002_batch2_transaction_core.sql"
  ],
  },
  {
    name: "invented interval literal",
    pattern: /interval\s+'\d+\s+day/i,
    debt: [
        "supabase/migrations/20260308102521_d299192f-2ecd-4095-b7df-aec585f187f9.sql",
        "supabase/migrations/20260419165835_75c559da-03a0-4412-9a4e-4a0987d8309d.sql",
        "supabase/migrations/20260613133755_de7f6587-0a8f-480b-86fd-5d128286a164.sql",
        "supabase/migrations/20260613135229_a14c082f-f4b5-47e3-ac21-fbbc5bab7f0a.sql",
        "supabase/migrations/20260719004818_0308a008-ea00-4578-aa96-cb0e2fa5d100.sql",
        "supabase/migrations/20260719005115_c71d524b-4c69-4b4e-8830-9f4829965fcf.sql",
        "supabase/migrations/20260719012714_53a8d5cc-51d5-459a-b792-c858e849e59b.sql",
        "supabase/migrations/20260719013540_718b3c5b-5c61-4589-a817-36633f6e5f33.sql",
        "supabase/migrations/20260719013717_86567b6d-7759-421f-b1fb-e3e5f495e664.sql",
        "supabase/migrations/20260719013824_04fd041e-7471-4f2a-b5e2-29ecee2fff44.sql",
        "supabase/migrations/20260719014554_5b8661c8-6131-4db7-9085-cd1c63895e83.sql",
        "supabase/migrations/20260726031554_43ecedf8-310f-4404-9eee-78b530040827.sql",
        "supabase/migrations/20260801163231_da82a446-47ed-4874-bdca-76e408baf1c5.sql",
        "supabase/migrations/20260813230438_cf12244d-3c22-4bed-becf-2eee7ad1ab43.sql",
        "supabase/migrations/20260814014150_8b804f55-9a18-47cf-96f3-9c5c97a80583.sql",
        "supabase/migrations/20260814180545_6c7ad9c6-944c-470f-9b9e-c98f10bbc3e3.sql"
  ],
  },
  {
    name: "hardcoded currency literal",
    pattern: /'(NGN|USD|GBP|EUR)'/,
    debt: [
        // Contains 'NGN' only as the search half of the rewrite that DELETES
        // COALESCE(_currency,'NGN') from create_orchestration_task.
        "supabase/migrations/20260814230108_938157fd-2f94-403b-853d-e67c253dd1d7.sql",
        // Historical migration text only. The live money primitives no longer
        // COALESCE a currency: that is asserted against pg_proc in
        // live-db.contract.test.ts, not against this file list.
        "supabase/migrations/20260814213332_f58f3b14-1766-40e2-82df-55ff5ae1123d.sql",
        "supabase/migrations/20260410185736_6fc7d507-0f0e-4a87-bd9e-7d9c903fc470.sql",
        "supabase/migrations/20260414120858_048e0167-9527-49bd-8968-9346fa316cad.sql",
        "supabase/migrations/20260418230142_81bfd8b9-f30e-4146-aa09-d788d3eb5d57.sql",
        "supabase/migrations/20260501204743_8ab22c76-00e7-4209-8b45-9eccdc5cbd6b.sql",
        "supabase/migrations/20260501215044_7d81d2a0-ae85-4a77-9a2a-5d00f136c49f.sql",
        "supabase/migrations/20260501221644_f45234e6-cec8-4ceb-8a56-a4dc0479a1ef.sql",
        "supabase/migrations/20260501221842_9f8d7bc8-c8e9-482c-a019-333f7689946e.sql",
        "supabase/migrations/20260501222618_f951d9a5-da1c-418a-b88b-215f6a307cfd.sql",
        "supabase/migrations/20260502120000_b6_refund_buyer.sql",
        "supabase/migrations/20260502130000_b7_flag_review.sql",
        "supabase/migrations/20260505225009_f96fc941-647e-48e6-8117-0ced2e974c9e.sql",
        "supabase/migrations/20260506190234_c9e21a69-6e2a-432d-9fa2-fbe01ba7b53a.sql",
        "supabase/migrations/20260507084642_c900262a-cba2-4c17-be72-e584f9e146d1.sql",
        "supabase/migrations/20260509233611_5698e089-927b-41cc-989b-16eb12a191ad.sql",
        "supabase/migrations/20260511163727_62f60405-a3cb-4b51-9516-a86725da8f0f.sql",
        "supabase/migrations/20260512101225_cd59f8e7-04d5-449f-ae38-3a639d3fb6c3.sql",
        "supabase/migrations/20260726034541_57d25129-8295-420b-8369-a794abdf946e.sql",
        "supabase/migrations/20260801130434_3e4d701a-5165-4c3d-83c9-799d592fec28.sql",
        "supabase/migrations/20260801154020_282c4d1a-14c7-44ef-b993-00f361033681.sql",
        "supabase/migrations/20260801155710_1b6c35f5-91ca-4950-ab69-5f49c682e93b.sql",
        "supabase/migrations/20260801162657_cac34865-e08d-41cb-a6bf-b8a522ce3a39.sql",
        "supabase/migrations/20260801162850_18ce0df3-d528-485d-bbe9-ee86fe9d4716.sql",
        "supabase/migrations/20260801165413_8a27c309-dafd-471e-af20-eb6d1954c481.sql",
        "supabase/migrations/20260801170147_2d9fe0c5-9714-4421-a428-c0e7557a9280.sql",
        "supabase/migrations/20260804090017_e35f7d2c-b6dc-4c05-9cb9-fae192f05122.sql",
        "supabase/migrations/20260813222037_572828c2-b4d3-4742-ab0e-a98ea90e735d.sql",
        "supabase/migrations/20260814014150_8b804f55-9a18-47cf-96f3-9c5c97a80583.sql",
        // selftest_refund_rail rewrite. The 'USD'/'GHS' literals are the
        // harness deliberately choosing a currency the CALLER did not pass, so
        // the refund-currency assertion stops being a tautology. No production
        // path reads them.
        "supabase/migrations/20260815011157_8b3fd08d-5e28-4dff-b42f-f26493621adb.sql"
  ],
  },
  {
    name: "hardcoded fee rate, cap, or fee-setting key",
    pattern: /(?<![\w.])0\.0?2(?!\d)|(?<![\w.])400(?:\.0+)?(?!\d)|max_total_service_fee/i,
    debt: [
      "supabase/migrations/20260718214353_7fc13186-70b1-4c65-ba35-d707bc40470b.sql",
      "supabase/migrations/20260804095428_64f55a4f-3059-48bf-aeaa-706bc2f75e24.sql",
      "supabase/migrations/20260804095754_f076fd17-a756-42b1-88a7-ba28194af818.sql",
      "supabase/migrations/20260814014150_8b804f55-9a18-47cf-96f3-9c5c97a80583.sql",
      "supabase/migrations/20260814014442_d963a8fb-7584-4973-bffc-1faa27070b85.sql",
      "supabase/migrations/20260814213855_809d1f72-4338-46e6-b116-e53479fc6bc7.sql",
      "supabase/migrations/20260814214011_4684446c-18a8-4070-b873-44fb8fbc7162.sql",
      "supabase/migrations/20260814214121_dafeafc2-77d6-41b7-9044-f09e453764d2.sql",
      // Reads the cap from system_settings (`pricing.max_total_service_fee_ngn`)
      // and drops the retired 2,500 literal from admin_correct_pricing. The
      // match is the setting KEY, not an invented amount.
      "supabase/migrations/20260814235948_e9a9a6eb-1e0e-4e2b-b8b5-5cb984767bf4.sql",
    ],
  },
];

describe("the database does not invent facts either", () => {
  for (const rule of SQL_RULES) {
    it(`no new SQL file introduces a ${rule.name}`, () => {
      const offenders = SQL_FILES.filter((f) => {
        const src = fs.readFileSync(f, "utf8");
        if (isSeedFixture(src)) return false;
        return rule.pattern.test(stripSqlComments(src));
      }).map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
      const added = offenders.filter((o) => !rule.debt.includes(o));
      expect(added, `new ${rule.name} in SQL`).toEqual([]);
    });

    it(`the ${rule.name} debt list cannot rot`, () => {
      const stale = rule.debt.filter(
        (d) =>
          !fs.existsSync(path.join(ROOT, d)) ||
          !rule.pattern.test(stripSqlComments(fs.readFileSync(path.join(ROOT, d), "utf8"))),
      );
      expect(stale, "remove these from the debt list").toEqual([]);
    });
  }

  // The exemption above is the only way to get past these rules without being
  // on a debt list, so it gets tested harder than the rules it exempts.
  describe("the seed-fixture exemption", () => {
    const SEED = "-- safedeal:seed-fixture\n";

    it("exempts a marked file that only inserts its own rows", () => {
      expect(isSeedFixture(SEED + "INSERT INTO public.products (currency_code) VALUES ('NGN');")).toBe(true);
    });

    it("does not exempt an unmarked file, however seed-like it reads", () => {
      expect(isSeedFixture("-- seed data, honest\nINSERT INTO public.products (currency_code) VALUES ('NGN');")).toBe(false);
    });

    it("stops exempting a marked file the moment it declares a column default", () => {
      expect(isSeedFixture(SEED + "ALTER TABLE public.products ALTER COLUMN currency_code SET DEFAULT 'NGN';")).toBe(false);
    });

    it("stops exempting a marked file that creates or replaces a function", () => {
      expect(
        isSeedFixture(SEED + "CREATE OR REPLACE FUNCTION public.f() RETURNS text AS $$ SELECT 'NGN' $$ LANGUAGE sql;"),
      ).toBe(false);
    });

    it("is not fooled by a CREATE that is only mentioned in a comment", () => {
      expect(isSeedFixture(SEED + "-- CREATE TABLE t (c text DEFAULT 'NGN');\nINSERT INTO t VALUES ('NGN');")).toBe(true);
    });

    it("keeps every currently-exempt file free of schema statements", () => {
      const exempt = SQL_FILES.filter((f) => SEED_FIXTURE_MARKER.test(fs.readFileSync(f, "utf8")))
        .map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
      // If this ever fires, a fixture grew schema and must lose its marker.
      const withSchema = exempt.filter(
        (r) => !isSeedFixture(fs.readFileSync(path.join(ROOT, r), "utf8")),
      );
      expect(withSchema, "these claim to be seed fixtures but declare schema").toEqual([]);
    });
  });

  it("the agreement-lock trigger never fabricates delivery terms", () => {
    const migrations = SQL_FILES.map((f) => fs.readFileSync(f, "utf8"));
    const latest = migrations.filter((s) => s.includes("FUNCTION public.ensure_delivery_terms_on_lock")).pop();
    expect(latest, "ensure_delivery_terms_on_lock migration missing").toBeTruthy();
    const bodySrc = stripSqlComments(latest as string);
    expect(bodySrc).not.toMatch(/INSERT INTO public\.transaction_delivery_terms/i);
    expect(bodySrc).toContain("flag_for_release_review");
  });
});
