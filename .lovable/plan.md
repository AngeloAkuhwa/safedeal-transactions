
# Phase 4 — UI Sweep (Pricing Breakdown + Payout-Account State)

Goal: every money-displaying screen renders the canonical 5-line breakdown (`Item Total`, `SafeDeal Fee`, `Payment Processing Fee`, `Total Service Fee`, `Total Charged`) plus `Seller Payout`, reading from the new `transaction_pricing` columns that Phase 3 now writes. Every payout-account UI reads the canonical `account_state` from `v_payout_account_state` instead of recomputing readiness from raw fields. No DB changes, no edge-function changes, no math.

---

## Quick answer — `payout_accounts` vs `v_payout_account_state`

- **`payout_accounts`** (table) is the raw storage row: `bank_code`, `account_number`, `account_name`, `verification_status` (`unverified` / `verified` / `failed`), `provider_recipient_code`, audit columns. It holds *what the seller typed and what Paystack verified*. Multiple rows per seller are possible (historical / re-entered accounts).
- **`v_payout_account_state`** (view, added in migration 018) is a derived, **per-seller** projection that picks the seller's current best row and collapses it into one canonical 4-state label:
  - `no_account` — seller has no `payout_accounts` row.
  - `unverified` — row exists, `verification_status != 'verified'`.
  - `verified_no_recipient` — verified, but no Paystack `provider_recipient_code` yet → cannot transfer.
  - `verified_ready` — verified **and** has a recipient code → eligible for payout.
  - View has `security_invoker = on`, so it inherits the caller's RLS; rows are ranked by priority so each seller appears at most once.

Practical rule: **writes go to `payout_accounts`; every readiness check and UI badge reads `v_payout_account_state.account_state`.** That removes the 3 places in code that each invented their own "is this seller ready" check.

---

## 1. Shared UI primitives (new, small, design-token only)

| File | Purpose |
|---|---|
| `src/components/payment/PricingBreakdown.tsx` (new) | Renders the 5-line buyer breakdown from a `PricingSnapshot`. Uses `PRICING_LINE_LABELS`, `PRICING_HELPER_COPY`, `BUYER_PRICING_ORDER` from `src/lib/payment/payment-labels.ts`. Shows `—` for any missing line (never fake ₦0.00). When `is_total_service_fee_capped === true`, appends a single small note: "Total service fee capped at ₦2,500." Tooltip/popover on each line uses the helper copy already defined. |
| `src/components/payment/SellerPayoutLine.tsx` (new) | Single-line "Seller Payout: ₦X" component using the same snapshot, with the seller-side helper copy. |
| `src/components/payout/PayoutAccountStateBadge.tsx` (new) | One badge that maps `account_state` → label + tone (`verified_ready` = success, `verified_no_recipient` = warning, `unverified` = warning, `no_account` = muted). Used by every payout surface so the same seller looks identical everywhere. |
| `src/lib/payment/money-format.ts` (existing) | No change; both new components format through it so the `₦` symbol, thousands separators, and `—` fallback stay consistent. |

All three are presentational only: no fetching, no Supabase imports.

---

## 2. Buyer-facing screens — swap raw fields for `PricingBreakdown`

| File | Today | After |
|---|---|---|
| `src/pages/StorefrontCheckout.tsx` | Hand-rolled line items, sometimes shows "Processing Fee" | `<PricingBreakdown snapshot={...} audience="buyer" />` from the storefront-checkout snapshot. |
| `src/pages/CartCheckoutReview.tsx` | Per-item lines + a summary | Per-item lines untouched; the bottom summary becomes `<PricingBreakdown>` reading the aggregated cart snapshot returned by `cart-checkout`. |
| `src/pages/BuyerCart.tsx` | Estimated totals | Use the same component with `is_estimate` flag → suppresses the cap note, shows "Final fees confirmed at checkout." |
| `src/pages/BuyerTransactionVerify.tsx`, `BuyerTransactionDetail.tsx`, `BuyerTransactionReview.tsx`, `BuyerTransactionTracking.tsx` | Mixed labels | All read pricing via `payment-flow.service.ts → getPricingSnapshot(transactionId)` and render `<PricingBreakdown>`. |
| `src/components/transactions/TransactionReceipt.tsx` | Receipt PDF/email view | Same component; this is the canonical receipt layout. |
| `src/components/disputes/AgreementSnapshotSection.tsx`, `BuyerDisputeList.tsx`, `DisputeCaseSummary.tsx` | Renders the locked snapshot | Use `<PricingBreakdown snapshot={agreement_snapshot.pricing}>` directly — locked rows display whatever was stamped at the time (legacy rows naturally hide the missing lines as `—`). |

Forbidden labels (`Delivery Fee`, `Shipping Fee`, `Platform Processing Fee`, `Protection & Processing Fee`, `USD`, `$`) are already declared in `FORBIDDEN_PRICING_LABELS`. Add a one-time vitest snapshot test that asserts none of them appear in the rendered HTML of the components in §1.

---

## 3. Seller-facing screens — payout-first view

| File | Change |
|---|---|
| `src/pages/SellerCreateTransaction.tsx` | The "What you'll receive" preview uses `<SellerPayoutLine>`; the buyer-side breakdown moves behind a "Show buyer breakdown" disclosure that uses `<PricingBreakdown audience="seller-preview">`. |
| `src/pages/SellerTransactionShare.tsx`, `SellerTransactionDetail.tsx`, `SellerUpdateDelivery.tsx` | Replace raw `seller_net_amount` reads with `seller_payout_amount` from the snapshot via the service layer. Render with `<SellerPayoutLine>`. |
| `src/components/seller/TransactionSuccess.tsx` | Same. |
| `src/components/seller/SellerConfirmCompletionCard.tsx` | "You will receive ₦X" line reads `seller_payout_amount` (fallback `seller_net_amount`). |
| `src/pages/SellerPayouts.tsx` | Table column "Amount" reads `seller_payout_amount` first. Top-of-page "Payout account" widget swaps the three inline checks for `<PayoutAccountStateBadge state={account_state} />` and a single explainer sentence keyed off `account_state`. Auto-release countdown unchanged. |
| `src/components/seller/EditPayoutDetailsModal.tsx`, `ExportPayoutsDialog.tsx` | The status pill at the top becomes `<PayoutAccountStateBadge>`. The export CSV column header changes from "Net Amount" to "Seller Payout" (the underlying field already reads `seller_payout_amount` after Phase 3). |
| `src/pages/SellerAnalytics.tsx`, `SellerMetricsCards.tsx` | "Total earnings" and "Pending payouts" read the new column with the fallback. No formula change. |
| `src/pages/SellerDisputeDetail.tsx`, `src/components/seller-disputes/SellerDisputeTable.tsx` | Display reads through `<PricingBreakdown>` for the agreement snapshot section. |

---

## 4. Admin-facing screens

| File | Change |
|---|---|
| `src/pages/AdminPayouts.tsx` | List "Amount" column → `seller_payout_amount`. "Account" column → `<PayoutAccountStateBadge>`. The detail drawer keeps its current per-check breakdown (verification, recipient code, etc.) **and** shows the badge at the top so the drawer and the list always agree for the same seller. |
| `src/pages/AdminTransactions.tsx`, `AdminTransactionDetail.tsx` | Render the locked snapshot through `<PricingBreakdown audience="admin">` — audience adds an internal-reason tooltip via `describeInternalReason`. |
| `src/pages/AdminDisputeDetail.tsx` | Same. |

No new admin actions; the existing super-admin pricing-override path (`admin_correct_pricing` RPC from Phase 2) keeps its current entry point untouched in this phase.

---

## 5. Service-layer + types tidy-up

| File | Change |
|---|---|
| `src/services/payment-flow.service.ts` | Already returns the new fields after Phase 3. Add one helper `toBuyerBreakdown(snapshot)` that returns the array `<PricingBreakdown>` consumes, so each page doesn't re-derive it. |
| `src/types/payment-flow.types.ts` | Export a `PayoutAccountState = 'no_account' \| 'unverified' \| 'verified_no_recipient' \| 'verified_ready'` union and a `PricingSnapshotView` shape for the breakdown component. |
| `src/services/admin-payouts.service.ts` | Already carries `account_state` after Phase 3 — just re-export the union type from above so the page and the table share it. |
| `src/services/seller-transaction-detail.service.ts`, `seller-disputes.service.ts`, `seller-dispute-detail.service.ts`, `disputes.service.ts`, `verification.service.ts` | Update return types to include `payment_processing_fee_amount` / `seller_payout_amount`; passthrough only. |

No new fetch logic. No new endpoints.

---

## 6. Removals & deprecations (UI only, safe)

After the components in §1 are wired everywhere:
- Remove ad-hoc inline labels like `Processing Fee`, `Net Amount`, `Platform Fee` across the files listed in §2–§4.
- Delete any local helpers that recomputed `buyer_total - seller_net` for display — they're replaced by direct snapshot reads.
- **Do not** remove the legacy snapshot columns (`processing_fee_amount`, `seller_net_amount`) — they're still the fallback for locked legacy rows and remain the source of truth in immutable `agreement_snapshot` JSON.

---

## 7. Verification

A. **Visual**
1. Buyer checkout (storefront + cart) shows the 5 canonical lines and the cap note when applicable.
2. Buyer dashboard, receipt, dispute case summary all render the same 5 lines, byte-for-byte identical labels.
3. Seller pages show "Seller Payout" only (no buyer-facing fees) unless the disclosure is opened.
4. `SellerPayouts` and `AdminPayouts` show the same `PayoutAccountStateBadge` for the same seller.

B. **Regression**
- `rg "Delivery Fee|Shipping Fee|Platform Processing Fee|Protection & Processing Fee"` returns no hits under `src/`.
- `rg "seller_net_amount|processing_fee_amount"` under `src/` returns only fallback reads (`?? seller_net_amount`, `?? processing_fee_amount`).
- A locked legacy transaction (no `seller_payout_amount`) still renders its receipt with no `—` placeholders for the lines that were stamped at the time.
- A capped transaction (`is_total_service_fee_capped = true`) shows the cap note exactly once per breakdown.
- Sellers with `account_state = 'verified_no_recipient'` see a warning badge + a "Finish payout setup" link on `SellerPayouts`, and admin sees the same badge on `AdminPayouts`.

C. **Tests**
- Vitest snapshot for `PricingBreakdown` with each `PricingSnapshotView` variant (full / partial / capped / legacy fallback).
- Vitest unit for `PayoutAccountStateBadge` covering all four states.
- One Playwright/route test that loads `BuyerTransactionDetail` for a seeded legacy row and asserts the breakdown renders without throwing.

---

## 8. Out of scope (kept for later phases)

- No new DB columns, RPCs, or views.
- No edge-function changes.
- No money formulas; no refund/payout policy changes.
- No dropping of the legacy `processing_fee_amount` / `seller_net_amount` columns.
- No notification or email-template rewrites — they'll inherit the new labels via the shared registry without per-template edits, but a deliberate sweep is deferred to Phase 5.
- No mobile-app sweep — web only.

## Rollback

Pure presentational change. Reverting the touched files restores the prior labels. The new shared components can be left in place because they're side-effect-free.
