

# Audit: Batch 7 (Delivery Tokens) & Batch 8 (Inventory Logs)

## What already exists ✅

**Delivery infrastructure (Batches 1–5 we just shipped):**
- Tables: `delivery_updates`, `delivery_tracking_details`, `delivery_confirmations`, `delivery_proof_files`
- Method-aware dispatch (`courier`/`pickup`/`meetup`/`hand_delivery`) with **mandatory evidence** enforced in `update-delivery-status`
- 6-digit handoff codes for pickup/meetup, stored in `delivery_tracking_details.signature_name` as `HANDOFF:NNNNNN`
- Phase 5 server-side code verification on "mark delivered"
- Buyer-facing `<InTransitBlock>` with dispatch state, proof, courier/tracking/handoff code
- Phone OTP plumbing already exists (`phone_otp_codes`, `verify-phone` function, SHA-256 hash, rate limits per memory)

**Inventory plumbing:**
- `products.stock_quantity` + `products.reserved_quantity` columns exist
- `available = stock - reserved` enforced in `cart-checkout`, `storefront-checkout`, `buyer-cart`
- Reserve happens at checkout; release happens on cart expiry (`buyer-cart` cleanup)
- `product_status` enum has `out_of_stock` and `archived` already

## What is missing ❌

**Batch 7 — Rider OTP confirmation flow:**
- No `delivery_confirmation_tokens` table or `delivery_confirmation_token_status` enum
- No public-safe rider page (`/delivery/confirm/:token`)
- No edge function to (a) issue rider token at dispatch, (b) trigger buyer OTP from rider page, (c) verify OTP → mark delivered
- Current handoff code is "buyer reads code to seller" — Batch 7 wants "rider enters token → buyer receives OTP → OTP verifies"
- No shareable rider link surfaced in seller UI

**Batch 8 — Inventory audit trail:**
- No `product_inventory_logs` table or `product_inventory_change_type` enum
- Reserve/release/sold/restock movements are not logged anywhere
- Auto `out_of_stock` flip when `available = 0` is not enforced
- No restock UI / endpoint
- Archive flow exists at column level but no guarantee it preserves history

## Proposed plan

Split into two batches, each ending in a working flow.

### Batch 7 — Rider OTP delivery confirmation

**1. Schema migration**
- New enum `delivery_confirmation_token_status` (`active`, `used`, `expired`, `revoked`)
- New table `delivery_confirmation_tokens` (per spec, with RLS: seller selects own, public token lookup via edge function only)
- Index on `token` (unique) and `(transaction_id, status)`

**2. Edge function changes**
- `update-delivery-status` (dispatch action): also generate a 32-char URL-safe token, insert into `delivery_confirmation_tokens` with 14-day expiry. Return `rider_confirmation_url` in response. Keep current handoff code as fallback for in-person (pickup/meetup) — they coexist.
- New function `delivery-token-lookup` (public, no JWT): GET by token → returns minimal info (transaction code, seller name, masked buyer phone) + triggers buyer OTP send via existing `phone_otp_codes` infra. Rate limited per IP/token.
- New function `delivery-token-confirm` (public): POST `{token, otp_code}` → verifies OTP, marks token `used`, transitions transaction to `delivered_awaiting_verification` (reuses Phase 2/5 logic), records `delivery_confirmations.system_delivery_marked_at`.

**3. Frontend**
- New public page `src/pages/DeliveryConfirm.tsx` at `/delivery/confirm/:token` — rider-safe: token input → "Send OTP to buyer" → OTP entry → success.
- Seller UI: after dispatch, surface the rider link in `<DispatchForm>` success state + on `SellerTransactionDetail` — copyable + WhatsApp share.
- Buyer UI: notification + `<InTransitBlock>` shows "rider may ask for the OTP we'll text you when they scan their link".

**4. Rollback safety**
Existing handoff code path (Phase 5) stays in place. The two flows are independent — one transaction can use either.

### Batch 8 — Inventory audit logs + auto out-of-stock

**1. Schema migration**
- New enum `product_inventory_change_type` (`restock`, `reserve`, `release`, `sold`, `manual_adjustment`)
- New table `product_inventory_logs` (per spec) with RLS: seller selects own product logs; admin sees all; insert via service role only.
- Trigger on `products` `AFTER UPDATE OF stock_quantity, reserved_quantity` → if computed `available <= 0` and `status = 'published'` → flip to `out_of_stock`; if `available > 0` and `status = 'out_of_stock'` → flip to `published`.

**2. Edge function changes**
Add a small `logInventoryChange()` helper (inline in each function — no shared modules in edge functions per project rules) and call it from:
- `cart-checkout` + `storefront-checkout`: log `reserve` when `reserved_quantity` increments
- `buyer-cart` cleanup + new cancel/expiry paths: log `release`
- `verify-paystack-payment` / `paystack-webhook` success: log `sold` (decrement `stock_quantity`, decrement `reserved_quantity`) — **this is currently missing entirely; reserve never converts to sold today**
- New `seller-products` PATCH `restock` action: log `restock`, increment `stock_quantity`

**3. Frontend**
- Seller product detail: "Restock" modal (current stock, add quantity, optional note) + recent inventory log table.
- Product card badge updates automatically via the trigger.

**4. Archive safety**
Already enforced — `archived_at` column + `prevent_delete` policy on related financial tables. Add a check that archive sets `is_active = false` but preserves the row.

## Out of scope

- WhatsApp/SMS API integration for the rider link (just `whatsapp://send?text=` deeplink for now)
- Real-time inventory notifications to seller
- Bulk restock CSV import
- Inventory forecasting

## Recommended order

Batch 7 first (closes a real fulfillment trust gap — current handoff code can be socially engineered). Batch 8 second (silent reliability — no urgent UX bug today, but `sold` never being recorded is a latent accounting drift waiting to happen).

