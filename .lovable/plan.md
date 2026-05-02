## Phase L — Final Production Closure (the honest pass)

The previous "100% complete" claim was premature. A fresh end-to-end grep across the codebase surfaces three categories of real, user-visible gaps. Backend (state machine, atomic RPCs, delivery gating, audit writes, dashboard math) is in good shape — the remaining work is **on the frontend** and is tightly scoped.

### What's actually wrong (verified, not assumed)

**1. Money formatting drift on high-traffic buyer/seller pages.**
These files still call `Number(x).toLocaleString()` (no `minimumFractionDigits: 2`) — so amounts like `12345.67` render as `12,346` and amounts ending in `.00` render with no decimals at all, contradicting the "exact 2 decimal places" rule:

- `src/pages/BuyerPaymentSummary.tsx` — item, fee, total, escrow lines (10+ sites) — **the page the buyer sees right before paying.**
- `src/pages/BuyerTransactionReview.tsx` — pay button, hero, receipt rows.
- `src/pages/BuyerCart.tsx`, `src/pages/CartCheckoutReview.tsx`, `src/pages/StorefrontCheckout.tsx`, `src/pages/BuyerSavedProducts.tsx`, `src/pages/BuyerPrivateOffers.tsx`, `src/pages/OfferClaimLanding.tsx` — local `formatCurrency` helpers shadow `@/lib/format`.
- `src/pages/SellerPrivateOffers.tsx`, `src/pages/SellerPayouts.tsx` (subtitle "₦… in last 30 days"), `src/pages/SellerOfferDetail.tsx` — seller side.
- `src/pages/BuyerMarketplace.tsx` — price-range chip.

**2. Inline status maps that bypass the registry.** These cause the same DB status to read differently in different places:

- `src/pages/SellerTransactions.tsx` — `statusLabels` map (12 statuses) duplicated; should resolve via `resolveTransactionLabel(_, "seller")`.
- `src/components/seller/SellerRecentActivity.tsx` — `actionLabels` is fine (CTA copy, not status), but verify after S1 below.
- `src/components/seller-disputes/SellerPayoutImpactCard.tsx` — escrow + payout state maps. Add to `status-labels.ts` registry as `ESCROW_LABELS` / `PAYOUT_LABELS`.
- `src/components/seller-disputes/SellerDisputeTable.tsx` — `moneyImpactConfig` is a money-status proxy; replace with `resolveMoneyLabel(_, "seller")`.
- `src/components/disputes/DisputeStatusBadge.tsx`, `DisputeMoneyStatusBadge.tsx`, `DisputeResolutionSection.tsx` — already partially registry-wired; finish removing the leftover inline maps.
- `src/components/storefront/{ProductStatusBadge,ProductVisibilityBadge,SellerProductCard,UpdateStockModal}.tsx`, `src/pages/SellerProductPreview.tsx` — these are **product** statuses, not transaction/money. Add `PRODUCT_STATUS_LABELS` and `PRODUCT_VISIBILITY_LABELS` to the registry so all surfaces agree.

**3. Three remaining "admin" strings on user-facing surfaces.** These leak internal language to buyers:

- `src/pages/BuyerPaymentSummary.tsx:407` — "Admin reviews disputes before final decision".
- `src/pages/BuyerPaymentSummary.tsx:729` — "Admin reviews all disputes before fund release".
- `src/components/landing/StatusBadgesSection.tsx:8` — "Under admin review" in a public landing badge.
- `src/pages/BuyerPaymentSummary.tsx:721` — "until a dispute is resolved by SafeDeal administration" (acceptable, but tighten to "SafeDeal review").

### What is already correct (and stays as-is)

- Transaction / money / dispute state machines, atomic RPCs (`release_payout_atomic`, `freeze_funds_atomic`, `complete_payout_atomic`, `start_refund_atomic`, `timeout_transaction_atomic`, `flag_for_release_review`, `retry_payout_atomic`, etc.) — verified.
- Delivery gating in `update-delivery-status`: courier requires `tracking_number`, meetup requires `scheduled_handoff_at` + 6-digit handoff code cross-check, delivered requires evidence files. All paths return 400 with explicit copy.
- Seller dashboard math in `supabase/functions/seller-dashboard/index.ts` derives every KPI by filtering the same `transactions` rows the table renders, so dashboard ↔ table are inherently aligned.
- Audit writes: every state-changing edge function writes to `status_history`, `money_status_history`, `transaction_events`, or `admin_actions` (verified across 15 functions).
- Status-label registry already covers transaction, money, and dispute states for both audiences with the seller-confirmation disambiguation for `funds_pending_release`.
- `formatMoney` in `src/lib/format.ts` and `supabase/functions/_shared/format.ts` already enforces `minimumFractionDigits: 2, maximumFractionDigits: 2`.

### Plan of work

**L1 — Money formatting sweep (highest impact).**
Replace every `Number(x).toLocaleString()` and every local `formatCurrency` helper across the 12 files listed above with `formatMoney(x, currency)` from `@/lib/format`. Delete the shadow helpers entirely. Keep the date-related `toLocaleString()` calls (Admin pages) untouched — those are timestamps, not money. The `BuyerMarketplace` price-range chip becomes `formatMoney(min, "NGN")` style.

**L2 — Extend the status-label registry.**
Add to `src/lib/status-labels.ts`:
- `PRODUCT_STATUS_LABELS` (draft, published, out_of_stock, archived, deactivated) with seller-only audience.
- `PRODUCT_VISIBILITY_LABELS` (public, private, unlisted).
- `ESCROW_STATE_LABELS` (held, frozen, released_to_seller, refunded_to_buyer).
- `PAYOUT_STATUS_LABELS` (awaiting_release, blocked, pending, processing, completed, failed, cancelled, reversed).
Each with its `resolve…Label` helper following the existing pattern.

**L3 — Wire the registry into remaining components.**
Refactor the 9 files in section 2 above to import from the registry. Delete the inline maps. For `SellerTransactions.tsx`, pass `audience="seller"` to `<TransactionStatusBadge>` (already supports it); for the inline `statusLabels` use, swap to `resolveTransactionLabel(status, "seller")`.

**L4 — Scrub the 3 "admin" strings.**
- `BuyerPaymentSummary.tsx:407` → "SafeDeal reviews disputes before final decision".
- `BuyerPaymentSummary.tsx:729` → "SafeDeal reviews all disputes before fund release".
- `StatusBadgesSection.tsx:8` → caption "Under SafeDeal review".
- `BuyerPaymentSummary.tsx:721` → "resolved by SafeDeal review".

**L5 — Smoke-verify after edits.**
- Type-check passes (harness runs build automatically).
- Re-run the same audit greps from this exploration; expect zero hits for `toLocaleString()` on money fields, zero hits for "admin review/release" in user surfaces, zero new inline status maps outside `src/lib/status-labels.ts`.

### Out of scope (intentionally not touching)

- No DB migrations. State machine, RLS, triggers, and atomic RPCs are correct.
- No edge function logic changes. Delivery gating, dashboard math, audit writes, and concurrency caps are correct.
- No layout/density rework — Phase G/H/I already covered that and the viewport sweep at 1246px was clean.
- Admin pages keep their internal labels (those screens are admin-only).

### Risk

Low. All changes are localized text/formatter swaps in leaf components and pages. No type-shape changes, no new props beyond extending an existing registry. The build will catch any missed import.

### Acceptance

After L1–L4:
- Every monetary value on every buyer and seller page renders with exactly two decimal places (₦12,345.67 / NGN 0.50).
- `rg "Record<string, \{ label" src/` returns only `src/lib/status-labels.ts`.
- `rg -i "admin (review|release)" src/` returns zero matches outside `src/pages/Admin*` and `supabase/functions/admin-*`.
- The buyer's "Pay ₦…" CTA, the receipt rows, the cart subtotal, and the seller's payout summary all agree to the cent with the underlying `pricing` / `payouts` rows.