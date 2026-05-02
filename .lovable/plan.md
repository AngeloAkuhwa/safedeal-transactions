# Phase J — Production Readiness: Presentation Correctness

End-to-end backend was verified clean (state machine, RLS, atomic RPCs, edge gating, dispute pipeline, payout queue, cron escalations, dashboard math). Remaining gaps are purely presentational: inconsistent money formatting, drifting status labels, leaked internal vocabulary, and missing buyer KPI deep-links.

This plan is **formatting + copy + a few component prop additions only**. No SQL, no RLS, no RPC, no new tables, no state-machine changes.

---

## J1. Central money formatter — `src/lib/format.ts`

Create three helpers used everywhere money is shown:

- `formatMoney(amount, currency = "NGN")` → always 2 dp. NGN uses `Intl.NumberFormat("en-NG", { style:"currency", currency:"NGN", minimumFractionDigits:2, maximumFractionDigits:2 })` → `"₦1,234.50"`. Non-NGN uses `style:"decimal"` + currency-code prefix → `"USD 12.00"` (avoids Intl substituting `"$"` in en-NG locale).
- `formatMoneyCompact(amount, currency)` → 2 dp under 1,000,000; `1.2M` style above with the exact value passed back as a `title` attribute (call sites add the tooltip).
- `formatMoneyDelta(amount, currency)` → prefixes `+` / `−`, used in payout & refund rows.

Mirror the same helpers in `supabase/functions/_shared/format.ts` so CSV exports match on-screen totals.

Add a local ESLint guardrail (no new dep — `no-restricted-syntax` rule in `.eslintrc`) flagging any `Intl.NumberFormat` call with `minimumFractionDigits: 0` outside `src/lib/format.ts`. Header comment in `format.ts` explains why.

## J2. Replace every per-file formatter

Swap the local `formatCurrency` (or inline `Intl.NumberFormat`) for `formatMoney` in:

- Pages: `SellerTransactions`, `SellerPayouts`, `SellerTransactionDetail`, `SellerUpdateDelivery`, `SellerDisputeDetail`, `SellerProductPreview`, `SellerCreateTransaction`, `SellerAnalytics`, `BuyerTransactionDetail`, `BuyerTransactionTracking`, `BuyerTransactionVerify`.
- Components: `transactions/TransactionTable`, `transactions/TransactionReceipt`, `seller/SellerMetricsCards`, `seller/SellerRecentActivity`, `seller/ExportPayoutsDialog`, `seller/ExportPreviewDialog`, `seller/TransactionSuccess`, `seller-disputes/SellerDisputeBlockedPanel`, `seller-disputes/SellerDisputeSummaryCards`, `seller-disputes/SellerDisputeTable`, `seller-disputes/SellerPayoutImpactCard`, `disputes/BuyerDisputeList`, `disputes/PossibleOutcomesPanel`, `disputes/DisputeCaseSummary`, `disputes/DisputeResolutionSection`, `marketplace/MarketplaceProductCard`, `dashboard/RecentPurchases`, `verification/VerificationActions`.

After this pass, every monetary value across seller, buyer, transaction-detail, payout, dashboard, analytics, receipt, and dispute screens renders with the same 2-dp output. The "rounded to nearest thousand" defects in BuyerDisputeList, PossibleOutcomesPanel, DisputeCaseSummary, DisputeResolutionSection, MarketplaceProductCard, SellerPayoutImpactCard, SellerDisputeDetail and SellerProductPreview disappear.

## J3. Unified status-label registry — `src/lib/status-labels.ts`

Single source of truth keyed by `audience: "seller" | "buyer"`:

```text
TRANSACTION_LABELS[audience][tx_status]   -> { label, tone }
MONEY_LABELS[audience][money_status]      -> { label, tone }
DISPUTE_LABELS[audience][dispute_status]  -> { label, tone }
```

Mapping (per spec):

Transaction status
- draft → Draft / —
- awaiting_buyer → Awaiting Buyer / Review Agreement
- awaiting_payment → Awaiting Payment / Awaiting Payment
- payment_secured → Payment Secured / Payment Secured
- seller_preparing_delivery → Preparing Delivery / Seller Preparing Delivery
- seller_dispatched → Dispatched / Dispatched
- delivered_awaiting_verification → Delivered / Confirm Item Received
- disputed → Disputed / Disputed
- completed → Completed / Completed
- cancelled → Cancelled / Cancelled
- timed_out → Timed Out / Timed Out
- refunded → Refunded / Refunded

Money status
- not_secured → Not Secured / Not Paid Yet
- payment_pending → Payment Pending / Payment Pending
- funds_held_in_escrow → Funds Held / Payment Secured
- funds_pending_release → Awaiting Release / context-aware (Awaiting Seller Confirmation when seller hasn't confirmed; Awaiting Release when both confirmed)
- funds_releasing → Payment Processing / Payment Processing
- funds_released → Released To You / Released To Seller
- funds_frozen → Funds Frozen / Funds Frozen
- refund_pending → Refund Pending / Refund Pending
- refund_issued → Refunded / Refunded

This fixes the two reversed labels currently in `MoneyStatusBadge.tsx` (`funds_pending_release` ↔ `funds_releasing`) and the buyer-incorrect "Released to You" string.

Refactor:

- `MoneyStatusBadge.tsx`, `TransactionStatusBadge.tsx`, and a new `DisputeStatusBadge` (if absent) accept `audience?: "seller" | "buyer"` (default `"seller"` to keep legacy call sites stable while migrating). Internally read from the registry — no inline maps.
- For `funds_pending_release` on the buyer side, the badge accepts an optional `sellerConfirmed?: boolean` prop. Pages already have this signal (`seller_confirmed_at`); pass it through.
- Delete the duplicated inline status maps in `BuyerTransactionDetail`, `BuyerTransactionTracking`, `SellerTransactionDetail`, `SellerRecentActivity`, `SellerMetricsCards`.
- Update every buyer-side `<MoneyStatusBadge>` / `<TransactionStatusBadge>` to pass `audience="buyer"`. Seller surfaces stay default.

## J4. Scrub internal vocabulary from user-facing copy

- Add `INTERNAL_REASON_COPY` map in `status-labels.ts` for `release_review_reason` and `release_review_queue.queue_type` values (`pricing_missing`, `payout_account_missing`, `silent_dispute`, `transfer_reversed`, `manual_hold`, `delivery_proof_missing`, `failed_payout`, `refund_request`, `suspicious_activity`, `stuck`).
- `SellerAlertBanners.tsx` routes alerts through this map.
- `SellerDisputeDetail` and `SellerPayoutImpactCard` replace "admin release" / "admin review" with "SafeDeal review" and "Awaiting Release".
- Buyer copy verified clean — no "admin" string reaches buyer surfaces.

## J5. Dashboard ↔ table reconciliation

Backend math verified — `seller-dashboard` and the seller transaction list query share the same source of truth. No backend change.

Presentation:
- `SellerMetricsCards` "Net Earned" tile gets a small two-line breakdown under the value: `Released ₦X` + `Pending bank transfer ₦Y`, plus the same content in the tooltip.
- Buyer KPI tiles in `Dashboard.tsx` (`active_purchases`, `awaiting_delivery`, `awaiting_verification`, `open_disputes`) become `<Link>`s that navigate to `/buyer/transactions?status=…` or `/buyer/disputes?status=open`. `BuyerTransactions` and `BuyerDisputes` already accept those query params for filtering — verify and wire.

## J6. Notification copy parity

Edge-function copy edits only (no logic change):
- `update-delivery-status` — buyer-facing notification strings rewritten to use the J3 buyer labels (e.g., "Your seller marked the order as Dispatched", "Your seller confirmed delivery — please review and confirm receipt").
- `seller-confirm-completion` — keep current buyer message ("Both parties have confirmed this deal. SafeDeal will process the release."), align seller copy.
- `release-payout` — seller message uses "Released To You"; buyer message uses "Released To Seller".
- `paystack-webhook` — money-state transition notifications use the same registry strings.

## J7. Receipt + timeline 2-dp pass

`TransactionReceipt.tsx` already shows 2 dp but builds rows independently. Switch to `formatMoney` and verify all 8 rows (item, gross buyer, service fee, processing fee, total paid, seller net, refund, payout) match the `transaction_pricing` row exactly. Formatting only.

## J8. UI regression sweep at 1246×890

After J1–J7 land, sweep:
- Bumped string widths from 0-dp → 2-dp may overflow KPI cards. Adjust `min-w` on the four `SellerMetricsCards` items (Funds Held, Awaiting Release, Net Earned, Net Pending) and the three dispute summary cards.
- Confirm status chips don't wrap mid-word; if they do, the registry's longer buyer labels ("Confirm Item Received", "Awaiting Seller Confirmation") need `whitespace-nowrap` or are abbreviated to "Confirm Receipt" / "Awaiting Confirmation" with a `title` attribute carrying the long form.

---

## Acceptance

1. Every monetary value on every seller and buyer surface renders via `formatMoney` → exact 2 dp, no rounding to thousands, no zero-decimal display.
2. Buyer pages never display "Released to You", "admin release", or "admin review".
3. `MoneyStatusBadge` and `TransactionStatusBadge` use the new `audience` prop everywhere; no inline status-label maps remain in any page.
4. `funds_releasing` reads "Payment Processing" on both audiences; `funds_pending_release` reads "Awaiting Release" (seller) / context-aware (buyer).
5. Seller "Net Earned" tile shows the explicit `Released ₦X + Pending bank transfer ₦Y` breakdown.
6. Buyer KPI tiles deep-link to the correct filtered list (parity with seller).
7. CSV exports show 2-dp values that match the on-screen totals.
8. Type-check clean, no new lint warnings, no regressions at 1246×890.

## Files touched

- **New**: `src/lib/format.ts`, `src/lib/status-labels.ts`, `supabase/functions/_shared/format.ts`
- **Refactored** (formatter + label registry): the ~30 components/pages listed in J2
- **Edge functions** (copy only): `update-delivery-status`, `seller-confirm-completion`, `release-payout`, `paystack-webhook`, `seller-payouts` (CSV), `seller-analytics` (CSV)
- **No SQL. No RLS. No new tables. No RPC changes.**
