# Phase 13 — Delivery method, Payment fee, and Stock integrity

Three independent bugs surfaced from the same transaction (`62ebc233…22226da`, product `cdb185e5…30181`). All three are fixed together; each section is self-contained.

---

## 1. Delivery method is always "Pickup"

### Problem
`storefront-checkout` and `cart-checkout` ignore the buyer's selection and auto-pick the FIRST entry from the seller's `delivery_method` JSON array. For the Air Jordan product (`[pickup, delivery, courier_shipping]`), every transaction is locked to Pickup regardless of what the buyer chose at checkout.

### Fix
1. **`supabase/functions/storefront-checkout/index.ts`**
   - Accept `delivery_method` (and `delivery_address` / `contact_phone` when applicable) from the request body.
   - Validate that `delivery_method` ∈ product's enabled `delivery_method` array; reject with 400 if not.
   - When method is `courier_shipping` or `delivery` → require `delivery_address`.
   - When method is `pickup` or `meetup` → require `contact_phone`.
   - Stop defaulting to `array[0]`.
2. **`supabase/functions/cart-checkout/index.ts`**
   - Same validation, applied per item against each product's enabled list.
3. **Client (checkout UI)** — pass the buyer's already-selected `delivery_method` + address/phone through to the edge function (no UI redesign; just wire the existing field into the request payload).

### Out of scope
No change to delivery state machine, fees, or address schema.

---

## 2. Payment Processing Fee shows "—" on tracking page

### Problem
`transaction-detail/index.ts` selects only `item_amount, currency_code` from `transaction_pricing` and rebuilds pricing via `computePricing(...)`, which returns `paystack_fee_amount` but never `payment_processing_fee_amount`. The DB snapshot already holds the correct value (`payment_processing_fee_amount = 656.00`); the UI just reads the wrong column.

### Fix
**`supabase/functions/transaction-detail/index.ts`**
- Extend the `transaction_pricing` select to include the full snapshot: `payment_processing_fee_amount, seller_payout_amount, paystack_fee_amount, platform_fee_amount, service_fee_amount, service_fee_rate, buyer_total_amount, is_total_service_fee_capped, pricing_model_version`.
- Use the stored snapshot as the source of truth. Only fall back to `computePricing` when no snapshot row exists (pre-payment).
- Legacy rows: when `payment_processing_fee_amount` is null but `paystack_fee_amount` is set, map the latter into the former for display.

### Out of scope
No change to `computePricing`, fee math, or pricing schema.

---

## 3. Stock review — "Available: 3" after the last 3 units sold

### What "Available" means
`available = stock_quantity − reserved_quantity` (clamped at 0).
- `stock_quantity` = total units the seller physically has on hand.
- `reserved_quantity` = units locked by in-flight checkouts not yet paid.
- `Available` = what a new buyer can add to cart right now.

So `Reserved: 0 · Available: 3` means no checkout is holding stock and 3 units remain purchasable.

### What the inventory log for this product actually shows (DB truth)

```text
2026-05-02 02:30  reserve  +1  balance_after = 1   (stock=2, reserved=1)
2026-05-02 02:37  sold     -1  balance_after = 1   (stock=1, reserved=0)
2026-06-13 11:59  reserve  +1  balance_after = 0   (stock=1, reserved=1)   buyer started checkout
2026-06-13 16:33  sold     -1  balance_after = 3   (stock=3, reserved=0)   after payment
```

The jump from `balance 0 → 3` across the "sold" event is impossible from `convertReservedToSold` alone (it only DECREASES stock). The only way `stock` went 1 → 4 (so `4 − 1 = 3`) between 11:59 and 16:33 is a direct write to `products.stock_quantity` that did NOT emit an inventory log entry.

### Root cause
`UpdateStockModal` (Restock button) → `updateProduct(productId, { stock_quantity })` → `seller-product-detail` PATCH writes `stock_quantity` straight to the row. It does NOT insert into `product_inventory_logs` and does NOT use the dedicated `restock` path (`restockProduct` in `src/services/inventory.service.ts` + `action: "restock"` on the edge function). Consequences:
- Stock can balloon silently between sales — sellers see "still 3 available" after a sale and assume the decrement never ran.
- The Inventory history panel is incomplete (missing every manual edit), which is what made this look like a bug.

### Fix
1. **Route every stock change through the logged path.** `UpdateStockModal.onSave` and `seller-product-detail` PATCH must compute `delta = newQuantity − stock_quantity` and call the existing `restock` / `manual_adjustment` action so a `product_inventory_logs` row is written with `change_type = 'restock'` (delta > 0) or `'manual_adjustment'` (delta < 0). No direct `stock_quantity` writes from the edit-product form.
2. **Inventory history shows manual edits.** With (1) in place, the seller sees rows like `Restock +3 · Manual edit by seller` next to `Sold -1` / `Reserved +1` rows, removing the "did it decrement?" confusion entirely.
3. **Edit-product Stock Quantity field — UX guard.** The "Stock Quantity" input on `SellerProductDetail` becomes read-only display; all adjustments happen through the `Restock` modal, which already supports +/- deltas. Prevents accidental silent overwrites.
4. **Tooltip on `Reserved · Available`.** Add a `?` tooltip explaining the formula above so the seller doesn't have to guess.

### Out of scope
- No change to `convertReservedToSold` (already correct).
- No change to reservation math.
- No DB schema changes — `product_inventory_logs` already supports `restock` and `manual_adjustment`.

---

## Verification (all three)
- Create a fresh test transaction choosing "Courier / Shipping" → tracking page shows `Courier` (not `Pickup`).
- Same transaction → Payment Processing Fee renders `₦656.00` (not `—`).
- Seller restocks +3 → inventory history shows a `Restock +3` row; `stock_quantity` increases by exactly 3.
- New buyer pays for 1 unit → next inventory row is `Sold -1` with `balance_after` decreased by exactly 1 from the prior row.
- `Available` on the seller card always equals `stock − reserved` and matches the public storefront card.

## Files touched
- `supabase/functions/storefront-checkout/index.ts`
- `supabase/functions/cart-checkout/index.ts`
- `supabase/functions/transaction-detail/index.ts`
- `supabase/functions/seller-product-detail/index.ts`
- `src/services/inventory.service.ts` (reuse existing `restockProduct`)
- `src/components/seller/UpdateStockModal.tsx`
- `src/pages/seller/SellerProductDetail.tsx` (read-only stock field + tooltip)
- Checkout UI component(s) that submit to `storefront-checkout` / `cart-checkout` (wire selected delivery method into payload)
