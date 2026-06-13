# Lock pending-checkout cart rows + eager reservation release on Remove

## 1. Lock the row in `src/pages/BuyerCart.tsx`

A row is **locked** when `item.product.active_checkout_session_id` is truthy.

When locked:
- Checkbox: disabled and unchecked; row excluded from `selectableItems` so "Select All" ignores it.
- Delivery method picker, address fields, and contact-phone field: not rendered at all (`showPicker = false` regardless of `enabledMethods`).
- Qty − / + buttons: disabled.
- Keep the amber "Checkout in progress" badge.
- Add a one-line helper under the badge: "Finish or cancel this checkout to edit."
- Right-side actions: **Resume checkout** (existing) and **Remove** only.
- "Remove" opens a confirm dialog (shadcn `AlertDialog`): "This will cancel your reserved checkout for this item. Continue?"

No changes to non-locked rows.

## 2. Release the reservation eagerly on Remove in `supabase/functions/buyer-cart/index.ts`

Extend the existing `remove` action. After deleting the `cart_items` row, for the same `buyer_id` + `product_id`:

1. Find all `checkout_session_items` whose parent `checkout_sessions.status = 'pending'` and `buyer_id = buyerId`.
2. Sum their `quantity` and decrement `products.reserved_quantity` by that amount (floor at 0).
3. Delete those `checkout_session_items` rows.
4. For each affected `checkout_session_id`:
   - If any `transaction_id` is attached, transition the transaction to `cancelled` (only when still `awaiting_payment`) using the same path the expiry cron uses.
   - If the session now has zero items, mark the `checkout_sessions` row `cancelled`.
5. Log a `product_inventory_logs` "released" entry for the decrement, mirroring the cron cleanup.

Idempotent: if there are no pending items for that product, the remove behaves exactly as today.

Return shape unchanged (`{ success: true }`).

## Out of scope

- No changes to `cart-checkout`, `checkout-review`, `verify-paystack-payment`, `paystack-webhook`, pricing, escrow ledger, or DB schema.
- No "apply same address to all" panel — defer until multi-item carts are common.

## Files touched

- `src/pages/BuyerCart.tsx` — lock logic + confirm dialog on remove for locked rows.
- `supabase/functions/buyer-cart/index.ts` — extend `remove` action with reservation release + session cleanup.

## Verification

1. With Air Jordan in a pending checkout: checkbox disabled, no delivery picker/address form, qty +/- disabled; Resume + Remove visible; helper line shows.
2. "Select All" no longer counts the locked row.
3. Click Resume — opens the existing Review & Pay session unchanged.
4. Click Remove → confirm → row disappears, `reserved_quantity` drops, product becomes available again. Re-adding from the marketplace produces a fresh, editable row.
5. Removing a non-locked row works exactly as before (no confirm dialog, no reservation changes).
