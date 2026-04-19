

# Where to peg the rider confirmation link in the seller section

## What we already have
- **Public rider page**: `/delivery/confirm/:token` (`DeliveryConfirm.tsx`) — matches your mockup design intent (token verify → buyer OTP → confirm).
- **Token is generated** at dispatch in `update-delivery-status` and returned as `rider_confirmation_url`.
- **Today** the link only appears once, in `RiderConfirmationDialog` immediately after the seller hits "Mark as Dispatched", then it's gone. The seller cannot retrieve it later — bad if they hand off to a different rider, lose the chat, or dispatch from desktop but need it on mobile.

## The fix — surface the link in 3 persistent places

### 1. Seller Transaction Detail page — primary home
**Route:** `/seller/transactions/:transactionId`
**File:** `src/pages/SellerTransactionDetail.tsx`

Add a new **"Rider Confirmation"** card (only visible when `tx.status` is `seller_dispatched` or `seller_preparing_delivery` AND a token exists) showing:
- The shareable URL (copy button)
- A **QR code** (rider scans from seller's phone/desktop)
- WhatsApp share button
- "Open" button
- Token expiry countdown
- Backup 6-digit handoff code (for pickup/meetup)

This is the canonical "always reachable" location.

### 2. Active Transactions list — quick access
**File:** `src/pages/SellerTransactions.tsx`
On any row whose status is `seller_dispatched`, add a small **"Rider link"** action button (icon-only on mobile) that opens the same dialog you already have (`RiderConfirmationDialog`). Saves a click for sellers managing several active dispatches.

### 3. Seller Dashboard "Active Deliveries" widget
**File:** `src/components/seller/SellerRecentActivity.tsx` (or the active-deliveries section)
For each currently dispatched transaction, show a "Get rider link" quick action. This is what a seller sees first when they open the app on their phone before heading to the handoff.

## Data plumbing required
- `seller-transaction-detail` Edge Function: include the active token's URL + expiry from `delivery_confirmation_tokens` (where `status='active'`).
- `seller-transactions` Edge Function: include a boolean `has_active_rider_token` per row (cheap join). Defer URL fetch to the row click.
- `seller-dashboard` Edge Function: same boolean for the active deliveries widget.

## New shared component
`src/components/seller/RiderLinkCard.tsx` — used on the detail page; shows URL + QR + WhatsApp + copy + expiry. Reuses logic from existing `RiderConfirmationDialog`.

QR code: use `qrcode.react` (small, well-maintained, no system deps).

## Mockup alignment
Your uploaded mockup is the **rider-facing** page. Our existing `DeliveryConfirm.tsx` already implements that flow but with simpler styling. Optional follow-up: restyle `DeliveryConfirm.tsx` to match the mockup more closely (glass-card, progress steps header, brand chip). Flag this as a separate small task — tell me if you want it included.

## Out of scope
- SMS/push notification of the link to the rider (just copy/QR/WhatsApp for now).
- Token rotation UI (regenerate if compromised) — easy follow-up.
- Restyling the public rider page to match the mockup pixel-perfect (separate task).

## Files to add / change
**New:** `src/components/seller/RiderLinkCard.tsx`
**Modified:** `src/pages/SellerTransactionDetail.tsx`, `src/pages/SellerTransactions.tsx`, `src/components/seller/SellerRecentActivity.tsx`, `supabase/functions/seller-transaction-detail/index.ts`, `supabase/functions/seller-transactions/index.ts`, `supabase/functions/seller-dashboard/index.ts`
**Dependency:** add `qrcode.react`

