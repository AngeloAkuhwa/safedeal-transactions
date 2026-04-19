

# Updated Plan: Fix 6 transaction-flow bugs + close the deferred items

## NEW issue 0 — Rider link opens to "Transaction not found"

**Root cause** (confirmed in `update-delivery-status/index.ts` lines 352–353): the rider URL is built from `req.headers.get("origin")`. When called from the Lovable preview iframe, that origin is the *sandbox runtime* host (`https://<project-id>.lovableproject.com`) — a different deployment from the one the user is browsing (`id-preview--<project-id>.lovable.app`). The token row exists on the project's DB, but when the rider opens the sandbox URL it hits a different app instance / different auth context where the public lookup fails.

**Fix:**
1. Stop trusting `req.headers.origin`. Build the URL from a **stable public base**:
   - Read `Deno.env.get("PUBLIC_APP_URL")` first (new optional secret — falls back if absent).
   - Else use the explicit `app_origin` field the client sends in the request body (we'll have `RiderConfirmationDialog` and `update-delivery-status` callers pass `window.location.origin`).
   - Final fallback to `req.headers.origin`.
2. Persist the resolved URL on the token row (add `confirmation_url text` column to `delivery_confirmation_tokens`) so `RiderLinkCard` reads exactly what the rider will click — no drift between dispatch and later retrieval.
3. In `RiderLinkCard.tsx` and `RiderConfirmationDialog`, prefer the persisted URL; only re-derive from `window.location.origin + path` if missing.
4. Backfill: run a one-off SQL update setting `confirmation_url = NULL` on existing tokens so the frontend re-derives them with the correct origin.

## 1. "Express Shipping" stored as `meetup` — label/value mismatch

Replace misleading label in `SellerCreateTransaction.tsx`. Use the four real backend enums with accurate labels: `courier` "Courier / Standard Shipping", `pickup` "Buyer Pickup", `meetup` "Meet-Up in Person", `hand_delivery` "Hand Delivery".

## 2. Edge function silently fails on amount-limit errors

- **Backend:** Validation/business-rule failures return **HTTP 200** with `{ ok: false, error, code, diagnostics? }`. Reserve non-2xx for true system errors. Apply to `create-transaction`, `claim-offer`, `cart-checkout`, `storefront-checkout`, `initiate-paystack-payment`, `verify-paystack-payment`.
- **Service layer:** All `*.service.ts` check `data.ok === false` → throw `new Error(data.error)`.
- **Structured logging:** New `edge_function_errors` table (`function_name, user_id, error_code, message, http_status, request_context jsonb, created_at`). Inline `logEdgeError()` helper (no shared modules).

## 3. Item images/videos missing on Review-to-Pay page

`resolve-share-token` only queries `transaction_media`. Offer-claimed transactions store media on `product_media` via `buyer_specific_offer_items.product_id`. Fix:
1. If `transactions.source_offer_id` is set, fall back to fetching `product_media → files`. Return same shape as `data.media`.
2. Replace inline `<img>` grid in `BuyerTransactionReview.tsx` with the existing `<ProductMediaGallery />` (handles videos, lightbox, consistent UX everywhere).

## 4. NaN% in Payment Summary on Seller Transaction Detail

`seller-transaction-detail` returns stripped pricing (no `platform_fee_amount`). Frontend computes `feePercent = platform_fee_amount / item_amount * 100` → NaN. Fix:
- Use `computePricing()` in the edge function; return full breakdown (`item_amount`, `platform_fee_amount`, `paystack_fee_amount`, `service_fee_amount`, `service_fee_rate`, `seller_net_amount`, `buyer_total_amount`, `currency_code`).
- Frontend: fall back to `service_fee_rate * 100` if individual components missing.

## 5. Review page stuck on "Payment Pending" after payment + agreement not visibly locked

`BuyerTransactionReview.tsx` hardcodes header copy. DB *is* correctly locked (`agreement_locked_at` set, `money_status=funds_held_in_escrow`, trigger `prevent_edit_after_agreement_lock` already enforces immutability). UI is just stale.

Fix:
1. Drive header chip + money block from `data.transaction.money_status`.
2. When `agreement_locked_at` is set: swap red "Becomes Locked" warning for a green "Agreement Locked" card (mirror `LockedSnapshotCard`); hide Pay/Decline; show "View transaction" CTA.
3. Auto-refetch every 3s **only while `money_status === 'payment_pending'`** so page flips after webhook lands. Stops as soon as state changes — no runaway polling.

## Closing the previously-deferred items

### A. Express Shipping tier — deferred but with a concrete shape
Not implementing now (still needs product/courier-SLA decision). Documented requirement so the next iteration is plug-and-play:
- Add enum value `express_courier` to `delivery_method_type`
- Add `delivery_sla_hours int` and `is_express boolean` to `transaction_delivery_terms`
- New label "Express Courier (24h)" mapped to `express_courier`
Tracked as a follow-up; no code change in this PR.

### B. Push notification on `money_status` flip
Add it now (cheap, complements the auto-refetch for users who closed the tab):
- In `verify-paystack-payment` and `paystack-webhook`, after `money_status → funds_held_in_escrow`, insert two rows into `notifications` (buyer + seller) with `type='payment_secured'`, `channel='in_app'`, transaction-deeplinked. Existing `RecentNotifications` widget renders them.

### C. Backfill `meetup`-mislabelled products / transactions
Read-only audit query first (count rows where `transaction_delivery_terms.delivery_method='meetup'` and the offer/product was created via the "Express Shipping" path before today). If safe count: ship a one-shot migration setting them to `courier`. If ambiguous: leave alone, log to `edge_function_errors` with `code='delivery_method_legacy_mismatch'` for manual triage. **Default action: log only**, don't auto-mutate historical financial-adjacent data without explicit approval.

### D. Token rotation UI (was deferred under Batch 7)
Add a "Regenerate rider link" button on `RiderLinkCard` (seller only, only while status ∈ `seller_preparing_delivery|seller_dispatched`). Calls a new tiny edge function `rotate-delivery-token` that marks the active token `revoked` and inserts a fresh one. Closes the "rider lost the link / link compromised" gap.

## Risk

- **`{ok:false}` contract change** touches 5 edge functions. Service layer already catches both `error` and `data.error`; we keep `ok:true` on success → fully additive. Old direct callers continue to work.
- **Auto-refetch (3s)** gated on `payment_pending` only, stops the moment state changes — no runaway polling, no extra cost when idle.
- **Rider URL fix** changes the *new* URL format; existing tokens will be re-derived from `window.location.origin` on next view, so no broken links for in-flight dispatches.
- **Token rotation** invalidates the previous link — sellers will be warned in the confirm dialog ("Old link will stop working").

## Files

**New**
- migration: `edge_function_errors` table + `delivery_confirmation_tokens.confirmation_url` column
- `supabase/functions/rotate-delivery-token/index.ts`

**Modified**
- `supabase/functions/update-delivery-status/index.ts` — robust URL resolution + persist URL (#0)
- `src/components/seller/RiderLinkCard.tsx`, `RiderConfirmationDialog.tsx` — prefer persisted URL + rotation button (#0, D)
- `src/pages/SellerCreateTransaction.tsx` — accurate delivery labels (#1)
- `supabase/functions/{create-transaction,claim-offer,cart-checkout,storefront-checkout,initiate-paystack-payment,verify-paystack-payment}/index.ts` — `{ok:false}` + log + payment-secured notifications (#2, B)
- `src/services/{create-transaction,cart,storefront-checkout}.service.ts` — read `data.ok === false` (#2)
- `supabase/functions/resolve-share-token/index.ts` — offer-aware media (#3)
- `src/pages/BuyerTransactionReview.tsx` — `<ProductMediaGallery>` + state-driven badges + auto-refetch + locked card (#3, #5)
- `supabase/functions/seller-transaction-detail/index.ts` — full pricing breakdown (#4)
- `src/pages/SellerTransactionDetail.tsx` — robust `feePercent` (#4)

