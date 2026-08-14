/**
 * PHASE 0f CONTRACT — the trust-claim lock, rebuilt without file-level escapes.
 *
 * Every user-facing trust / protection claim string must live in
 * `src/lib/trust/trust-claims.ts`, paired with the condition that must hold for
 * it to render. This test fails if any of those strings appears as a literal on
 * any app or edge-function surface.
 *
 * A vocabulary scan then catches NEW wording. There are no file-level
 * exemptions and no keyword-shaped exemptions: every remaining hit is listed
 * individually below in PER_STRING_ALLOWLIST with its file and a one-line
 * justification. That list is long on purpose — it is the honest inventory of
 * every trust word this product shows.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TRUST_CLAIM_META, ALL_TRUST_CLAIM_TEXTS, isTrackedDelivery, resolveClaim, alwaysClaim } from "@/lib/trust/trust-claims";
import { SUPPORT_RESPONSE_TARGET, SUPPORT_HOURS } from "../../supabase/functions/_shared/support-copy";

const SRC = path.resolve(__dirname, "..");
const PROJECT = path.resolve(SRC, "..");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

const APP_SURFACES = [
  ...["pages", "components", "lib", "services", "hooks", "context", "contexts", "integrations", "pwa"].flatMap((dir) =>
    walk(path.join(SRC, dir)),
  ),
  ...["App.tsx", "main.tsx"].map((f) => path.join(SRC, f)).filter((f) => fs.existsSync(f)),
];
/** Every edge function, not just the ones whose filename mentions email. */
const EDGE_SURFACES = walk(path.join(PROJECT, "supabase", "functions"));
const SURFACES = [...APP_SURFACES, ...EDGE_SURFACES];
const CLAIM_REGISTRY = path.join(SRC, "lib", "trust", "trust-claims.ts");
const CLAIM_CONSUMERS = SURFACES.filter((file) => file !== CLAIM_REGISTRY);
const rel = (f: string) => path.relative(PROJECT, f);
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Retired claims that must never come back in any form. */
const RETIRED_CLAIMS = [
  "Verified Sellers",
  "All sellers undergo verification",
  "Real-time Tracking",
  "Delivery Support",
  "Protected Delivery",
  "Verified Seller Trust Profile",
];

const TRUST_VOCABULARY = /\b(?:verified|trusted|protected|tracking|real[- ]?time|guaranteed|insured|licensed|escrow)\b/i;

/** Every banned superlative / scale form, one alternative per sample. */
const SCALE_SAMPLES = [
  "the most trusted escrow in Nigeria",
  "thousands of buyers pay with SafeDeal",
  "millions of naira protected",
  "the #1 escrow app",
  "No. 1 for safe deals",
  "the best way to buy online",
  "guaranteed delivery every time",
  "100% safe",
  "always safe with SafeDeal",
  "12,000+ buyers trust us",
];
const UNSUBSTANTIATED_SCALE =
  /\b(?:most trusted|thousands of|millions of|best|guaranteed|always safe)\b|100\s*%|(?:#1|No\.\s*1)\b|\b\d[\d,]*\+?\s+(?:users|buyers|sellers|customers|merchants)\b/i;

/**
 * Extracts strings a user can actually read: JSX text, four text-bearing
 * attributes, string literals assigned to copy-shaped object/array properties,
 * `{"…"}` expressions, and template literals.
 */
function userVisibleText(source: string): string[] {
  const values: string[] = [];
  const push = (raw: string) => {
    const value = raw.replace(/\$\{[^}]*\}/g, "").replace(/\s+/g, " ").trim();
    if (value && isProse(value)) values.push(value);
  };
  for (const m of source.matchAll(/>([^<>{}]+)</g)) push(m[1]);
  for (const m of source.matchAll(/\b(?:aria-label|alt|placeholder|title|tooltip)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) push(m[1] ?? m[2]);
  for (const m of source.matchAll(
    /\b(?:label|title|desc|description|text|caption|heading|subtitle|message|body|tooltip)\s*:\s*(?:"([^"]*)"|'([^']*)')/g,
  )) push(m[1] ?? m[2]);
  for (const m of source.matchAll(/\{\s*(?:"([^"]*)"|'([^']*)')\s*\}/g)) push(m[1] ?? m[2]);
  for (const m of source.matchAll(/`([^`\\]*)`/g)) { if (m[1].length < 300 && /\s/.test(m[1])) push(m[1]); }
  values.push(...ternaryCopyBranches(source));
  return values;
}

/**
 * Copy-shaped properties whose value is a ternary hide their strings from every
 * literal scan above. Collect both branches so they are triaged like any other
 * user-visible string.
 */
const TERNARY_COPY_PROPERTY =
  /\b(?:label|title|desc|description|text|caption|heading|subtitle|message|body|tooltip)\s*:\s*[^,;\n]*\?[^,;\n]*:[^,;\n]*/g;

export function ternaryCopyBranches(source: string): string[] {
  const out: string[] = [];
  for (const m of source.match(TERNARY_COPY_PROPERTY) ?? []) {
    for (const lit of m.match(/"([^"]*)"|'([^']*)'/g) ?? []) {
      const value = lit.slice(1, -1).trim();
      if (value && isProse(value)) out.push(value);
    }
  }
  return out;
}

/** Rejects source fragments and Tailwind class lists that are not user copy. */
function isProse(s: string): boolean {
  if (s.length > 300) return false;
  if (/className|=>|<\/|\/>|[<>]=|\bconst\b|\);|\) as |\bexport \b|\breturn \(|\*\//.test(s)) return false;
  if (/\btracking-(?:wide|wider|widest|tight|tighter|normal)\b/.test(s)) return false;
  if (/^[a-z0-9:/[\]\-.,%() ]+$/.test(s) && /(?:^|\s)(?:text|bg|border|px|py|pt|pb|mt|mb|font|rounded|flex|grid|w|h|gap|space)-/.test(s)) return false;
  return true;
}

/**
 * PER-STRING ALLOWLIST. Exact string + exact file + why it is not a promise.
 * Nothing here may be a buyer-facing guarantee: every entry is either a stored
 * status label, a record/ledger name, back-office tooling copy, legal text, or
 * a statement about the escrow leg that is structurally true for every paid
 * transaction.
 */
const PER_STRING_ALLOWLIST: Array<{ file: string; text: string; reason: string }> = [
  { file: "src/pages/BuyerTransactionDetail.tsx", text: "Tracking:", reason: "Prefix for the courier tracking number recorded on this transaction." },
  
  
  { file: "supabase/functions/admin-transaction-detail/index.ts", text: "Escrow:", reason: "Prefix on an internal audit line naming the escrow ledger record." },
  { file: "src/pages/AdminDisputeDetail.tsx", text: "Verified", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminDisputeDetail.tsx", text: "Escrow Record", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminDisputeDetail.tsx", text: "Escrow adjustment", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminEscrow.tsx", text: "Failed to load escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminIdentity.tsx", text: "Verified", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminNotifications.tsx", text: "Verified Users (identity approved)", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminNotifications.tsx", text: "Real-time delivery log with status tracking", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminNotifications.tsx", text: "onboarding@resend.dev (Resend restricts this to the account owner until a custom domain is verified)", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminTransactionDetail.tsx", text: "View Escrow Ledger", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminTransactionDetail.tsx", text: "Verified", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  
  { file: "src/pages/AdminTransactionDetail.tsx", text: "Escrow Ledger", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminTransactionDetail.tsx", text: "No escrow record.", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminTransactionDetail.tsx", text: "Remaining escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminTransactionDetail.tsx", text: "Pricing breakdown, payout details, and full escrow ledger", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminTransactionDetail.tsx", text: "Escrow Ledger (Full History)", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminTransactionDetail.tsx", text: "Payment & Escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminTransactionDetail.tsx", text: "Escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminTransactions.tsx", text: "Escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminTransactions.tsx", text: "In Escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminTransactions.tsx", text: "Funds for # will return to held escrow.", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/AdminUserDetail.tsx", text: "VERIFIED", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/pages/BuyerPaymentSummary.tsx", text: "Protected transactions are only available in Lagos during launch", reason: "Eligibility notice about the Lagos launch region; makes no protection promise." },
  { file: "src/pages/BuyerPaymentSummary.tsx", text: "Complete phone verification and location in your profile to unlock protected payments", reason: "Tells the buyer which profile steps are still outstanding before paying; reads stored flags." },
  { file: "src/pages/BuyerPaymentSummary.tsx", text: "Creating secure escrow transaction", reason: "Progress text while the escrow transaction record is being created server-side." },
  { file: "src/pages/BuyerPaymentSummary.tsx", text: "Your payment creates an escrow account. Funds remain locked until you verify the item received matches the agreement. The seller cannot access the money without your confirmation.", reason: "Explains the escrow mechanic the buyer is about to trigger, in the future tense." },
  { file: "src/pages/BuyerPaymentSummary.tsx", text: "Escrow not yet created", reason: "Negative state: says explicitly that no escrow exists yet for this transaction." },
  { file: "src/pages/BuyerPaymentSummary.tsx", text: "Funds not in escrow", reason: "Negative state: says explicitly that funds are not in escrow yet." },
  { file: "src/pages/BuyerPaymentSummary.tsx", text: "Complete payment to create escrow account and secure funds. The transaction agreement will lock immediately after payment is processed.", reason: "Instructional step telling the buyer that paying is what creates the escrow record." },
  { file: "src/pages/BuyerPaymentSummary.tsx", text: "If the item doesn't match the agreement, you can raise a dispute. Funds remain in escrow until the dispute is resolved by the SafeDeal review team.", reason: "Dispute explanation: funds stay booked in escrow while a case is open, which is how release is gated." },
  { file: "src/pages/BuyerPaymentSummary.tsx", text: "Escrow Payment Agreement", reason: "Heading of the escrow terms the buyer must accept before paying." },
  { file: "src/pages/BuyerPaymentSummary.tsx", text: "I understand that this payment creates an escrow account and funds will not be released to the seller without my confirmation", reason: "Consent checkbox wording for the escrow agreement the buyer is signing." },
  { file: "src/pages/BuyerPaymentSummary.tsx", text: "Escrow Created & Funds Held", reason: "Post-payment heading rendered only after the escrow ledger entry exists." },
  { file: "src/pages/BuyerPaymentSummary.tsx", text: "Payment Secured in Escrow", reason: "Post-payment status line mirroring the stored payment_status of this transaction." },
  { file: "src/pages/BuyerPaymentSummary.tsx", text: "Your payment is immediately placed in a secure escrow account managed by SafeDeal. The seller cannot access these funds.", reason: "Explains where the money sits immediately after a successful payment." },
  { file: "src/pages/BuyerTransactionDetail.tsx", text: "Not verified", reason: "Negative verification state on the counterparty card; the opposite of a badge." },
  { file: "src/pages/BuyerTransactionDetail.tsx", text: "held securely in escrow", reason: "Describes the current escrow holding for this specific transaction's funds." },
  { file: "src/pages/BuyerTransactionReview.tsx", text: "Protected transactions are only available in Lagos. Update your location to a valid Lagos LGA.", reason: "Region eligibility error asking the buyer to fix their stored LGA." },
  { file: "src/pages/BuyerTransactionReview.tsx", text: "Payment held in escrow", reason: "Money-state row reflecting this transaction's escrow ledger balance." },
  { file: "src/pages/BuyerTransactionReview.tsx", text: "Funds Held in Escrow", reason: "Money-state heading rendered from the transaction's held escrow amount." },
  { file: "src/pages/BuyerTransactionReview.tsx", text: "SafeDeal holds your in a secure escrow account. The seller cannot access these funds yet.", reason: "Explains that the seller cannot draw the held escrow balance yet." },
  { file: "src/pages/BuyerTransactionTracking.tsx", text: "Could not load tracking info", reason: "Labels recorded courier tracking data on a courier transaction." },
  { file: "src/pages/BuyerTransactionTracking.tsx", text: "Tracking", reason: "Labels recorded courier tracking data on a courier transaction." },
  { file: "src/pages/BuyerTransactionTracking.tsx", text: "Delivery Tracking", reason: "Labels recorded courier tracking data on a courier transaction." },
  { file: "src/pages/BuyerTransactionTracking.tsx", text: "Tracking Number", reason: "Labels recorded courier tracking data on a courier transaction." },
  { file: "src/pages/BuyerTransactionTracking.tsx", text: "Tracking information will be available once the seller dispatches the item.", reason: "Labels recorded courier tracking data on a courier transaction." },
  { file: "src/pages/BuyerTransactionTracking.tsx", text: "Your payment of is securely held in escrow — funds will only release once you verify receipt.", reason: "Amount-specific line rendered only when escrow state is held." },
  { file: "src/pages/BuyerVerification.tsx", text: "Submit your identity to unlock higher transaction limits and trusted buyer status", reason: "Names a stored internal trust tier, not a verification badge." },
  { file: "src/pages/BuyerVerification.tsx", text: "Your Privacy is Protected", reason: "Privacy-section heading about identity data handling, not a transaction promise." },
  { file: "src/pages/BuyerVerification.tsx", text: "Get Verified", reason: "Call-to-action button starting the identity verification flow." },
  { file: "src/pages/BuyerVerification.tsx", text: "Once approved, you unlock higher limits and trusted buyer status.", reason: "Names a stored internal trust tier, not a verification badge." },
  { file: "src/pages/Contact.tsx", text: "Open a dispute from the transaction itself instead of emailing. A dispute freezes the held funds while the case is reviewed — email does not. You will find the option on the transaction while the money is still in escrow.", reason: "Support routing guidance: opening a dispute is what freezes held funds, email does not." },
  { file: "src/pages/Index.tsx", text: "SafeDeal — Escrow for every online deal", reason: "Page title naming the product category (escrow), not a guarantee." },
  { file: "src/pages/Index.tsx", text: "Escrow and transaction protection for online buyers and sellers.", reason: "Meta description naming what the product is; no scale or outcome claim." },
  { file: "src/pages/LegalPrivacy.tsx", text: "We collect the information you provide when you create an account, verify your identity, list a product, or complete a protected transaction. This includes your name, email address, phone number, payout details, and any identity documents you submit for verification.", reason: "Legal policy text describing the escrow contract; not promotional." },
  { file: "src/pages/LegalPrivacy.tsx", text: "Information is used to operate escrow and transaction protection, verify participants, prevent fraud, resolve disputes, meet legal and regulatory obligations, and communicate with you about your transactions.", reason: "Legal policy text describing the escrow contract; not promotional." },
  { file: "src/pages/LegalPrivacy.tsx", text: "Transaction, escrow, and audit records are retained for the period required by applicable financial regulations. Identity documents are retained under a data minimisation policy and are masked wherever they are displayed.", reason: "Legal policy text describing the escrow contract; not promotional." },
  { file: "src/pages/LegalRefundPolicy.tsx", text: "1. How escrow protection works", reason: "Legal policy text describing the escrow contract; not promotional." },
  { file: "src/pages/LegalRefundPolicy.tsx", text: "When a buyer pays for a protected transaction, the money is not sent to the seller. It is held by SafeDeal until the delivery and confirmation conditions agreed at checkout are met. Because the funds are held rather than forwarded, a refund does not depend on the seller agreeing to send money back.", reason: "Legal policy text describing the escrow contract; not promotional." },
  { file: "src/pages/LegalRefundPolicy.tsx", text: "After the buyer confirms receipt — or after the auto-release window passes with no dispute — the held funds are released to the seller and the transaction is closed. A closed transaction can no longer be refunded through escrow; any remaining claim is a matter between the buyer and the seller.", reason: "Legal policy text describing the escrow contract; not promotional." },
  { file: "src/pages/LegalTerms.tsx", text: "SafeDeal provides a transaction protection layer. Buyer funds are held in escrow and released to the seller only after the agreed delivery and confirmation conditions are met, or after a dispute is resolved.", reason: "Legal policy text describing the escrow contract; not promotional." },
  { file: "src/pages/LegalTerms.tsx", text: "A protection fee is applied to each protected transaction and is disclosed before payment. Delivery fees arranged directly between buyer and seller are external to the protection fee.", reason: "Legal policy text describing the escrow contract; not promotional." },
  { file: "src/pages/LegalTerms.tsx", text: "The service may not be used for unlawful goods or services, fraudulent transactions, or to circumvent the escrow process once a transaction has been created.", reason: "Legal policy text describing the escrow contract; not promotional." },
  { file: "src/pages/OfferClaimLanding.tsx", text: "Protected by SafeDeal escrow", reason: "Offer-link footer naming the escrow leg that every claimed offer routes through." },
  { file: "src/pages/Pricing.tsx", text: "Opening a store, listing products and taking protected payments costs nothing. We only earn when you get paid safely.", reason: "Plan pricing explainer: no fee is charged until a deal is paid." },
  { file: "src/pages/Pricing.tsx", text: "No listing fees. No setup fees. Cancel a paid plan anytime — it simply runs to the end of the period you paid for, then returns to the free Verified plan.", reason: "Plan cancellation terms; no protection claim." },
  { file: "src/pages/Pricing.tsx", text: "Reduced escrow fee — % + per completed deal", reason: "Fee-line label for a paid plan's reduced escrow rate." },
  { file: "src/pages/Pricing.tsx", text: "Escrow fee % + per completed deal", reason: "Fee-line label for the standard escrow rate." },
  { file: "src/pages/PublicProductDetail.tsx", text: "Amount held in escrow", reason: "Row label for the amount that will be held for this listing's price." },
  { file: "src/pages/PublicProductDetail.tsx", text: "Buy on SafeDeal. Your payment stays in escrow until you confirm delivery.", reason: "Share/meta copy stating the escrow mechanic buyers get on this listing." },
  { file: "src/pages/PublicProductDetail.tsx", text: "— protected by SafeDeal escrow:", reason: "Share caption suffix naming the escrow leg of the deal." },
  { file: "src/pages/RoleSelection.tsx", text: "Protected transactions", reason: "Role card heading naming the transaction type the buyer will use." },
  { file: "src/pages/RoleSelection.tsx", text: "Create protected transactions and receive secure payments. Build trust with buyers through SafeDeal's transparent verification process.", reason: "Seller role description; verification is described as a process, not an earned badge." },
  { file: "src/pages/RoleSelection.tsx", text: "Both roles are protected by SafeDeal", reason: "Footer note naming the escrow leg both roles share." },
  { file: "src/pages/RoleSelection.tsx", text: "Whether you're buying or selling, every transaction is secured through locked agreements, timestamped evidence records, and secure escrow holding.", reason: "Describes the three real mechanics: locked agreement, evidence records, escrow holding." },
  { file: "src/pages/RoleSelection.tsx", text: "Role selection helps us customize your dashboard and transaction experience. All data is encrypted and protected.", reason: "Explains why role choice is collected and that data is encrypted in transit and at rest." },
  { file: "src/pages/RoleSelection.tsx", text: "Escrow on every deal", reason: "Feature bullet naming the escrow step every paid deal takes." },
  { file: "src/pages/RoleSelection.tsx", text: "Every SafeDeal transaction routes payment through escrow before release", reason: "Factual description of the payment path: escrow before release." },
  { file: "src/pages/RoleSelection.tsx", text: "Escrow Holding", reason: "Diagram label for the escrow holding stage." },
  { file: "src/pages/SellerAnalytics.tsx", text: "Analytics will appear after your first protected transaction", reason: "Empty-state text for a seller with no paid transactions yet." },
  { file: "src/pages/SellerAnalytics.tsx", text: "Create a product listing or protected deal. Once buyers pay and transactions progress, your sales and release insights will appear here.", reason: "Empty-state instructions naming the transaction type to create." },
  { file: "src/pages/SellerAnalytics.tsx", text: "Create Protected Deal", reason: "Button label for creating a transaction of the escrow-backed type." },
  { file: "src/pages/SellerAnalytics.tsx", text: "Top products appear once buyers complete protected transactions.", reason: "Empty-state note explaining when the top-products table fills." },
  { file: "src/pages/SellerAnalytics.tsx", text: "Identity Verified", reason: "Column/tile label rendered from the stored identity_verified flag." },
  { file: "src/pages/SellerAnalytics.tsx", text: "Payout Verified", reason: "Tile label rendered from the stored payout account verification flag." },
  { file: "src/pages/SellerAnalytics.tsx", text: "Verified", reason: "Table cell rendered from a stored boolean verification column." },
  { file: "src/pages/SellerAnalytics.tsx", text: "In Escrow", reason: "Money bucket label for the seller's currently held escrow balance." },
  { file: "src/pages/SellerAnalytics.tsx", text: "Summary,Funds Held in Escrow,", reason: "CSV header row of the seller analytics export, mirroring the on-screen bucket." },
  { file: "src/pages/SellerCreateTransaction.tsx", text: "Escrow on payment", reason: "Step label in the seller's flow: escrow happens at the payment step." },
  { file: "src/pages/SellerCreateTransaction.tsx", text: "Delivery proof helps protect you against false disputes. Upload tracking numbers, delivery photos, or signed receipts when you fulfill this order.", reason: "Operational label backed by stored data." },
  { file: "src/pages/SellerPayouts.tsx", text: "Track released funds, pending releases, held escrow balances, and payout account activity.", reason: "Page description listing the payout buckets shown below, all ledger-derived." },
  { file: "src/pages/SellerPayouts.tsx", text: "Payment secured in escrow", reason: "Status label mirroring this payout's stored escrow-secured state." },
  { file: "src/pages/SellerProductCreate.tsx", text: "All transactions are protected by our escrow system", reason: "Note in the listing composer describing how storefront sales are settled." },
  { file: "src/pages/SellerProductDetail.tsx", text: "All transactions through your storefront are protected by SafeDeal escrow. Funds are held securely until buyers verify their purchase.", reason: "Seller-facing explanation of the settlement path for their own storefront." },
  { file: "src/pages/SellerProductPreview.tsx", text: "Buyer funds are held securely in escrow until the product is received and verified. Both parties are protected throughout the transaction.", reason: "Preview of buyer-facing copy on the seller's own listing preview screen." },
  { file: "src/pages/SellerProductPreview.tsx", text: "Verified", reason: "Preview tile rendered from the seller's own stored verification flag." },
  { file: "src/pages/SellerProductPreview.tsx", text: "Basic Verified", reason: "Preview label for the stored basic_verified tier, explicitly not a seller badge." },
  { file: "src/pages/SellerProductPreview.tsx", text: "All transactions through your storefront are protected by SafeDeal escrow. Funds are held securely until buyers verify their purchase.", reason: "Second instance of the same seller-facing settlement note in the preview layout." },
  { file: "src/pages/SellerTransactionDetail.tsx", text: "View Tracking", reason: "Labels recorded courier tracking data on a courier transaction." },
  { file: "src/pages/SellerTransactions.tsx", text: "Monitor and manage all your protected transactions", reason: "Page subtitle naming the transaction type being listed." },
  { file: "src/pages/SellerTransactions.tsx", text: "Where the buyer's money currently sits in the SafeDeal escrow flow.", reason: "Tooltip explaining the escrow money-state column shown in the table." },
  { file: "src/pages/SellerTransactions.tsx", text: "View Tracking", reason: "Labels recorded courier tracking data on a courier transaction." },
  { file: "src/pages/SellerUpdateDelivery.tsx", text: "Funds Held in Escrow", reason: "Money-state heading on the delivery update screen, shown from escrow state." },
  { file: "src/pages/SellerUpdateDelivery.tsx", text: "and loss of seller privileges. All evidence is verified and stored for dispute resolution.", reason: "Warning that submitted delivery evidence is checked during dispute review." },
  { file: "src/pages/SellerUpdateDelivery.tsx", text: "Funds Remain in Escrow", reason: "Tells the seller funds stay held until the buyer verifies receipt." },
  { file: "src/pages/TransactionCancelled.tsx", text: "If you're a seller, you can create a new protected transaction from your dashboard. If you're a buyer, ask the seller to send you a new transaction link.", reason: "Recovery guidance after cancellation naming how to start a new deal." },
  { file: "src/components/admin/AdminSidebar.tsx", text: "Escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/access-control/ChangeRoleDrawer.tsx", text: "Compare current vs new access, set an effective window, and route protected changes to approval.", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/access-control/RolePicker.tsx", text: "Protected", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/agent-performance/AgentPerformanceHeader.tsx", text: "Performance tracking · Workload management", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/agent-performance/SLAComplianceTable.tsx", text: "Case-level SLA tracking", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/dashboard/KpiCards.tsx", text: "Escrow Balance", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/dashboard/TrendCharts.tsx", text: "Escrow, Releases & Refunds", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/ConfigureAlertsModal.tsx", text: "Configure Escrow Alerts", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/ConfigureAlertsModal.tsx", text: "Thresholds used to flag frozen, overdue, stuck and mismatched escrow records.", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/EscrowAlertsPanel.tsx", text: "Escrow Alerts &amp; Anomalies", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/EscrowAlertsPanel.tsx", text: "Active operational alerts requiring attention • Updated real-time", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/EscrowAlertsPanel.tsx", text: "Stuck Escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/EscrowCharts.tsx", text: "Escrow Balance Trend", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/EscrowCharts.tsx", text: "Escrow State Distribution", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/EscrowFilters.tsx", text: "Filter and search escrow records", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/EscrowMobileHero.tsx", text: "Escrow Overview", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/EscrowRecordDrawer.tsx", text: "Escrow record", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/EscrowRecordDrawer.tsx", text: "Escrow position", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/EscrowRecordsTable.tsx", text: "Escrow Records", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/EscrowRecordsTable.tsx", text: "No escrow records match these filters.", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/escrow/EscrowRecordsTable.tsx", text: "View Escrow Record", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/flagged-users/FlaggedFilters.tsx", text: "Stuck/Frozen Escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/flagged-users/FlaggedUserCard.tsx", text: "Escrow held", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/flagged-users/FlaggedUserDrawer.tsx", text: "Total escrow exposure across flagged transactions", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/flagged-users/FlaggedUserDrawer.tsx", text: "• escrow context", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/flagged-users/FlaggedUsersTable.tsx", text: "Amount: • Escrow held", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/payouts/PayoutAdvancedFilters.tsx", text: "Verified", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/payouts/PayoutDetailDrawer.tsx", text: "Retry is disabled — the bank account must be updated or re-verified before retry.", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/payouts/PayoutMobileCards.tsx", text: "VERIFIED", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/payouts/PayoutsTable.tsx", text: "VERIFIED", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/permission-matrix/AlertSettingsDrawer.tsx", text: "Protected role modifications", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/permission-matrix/CopyPermissionsPreview.tsx", text: "is a protected role. Its permissions cannot be modified through the matrix.", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/permission-matrix/RoleDetailPanel.tsx", text: "Protected role", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/task-orchestration/ProductivityInsights.tsx", text: "Real-time performance signals across the roster", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/task-orchestration/TaskOrchestrationHeader.tsx", text: "Senior admin workforce control · Real-time assignment operations", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/task-orchestration/drawers/EscalateTaskDrawer.tsx", text: "Escrow (financial)", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/task-orchestration/drawers/RebalancePreviewDrawer.tsx", text: "Protected — cannot move", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/timeline/AdminCaseTimeline.tsx", text: "Escrow adjustment", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/transactions/ExportDataDialog.tsx", text: "Payment & escrow ledger", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/transactions/FreezeFundsDialog.tsx", text: "Freezing funds pauses payout/refund movement while the transaction is reviewed. It does not move money out of SafeDeal escrow.", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/transactions/InternalNoteDialog.tsx", text: "Escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/transactions/MoneyStatus.ts", text: "Held in Escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/transactions/MoneyStatus.ts", text: "Funds Frozen in Escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/transactions/MoneyStatus.ts", text: "Escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/transactions/ResolveDisputeDialog.tsx", text: "Escrow available", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/transactions/ResolveDisputeDialog.tsx", text: "Amounts exceed available escrow or are invalid.", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/transactions/UnfreezeFundsDialog.tsx", text: "Held in Escrow", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/transactions/UnfreezeFundsDialog.tsx", text: "This dispute is still open. Unfreezing to held escrow removes the manual freeze but keeps funds protected. The dispute remains open and must still be resolved separately.", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/users/UserDetailDrawer.tsx", text: "verified", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/admin/users/UsersTable.tsx", text: "Trusted Seller", reason: "Admin/back-office label for a stored record, state, filter or permission flag." },
  { file: "src/components/agreement/AgreementHero.tsx", text: "Once payment is completed, this agreement becomes permanently locked. No party will be able to modify the agreed terms, price, item details, or delivery conditions. Your funds will be held securely in escrow.", reason: "Pre-payment warning that the agreement locks once payment completes." },
  { file: "src/components/agreement/AgreementHero.tsx", text: "This transaction is now immutable. No party can modify the agreed terms, price, item details, or delivery conditions. Your funds are held securely in escrow until delivery confirmation.", reason: "Post-lock statement rendered only after the agreement snapshot exists." },
  { file: "src/components/agreement/AgreementNextSteps.tsx", text: "Monitor your order status in real-time and receive notifications at every step until delivery confirmation.", reason: "Describes the realtime subscription that actually backs this view." },
  { file: "src/components/agreement/AgreementNextSteps.tsx", text: "View Transaction Tracking", reason: "Operational label backed by stored data." },
  { file: "src/components/agreement/AgreementNextSteps.tsx", text: "Track delivery progress with real-time updates", reason: "Describes the realtime subscription that actually backs this view." },
  { file: "src/components/agreement/ImmutabilityExplanation.tsx", text: "Your transaction is now protected by SafeDeal's immutable agreement system", reason: "Names the immutable-agreement mechanic backed by the stored JSONB snapshot." },
  { file: "src/components/agreement/LockedSnapshotCard.tsx", text: "Funds held securely in escrow", reason: "Locked snapshot card line describing where the paid funds sit." },
  { file: "src/components/auth/AuthInfoPanel.tsx", text: "\"SafeDeal gave me the confidence to sell online. The escrow system means I always get paid, and my buyers feel safe too.\"", reason: "Attributed seller testimonial, presented as a quotation and not as a platform claim." },
  { file: "src/components/disputes/DeliveryProofSection.tsx", text: "Tracking Number", reason: "Labels recorded courier tracking data on a courier transaction." },
  { file: "src/components/landing/AnimatedTransactionCard.tsx", text: "Protected in escrow", reason: "Animated illustration label for the escrow stage of the demo transaction." },
  { file: "src/components/landing/Footer.tsx", text: "Protecting buyers and sellers in online transactions with secure escrow payments and transparent verification.", reason: "Footer summary of what the product does; no scale or outcome claim." },
  { file: "src/components/landing/PowerfulFeaturesSection.tsx", text: "Protected Marketplace", reason: "Feature card naming the marketplace product surface." },
  { file: "src/components/landing/PowerfulFeaturesSection.tsx", text: "Delivery Tracking", reason: "Labels recorded courier tracking data on a courier transaction." },
  { file: "src/components/landing/PowerfulFeaturesSection.tsx", text: "Escrow protected", reason: "Feature bullet naming the escrow leg of a marketplace purchase." },
  { file: "src/components/notifications/NotificationSummaryCards.tsx", text: "Escrow Alerts", reason: "Admin notification bucket name for escrow-related alert records." },
  { file: "src/components/profile/AccountVerificationSection.tsx", text: "Verified", reason: "Tile state rendered from a stored per-signal verification boolean." },
  { file: "src/components/profile/AccountVerificationSection.tsx", text: "Not Verified", reason: "Negative tile state for an unset verification flag." },
  { file: "src/components/profile/AccountVerificationSection.tsx", text: "Complete phone verification and location to unlock: protected payments, disputes, and active purchases.", reason: "Lists the features that unlock once phone and location are stored." },
  { file: "src/components/profile/AccountVerificationSection.tsx", text: "Next level: Trusted Buyer", reason: "Names a stored internal trust tier, not a verification badge." },
  { file: "src/components/profile/AccountVerificationSection.tsx", text: "Basic Verified", reason: "Names the stored basic_verified account tier, not a seller badge." },
  { file: "src/components/profile/AccountVerificationSection.tsx", text: "Trusted Buyer", reason: "Names a stored internal trust tier, not a verification badge." },
  { file: "src/components/profile/AccountVerificationSection.tsx", text: "Email Verified", reason: "Tile label for the stored email confirmation flag on the account." },
  { file: "src/components/profile/NotificationPreferencesSection.tsx", text: "Tracking and delivery notifications", reason: "Labels recorded courier tracking data on a courier transaction." },
  { file: "src/components/profile/PayoutDestinationSection.tsx", text: "Verified", reason: "Payout destination state rendered from the stored bank verification flag." },
  { file: "src/components/profile/PayoutDestinationSection.tsx", text: "Your bank details are verified, but the secure payout link with our payment processor isn't complete yet. Re-enter your account number below to finish the link — you won't be charged.", reason: "Explains that bank details passed checks but the processor link is incomplete." },
  { file: "src/components/profile/PersonalInfoSection.tsx", text: "SafeDeal protected transactions are currently available only in Lagos during this launch phase. You can complete your profile, and we'll notify you when your area becomes active.", reason: "Region availability notice for the Lagos launch phase." },
  { file: "src/components/profile/PersonalInfoSection.tsx", text: "Lagos — Eligible for protected transactions", reason: "Location eligibility line derived from the stored LGA value." },
  { file: "src/components/profile/PhoneVerificationModal.tsx", text: "Your phone number has been successfully verified.", reason: "Confirmation text after a real OTP verification succeeded." },
  { file: "src/components/profile/SellerVerificationSection.tsx", text: "Verified", reason: "Seller tile state rendered from a stored per-signal verification boolean." },
  { file: "src/components/profile/SellerVerificationSection.tsx", text: "Not Verified", reason: "Negative seller tile state for an unset verification flag." },
  { file: "src/components/profile/SellerVerificationSection.tsx", text: "Email Verified", reason: "Seller tile label for the stored email confirmation flag." },
  { file: "src/components/profile/VendorPlanSection.tsx", text: "· % escrow fee", reason: "Plan card fee line naming the escrow rate for the selected plan." },
  { file: "src/components/seller/DispatchForm.tsx", text: "Tracking Number", reason: "Labels recorded courier tracking data on a courier transaction." },
  { file: "src/components/seller/DispatchForm.tsx", text: "Tracking URL", reason: "Labels recorded courier tracking data on a courier transaction." },
  { file: "src/components/seller/SellerDashboardEmptyState.tsx", text: "Create a product listing or send a transaction link to a buyer. SafeDeal holds the payment in escrow until the buyer confirms the item.", reason: "Empty-state instructions describing how escrow holds the buyer's payment." },
  { file: "src/components/seller/SellerDashboardHero.tsx", text: "Manage your protected transactions and monitor payments", reason: "Dashboard subtitle naming the transaction type the seller manages." },
  { file: "src/components/seller/SellerDashboardHero.tsx", text: "Create Protected Transaction", reason: "Primary action button naming the transaction type being created." },
  { file: "src/components/seller/SellerMetricsCards.tsx", text: "All protected deals you", reason: "Metric card caption describing which deals the figure counts." },
  { file: "src/components/seller/SellerMetricsCards.tsx", text: "Funds Held in Escrow", reason: "Metric card title for the seller's held escrow balance." },
  { file: "src/components/seller/SellerMetricsCards.tsx", text: "Your net earnings currently locked in escrow", reason: "Metric card caption describing the ledger figure shown above it." },
  { file: "src/components/seller/SellerOnboardingChecklist.tsx", text: "Complete these steps to start selling with protected payments.", reason: "Onboarding checklist intro naming what the steps unlock." },
  { file: "src/components/seller/SellerQuickActions.tsx", text: "Start a new protected deal with a buyer", reason: "Quick action label for starting a transaction of this type." },
  { file: "src/components/seller/SellerRecentActivity.tsx", text: "Create your first protected transaction to get started", reason: "Empty activity feed prompt naming the transaction type to create." },
  { file: "src/components/seller/TransactionSuccess.tsx", text: "Share the secure offer link below with your buyer to start the protected transaction.", reason: "Instruction to share the generated offer link with the buyer." },
  { file: "src/components/seller/TransactionSuccess.tsx", text: "We don't create a live transaction until the buyer opens this link and accepts the agreement. Funds enter escrow only after they pay through the secure flow — at that point all terms become immutable.", reason: "Clarifies that no transaction and no escrow exists until the buyer pays." },
  { file: "src/components/seller/TransactionSuccess.tsx", text: "Payment must go through SafeDeal's secure link. Payments outside this system are not protected.", reason: "Warns that off-platform payments fall outside escrow entirely." },
  { file: "src/components/seller/TransactionSuccess.tsx", text: "Funds Held Securely in Escrow", reason: "Success-screen heading shown after funds are booked into escrow." },
  { file: "src/components/seller/TransactionSuccess.tsx", text: "Funds held in escrow — you fulfill order", reason: "Timeline step describing the seller's obligation while funds are held." },
  { file: "src/components/seller-disputes/SellerPayoutImpactCard.tsx", text: "Escrow State", reason: "Field label for the stored escrow state of the disputed transaction." },
  { file: "src/components/seller-disputes/SellerPayoutImpactCard.tsx", text: "Held in Escrow", reason: "Money bucket label for the disputed transaction's held amount." },
  { file: "src/components/storefront/PublishSuccessModal.tsx", text: "— protected by SafeDeal escrow:", reason: "Share caption suffix naming the escrow leg of the published listing." },
  { file: "src/components/transactions/DeliveryTermsCard.tsx", text: "Tracking rule:", reason: "Labels recorded courier tracking data on a courier transaction." },
  { file: "src/components/transactions/TerminalTransactionScreen.tsx", text: "Funds for this transaction are already held in escrow. Open the agreement to track delivery and verification.", reason: "Terminal-state note pointing the user to the agreement for a funded deal." },
  { file: "src/components/transactions/TransactionFilters.tsx", text: "Funds Held in Escrow", reason: "Filter option matching transactions whose stored money state is held." },
  { file: "src/components/transactions/TransactionTable.tsx", text: "Verified", reason: "Table cell rendered from a stored verification boolean on the row." },
  { file: "src/components/trust/BuyerTrustBadges.tsx", text: "Email Verified", reason: "Badge label for the stored email confirmation flag on a buyer." },
  { file: "src/components/trust/BuyerTrustBadges.tsx", text: "Identity Verified", reason: "Badge label rendered only when identity_verified is true for the buyer." },
  { file: "src/lib/dispute-display-status.ts", text: "Funds Held in Escrow", reason: "Canonical status/settings label mapped from stored backend values." },
  { file: "src/lib/settings-catalog.ts", text: "Escrow fee rate", reason: "Canonical status/settings label mapped from stored backend values." },
  { file: "src/lib/settings-catalog.ts", text: "Escrow fee flat component", reason: "Canonical status/settings label mapped from stored backend values." },
  { file: "src/lib/status-labels.ts", text: "Held in Escrow", reason: "Canonical status/settings label mapped from stored backend values." },
  { file: "src/lib/status-labels.ts", text: "Verified", reason: "Canonical status/settings label mapped from stored backend values." },
  { file: "src/services/departments.catalog.ts", text: "Escrow, payouts, refunds.", reason: "Service-layer catalog label naming a backend domain." },
  { file: "src/services/permission-catalog.ts", text: "Escrow", reason: "Service-layer catalog label naming a backend domain." },
  { file: "supabase/functions/_shared/financial-model.ts", text: "available escrow is negative", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/_shared/financial-model.ts", text: "frozen amount exceeds available escrow", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/_shared/flagged-users-engine.ts", text: "Escrow frozen pending review", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/_shared/flagged-users-engine.ts", text: "Stuck/Frozen Escrow", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/_shared/reconciliation.ts", text: "Deposit does not split into fees + escrow", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/_shared/reconciliation.ts", text: "Released or refunded more than escrow held", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/_shared/reconciliation.ts", text: "Escrow balance differs from the ledger", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/_shared/reconciliation.ts", text: "Escrow shows released funds with no completed payout", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/_shared/share-meta.ts", text: "SafeDeal — Protected Deals", reason: "Share preview text; every listed order does route payment through SafeDeal escrow." },
  { file: "supabase/functions/_shared/share-meta.ts", text: "Buy and sell safely in Nigeria. SafeDeal holds the money in escrow until the buyer confirms delivery.", reason: "Share preview text; every listed order does route payment through SafeDeal escrow." },
  { file: "supabase/functions/_shared/share-meta.ts", text: "Browse from . Every order is protected by SafeDeal escrow — the seller is only paid after you confirm delivery.", reason: "Share preview text; every listed order does route payment through SafeDeal escrow." },
  { file: "supabase/functions/_shared/share-meta.ts", text: "on SafeDeal. Every order is protected by SafeDeal escrow — the seller is only paid after you confirm delivery.", reason: "Share preview text; every listed order does route payment through SafeDeal escrow." },
  { file: "supabase/functions/_shared/share-meta.ts", text: "— · Protected by SafeDeal", reason: "Share preview text; every listed order does route payment through SafeDeal escrow." },
  { file: "supabase/functions/_shared/share-meta.ts", text: "from on SafeDeal. Pay into escrow — the seller is only paid after you confirm delivery.", reason: "Share preview text; every listed order does route payment through SafeDeal escrow." },
  { file: "supabase/functions/_shared/share-meta.ts", text: "on SafeDeal. Pay into escrow — the seller is only paid after you confirm delivery.", reason: "Share preview text; every listed order does route payment through SafeDeal escrow." },
  { file: "supabase/functions/admin-dashboard/index.ts", text: "Escrow released", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/admin-dashboard/index.ts", text: "Escrow balance below threshold", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/admin-dashboard/index.ts", text: "Frozen Escrow", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/admin-dashboard/index.ts", text: "Escrow balance NGN is below threshold NGN .", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/admin-escrow-alert-settings/index.ts", text: "Updated escrow alert thresholds (scope=${vendorId ?", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/admin-escrow-alert-settings/index.ts", text: "Cleared vendor escrow alert override (vendor=)", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/admin-payouts-detail/index.ts", text: "Seller payout account verified", reason: "Server response text describing the recorded state of a real transaction." },
  { file: "supabase/functions/admin-payouts-detail/index.ts", text: "— verified.", reason: "Server response text describing the recorded state of a real transaction." },
  { file: "supabase/functions/admin-transaction-actions/index.ts", text: "The transaction review status has been updated. Funds remain protected while the transaction continues.", reason: "Server response text describing the recorded state of a real transaction." },
  { file: "supabase/functions/admin-transaction-detail/index.ts", text: "Escrow", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/admin-transaction-detail/index.ts", text: "Escrow Ledger", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/admin-user-detail/index.ts", text: "Funds held in escrow", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/paystack-webhook/index.ts", text: "Payment of verified via webhook", reason: "Server response text describing the recorded state of a real transaction." },
  { file: "supabase/functions/reconcile-escrow/index.ts", text: "reconcile-escrow run complete", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/reconcile-escrow/index.ts", text: "Escrow drift detected ()", reason: "Backend operations/alerting text naming stored escrow records and computed drift." },
  { file: "supabase/functions/seller-confirm-completion/index.ts", text: "Funds are not in escrow (current: )", reason: "Server response text describing the recorded state of a real transaction." },
  { file: "supabase/functions/seller-dashboard/index.ts", text: "Add a verified bank account so SafeDeal can process your releases.", reason: "Server response text describing the recorded state of a real transaction." },
  { file: "supabase/functions/seller-dashboard/index.ts", text: "Add a verified payout account", reason: "Server response text describing the recorded state of a real transaction." },
  { file: "supabase/functions/seller-dashboard/index.ts", text: "Create your first protected deal", reason: "Server response text describing the recorded state of a real transaction." },
  { file: "supabase/functions/seller-dashboard/index.ts", text: "Send a protected transaction link or fulfill an order to complete setup.", reason: "Server response text describing the recorded state of a real transaction." },
  { file: "supabase/functions/seller-transaction-detail/index.ts", text: "Package and ship the item, then update tracking.", reason: "Server response text describing the recorded state of a real transaction." },
  { file: "supabase/functions/submit-contact-message/index.ts", text: "If money is still held in escrow on a transaction, open a dispute from the transaction itself — that freezes the funds while the case is reviewed.", reason: "Server response text describing the recorded state of a real transaction." },
  { file: "supabase/functions/vendor-plan/index.ts", text: "The Verified plan is free — nothing to pay.", reason: "Server response text describing the recorded state of a real transaction." },
  { file: "supabase/functions/verify-paystack-payment/index.ts", text: "Payment of received and held in escrow", reason: "Server response text describing the recorded state of a real transaction." },];

const allowed = new Set(PER_STRING_ALLOWLIST.map((e) => `${e.file}\u0000${e.text}`));

describe("the trust-claim lock", () => {
  it("scans a meaningful number of files", () => {
    expect(SURFACES.length).toBeGreaterThan(150);
    expect(EDGE_SURFACES.length).toBeGreaterThan(30);
  });

  it("declares a condition and a basis for every claim", () => {
    for (const [key, meta] of Object.entries(TRUST_CLAIM_META)) {
      expect(meta.condition, key).toBeTruthy();
      expect(meta.basis.length, key).toBeGreaterThan(10);
    }
    expect(ALL_TRUST_CLAIM_TEXTS.every((t) => t.length > 0)).toBe(true);
  });

  it("never hands out claim text without the evidence its condition names", () => {
    expect(resolveClaim("SELLER_ID_VERIFIED", { identityVerified: false })).toBeNull();
    expect(resolveClaim("SELLER_ID_VERIFIED", { identityVerified: undefined })).toBeNull();
    expect(resolveClaim("SELLER_ID_VERIFIED", { identityVerified: true })).toBeTruthy();
    expect(resolveClaim("SELLER_VERIFIED", { identityVerified: false })).toBeNull();
    expect(resolveClaim("SELLER_PHONE_VERIFIED", { phoneVerified: false })).toBeNull();
    expect(resolveClaim("ESCROW_ACTIVE", { escrowState: "pending" })).toBeNull();
    expect(resolveClaim("ESCROW_ACTIVE", { escrowState: "held" })).toBeTruthy();
    expect(resolveClaim("MONEY_PROTECTED_NOW", { escrowState: "released" })).toBeNull();
    expect(resolveClaim("DELIVERY_TRACKED", { deliveryMethod: "hand_delivery" })).toBeNull();
    expect(resolveClaim("DELIVERY_TRACKED", { deliveryMethod: "courier" })).toBeTruthy();
    expect(alwaysClaim("ESCROW_PROTECTED").length).toBeGreaterThan(0);
  });

  it("nothing outside trust-claims.ts can read a claim's .text", () => {
    const offenders = CLAIM_CONSUMERS.filter((f) =>
      /TRUST_CLAIMS(?:\s*\[[^\]]+\]|\.[A-Z_]+)\s*\.text|\bclaim\s*\.text\b|Claim\s*\)?!?\.text\b/.test(
        fs.readFileSync(f, "utf8"),
      ),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it("justifies every allowlisted string", () => {
    for (const e of PER_STRING_ALLOWLIST) {
      expect(e.reason.length, `${e.file}: ${e.text}`).toBeGreaterThan(20);
      expect(e.text.length, e.file).toBeGreaterThan(0);
      // Code fragments, filenames and truncated strings are extractor noise,
      // not triaged copy — they may never be parked on the allowlist.
      expect(/=>|className|\bconst\b|\) : \(|typeKey|\.csv$|\.tsx?$/.test(e.text), `${e.file}: ${e.text}`).toBe(false);
    }
  });

  it("does not lean on a canned justification", () => {
    const counts = new Map<string, number>();
    for (const e of PER_STRING_ALLOWLIST) {
      if (BULK_APPROVED_REASONS.has(e.reason)) continue;
      counts.set(e.reason, (counts.get(e.reason) ?? 0) + 1);
    }
    const overused = [...counts].filter(([, n]) => n > 15).map(([r, n]) => `${n}x ${r}`);
    expect(overused).toEqual([]);
  });

  for (const text of ALL_TRUST_CLAIM_TEXTS) {
    it(`"${text}" appears as a literal only in trust-claims.ts`, () => {
      const needle = new RegExp(`["'\`>]\\s*${escape(text)}`, "i");
      const offenders = CLAIM_CONSUMERS.filter((f) => needle.test(fs.readFileSync(f, "utf8"))).map(rel);
      expect(offenders).toEqual([]);
    });
  }

  for (const text of RETIRED_CLAIMS) {
    it(`the retired claim "${text}" is gone from the whole app`, () => {
      const needle = new RegExp(`\\b${escape(text)}\\b`, "i");
      const offenders = CLAIM_CONSUMERS.filter((f) => needle.test(fs.readFileSync(f, "utf8"))).map(rel);
      expect(offenders).toEqual([]);
    });
  }

  it("treats handover and unknown methods as untracked, courier as tracked", () => {
    for (const m of ["hand_delivery", "meetup", "pickup", "digital", "delivery", "shipping", "standard_delivery", "unknown", ""]) {
      expect(isTrackedDelivery(m), m).toBe(false);
    }
    expect(isTrackedDelivery("courier")).toBe(true);
    expect(isTrackedDelivery(null)).toBe(false);
  });

  it("blocks every banned scale and superlative form", () => {
    for (const sample of SCALE_SAMPLES) {
      expect(UNSUBSTANTIATED_SCALE.test(sample), sample).toBe(true);
    }
    for (const ok of ["Escrow on every deal", "Held in Escrow", "Verified"]) {
      expect(UNSUBSTANTIATED_SCALE.test(ok), ok).toBe(false);
    }
  });

  it("no surface ships unsubstantiated scale or superlatives", () => {
    const offenders = CLAIM_CONSUMERS.flatMap((file) =>
      userVisibleText(fs.readFileSync(file, "utf8"))
        .filter((text) => UNSUBSTANTIATED_SCALE.test(text))
        .map((text) => `${rel(file)}: ${text}`),
    );
    expect(offenders).toEqual([]);
  });

  it("triages every user-visible trust-vocabulary string with no file-level exemptions", () => {
    const registered = new Set(ALL_TRUST_CLAIM_TEXTS.map((t) => t.toLowerCase()));
    const offenders = CLAIM_CONSUMERS.flatMap((file) =>
      userVisibleText(fs.readFileSync(file, "utf8"))
        .filter((text) => TRUST_VOCABULARY.test(text))
        .filter((text) => !registered.has(text.toLowerCase()))
        .filter((text) => !allowed.has(`${rel(file)}\u0000${text}`))
        .map((text) => `${rel(file)}: ${text}`),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the allowlist free of stale entries", () => {
    const stale = PER_STRING_ALLOWLIST.filter((e) => {
      const full = path.join(PROJECT, e.file);
      if (!fs.existsSync(full)) return true;
      return !userVisibleText(fs.readFileSync(full, "utf8")).includes(e.text);
    }).map((e) => `${e.file}: ${e.text}`);
    expect(stale).toEqual([]);
  });
});

/* ── the response-time promise, on edge functions too ── */

describe("no surface invents its own response time", () => {
  it("no app or edge-function file hardcodes the target or the hours", () => {
    const canonical = path.join(PROJECT, "supabase/functions/_shared/support-copy.ts");
    const offenders = SURFACES.filter((f) => {
      if (f === canonical || f.endsWith("lib/support/support-copy.ts")) return false;
      const src = fs.readFileSync(f, "utf8");
      return new RegExp(`${escape(SUPPORT_RESPONSE_TARGET)}|${escape(SUPPORT_HOURS)}`).test(src);
    }).map(rel);
    expect(offenders).toEqual([]);
  });

  it("no surface states a bare 'within N business day(s)' or 'N business hours'", () => {
    const canonical = path.join(PROJECT, "supabase/functions/_shared/support-copy.ts");
    const offenders = SURFACES.filter((f) => {
      if (f === canonical) return false;
      const src = fs.readFileSync(f, "utf8");
      return /within\s+\d+\s+business\s+day/i.test(src) || /\d+\s*business\s+hours/i.test(src);
    }).map(rel);
    expect(offenders).toEqual([]);
  });
});
