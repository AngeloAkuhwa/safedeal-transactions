

# Phase 4 — Locked terms display + reason-aware completion

## Scope

Two final UI hardening pieces: a shared **locked DeliveryTermsCard** shown on both buyer & seller transaction detail pages, and a **reason-aware completion banner** that explains *why* a transaction completed (buyer confirmed / auto-released / dispute resolved).

## What changes

### 1. New component — `src/components/transactions/DeliveryTermsCard.tsx`

Shared card used by both sides. Displays the immutable agreement terms with a `Lock` icon to convey immutability:
- Delivery method (uses Phase 2 `<DeliveryMethodBadge>`)
- Expected delivery date
- Verification window (e.g. "72 hours after delivery")
- Tracking requirement rule (method-aware copy: "Tracking number required for courier" / "Handoff code required at pickup" / etc.)
- Delivery address (when present)
- Special handoff conditions for pickup/meetup
- Lock badge + "Locked at {agreement_locked_at}" footer

Props: `terms` (delivery_terms object), `lockedAt` (timestamp), optional `compact` variant.

### 2. Edge function — `transaction-detail/index.ts`

Confirm `delivery_terms` block is returned to the buyer (mirror what seller-side already returns: `delivery_method`, `expected_delivery_date`, `verification_window_hours`, `address`). Add it to the response if missing. Also include `agreement_locked_at`.

### 3. Service — `src/services/transaction-detail.service.ts`

Add `delivery_terms` and `agreement_locked_at` to the `TransactionDetailResponse` interface.

### 4. Page edits — add `<DeliveryTermsCard>` to:
- `src/pages/BuyerTransactionDetail.tsx` (right column / sidebar)
- `src/pages/SellerTransactionDetail.tsx` (right column / sidebar)
- Optionally `src/pages/BuyerTransactionTracking.tsx` (compact variant)

### 5. Reason-aware completion banner — rewrite `src/components/seller/TransactionSuccess.tsx`

Currently a generic success message. Rewrite to be reason-aware by inspecting `transaction_status_history` (already available via the detail endpoints — verify; if not, extend `transaction-detail` and `seller-transaction-detail` to return the last status-history row that transitioned to `completed`).

Three variants based on the transition source:
- **Buyer-confirmed**: "Buyer confirmed receipt on {date} — funds released to seller"
- **Auto-released** (timed_out → completed via system actor): "Verification window ended on {date} without dispute — funds auto-released to seller"
- **Dispute-resolved** (resolved → completed): "Dispute resolved in seller's favor on {date} — funds released to seller"

Each variant shows: completion timestamp, fund-release timestamp (from `escrow_states` / `money_status_history`), and a link to the receipt. Different icon/color per variant (CheckCircle green / Clock amber / Scale blue).

Reuse on buyer side too — rename to a neutral `TransactionCompletionBanner.tsx` (keep `TransactionSuccess.tsx` as a thin re-export to avoid breaking imports) and surface it on `BuyerTransactionDetail.tsx` when status is `completed`.

## Files touched

**Edge functions (edited):**
- `supabase/functions/transaction-detail/index.ts` — add `delivery_terms` block + completion-reason fields.
- `supabase/functions/seller-transaction-detail/index.ts` — add completion-reason fields (delivery_terms already returned).

**Frontend (new):**
- `src/components/transactions/DeliveryTermsCard.tsx`
- `src/components/transactions/TransactionCompletionBanner.tsx`

**Frontend (edited):**
- `src/services/transaction-detail.service.ts` — extend response interface.
- `src/services/seller-transaction-detail.service.ts` — extend response interface.
- `src/pages/BuyerTransactionDetail.tsx` — render terms card + completion banner.
- `src/pages/SellerTransactionDetail.tsx` — render terms card + completion banner.
- `src/pages/BuyerTransactionTracking.tsx` — compact terms card (optional).
- `src/components/seller/TransactionSuccess.tsx` — convert to thin re-export of the new shared banner.

## Out of scope (future)

- Real cross-check of pickup/meetup handoff code against `delivery_tokens` table (Phase 5).
- Real-time courier API integrations (DHL/GIG webhooks).
- SMS/WhatsApp delivery notifications.

