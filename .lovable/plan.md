# Phase M — True 100% Production Closure

Honest status: **not yet 100%**. Phases K and L closed the high-traffic transaction pages, but a final grep revealed remaining drift on agreement, verification, storefront, dispute, and seller-create surfaces that buyers and sellers actually see. This phase closes them with no new features and no schema changes.

## What's still wrong

### M1 — Money formatting drift (still using `toLocaleString` without 2-decimal contract)

User-facing files that bypass `formatMoney`:

- `src/components/agreement/LockedSnapshotCard.tsx` — buyer sees the locked agreement here; line items, item amount, service fee, total all rendered as `toLocaleString()` (no decimals).
- `src/components/agreement/AgreementTrustIndicators.tsx` — total amount on trust banner.
- `src/components/verification/VerificationSidebar.tsx` — buyer total during verification step.
- `src/components/storefront/ProductCard.tsx`, `SellerProductCard.tsx`, `UpdateStockModal.tsx`, `ManageVisibilityModal.tsx`, `PublishSuccessModal.tsx`, `PurchaseAuthModal.tsx` — public storefront prices.
- `src/pages/PublicProductDetail.tsx` — public product page price.
- `src/pages/SellerCreateTransaction.tsx` (lines 696, 700, 705) — seller pricing preview still mixes `toLocaleString` with manual `minimumFractionDigits`.
- `src/components/seller/ExportPreviewDialog.tsx` (line 129) and `src/components/seller/ExportPayoutsDialog.tsx` — local `formatCurrency` helpers instead of shared `formatMoney`.
- `src/components/seller/TransactionSuccess.tsx` — local fmt helper.
- `src/components/profile/SellerVerificationSection.tsx`, `AccountVerificationSection.tsx` — verification limit amounts.
- `src/components/disputes/AgreementSnapshotSection.tsx` — snapshot amounts in dispute view.

Fix: replace each with `formatMoney(amount, currency)` from `@/lib/format`. Remove the local `formatCurrency` helpers in storefront/seller dialogs.

Out of scope (correctly excluded): `src/pages/AdminOffers.tsx`, `AdminOfferDetail.tsx`, `components/landing/demo-data.ts`, `components/ui/chart.tsx`, `SellerConfirmCompletionCard.tsx` (date formatting, not money).

### M2 — Admin language leaking into buyer/seller copy

- `src/pages/BuyerPaymentSummary.tsx` line 511: "resolved by SafeDeal administration" → change to "resolved by SafeDeal review".
- `src/components/verification/VerificationActions.tsx` line 98: "an admin will review the case" → "the SafeDeal review team will review the case".

### M3 — Inline status maps still in place

- `src/components/disputes/DisputeStatusBadge.tsx` and `DisputeMoneyStatusBadge.tsx` — replace local `statusConfig` / `moneyConfig` with `resolveDisputeLabel` / `resolveDisputeMoneyLabel` from `src/lib/status-labels.ts`. If the registry doesn't yet have dispute entries, add `DISPUTE_STATUS_LABELS` and `DISPUTE_MONEY_STATUS_LABELS` and a resolver alongside the existing transaction/money/product/payout entries.
- `src/components/disputes/DisputeTimeline.tsx` — swap local `STATUS_LABELS` for the centralized transaction-label resolver (it's just rendering transaction statuses).
- `src/components/storefront/ProductStatusBadge.tsx`, `SellerProductCard.tsx`, `UpdateStockModal.tsx` — replace inline maps with `PRODUCT_STATUS_LABELS` already added in Phase L.
- `src/pages/BuyerVerification.tsx` — local `statusConfig` for verification submission status; introduce `VERIFICATION_STATUS_LABELS` in the registry and use it.

### M4 — Verification

After edits:

1. `rg -n "toLocaleString\(" src/pages src/components` should return only: admin pages, `landing/demo-data.ts`, `ui/chart.tsx`, and date-formatting calls (`Date(...).toLocaleString`).
2. `rg -n "admin" src/pages src/components -i` filtered for non-admin paths should return zero user-facing strings containing the word "admin".
3. `rg -n "statusConfig|moneyConfig" src/pages src/components` should return zero hits outside `src/lib/status-labels.ts`.

## Files touched (estimate)

Edits only, ~18 files:

- Registry: `src/lib/status-labels.ts` (add dispute + verification label maps and resolvers).
- Agreement: `LockedSnapshotCard.tsx`, `AgreementTrustIndicators.tsx`.
- Verification: `VerificationSidebar.tsx`, `VerificationActions.tsx`, `BuyerVerification.tsx`, `SellerVerificationSection.tsx`, `AccountVerificationSection.tsx`.
- Storefront: `ProductCard.tsx`, `SellerProductCard.tsx`, `UpdateStockModal.tsx`, `ManageVisibilityModal.tsx`, `PublishSuccessModal.tsx`, `PurchaseAuthModal.tsx`, `ProductStatusBadge.tsx`, `PublicProductDetail.tsx`.
- Seller: `SellerCreateTransaction.tsx`, `ExportPreviewDialog.tsx`, `ExportPayoutsDialog.tsx`, `TransactionSuccess.tsx`.
- Disputes: `DisputeStatusBadge.tsx`, `DisputeMoneyStatusBadge.tsx`, `DisputeTimeline.tsx`, `AgreementSnapshotSection.tsx`.
- Buyer: `BuyerPaymentSummary.tsx` (single string).

No SQL migrations. No RLS changes. No new tables. No edge function changes.

## Definition of done

- All three grep checks in M4 return clean.
- Buyer sees `₦12,345.00` formatting on the locked agreement, verification sidebar, dispute snapshots, and storefront — never `₦12,345`.
- Buyer never sees the word "admin" or "administration"; seller never sees "admin release".
- Every dispute, product, and verification status badge resolves through the central registry, matching the Phase K/L pattern already used for transaction and money badges.

After this phase, SafeDeal is genuinely production-ready end-to-end across seller and buyer surfaces.
