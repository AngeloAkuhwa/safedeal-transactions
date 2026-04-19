

User approved the audit plan and wants Batch 8 implemented. Let me confirm what needs to happen — I have all the context from the prior plan.

# Batch 8 — Inventory Audit + Auto Out-of-Stock

## What ships

### 1. Schema migration

- New enum `product_inventory_change_type` (`restock`, `reserve`, `release`, `sold`, `manual_adjustment`)
- New table `product_inventory_logs`:
  - `id uuid pk`, `product_id`, `change_type`, `quantity_delta int`, `balance_after int`, `reference_type text null`, `reference_id uuid null`, `notes text null`, `changed_by_user_id uuid null`, `created_at`
- RLS:
  - Sellers: SELECT logs for products they own
  - Admins: SELECT all
  - INSERT only via service role (no client policy)
- Trigger `auto_out_of_stock_status` on `products` AFTER UPDATE OF `stock_quantity, reserved_quantity`:
  - If `stock_quantity - reserved_quantity <= 0` AND `status = 'published'` → flip to `out_of_stock`
  - If `stock_quantity - reserved_quantity > 0` AND `status = 'out_of_stock'` → flip back to `published`
  - Skip when status is `draft` or `archived`

### 2. Edge function changes

Add a small inline `logInventoryChange()` helper to each function (no shared modules — project rule).

- **`cart-checkout`** + **`storefront-checkout`**: log `reserve` after `reserved_quantity` increment (`reference_type='transaction'`, `reference_id=transaction.id`)
- **`buyer-cart`** (cart-expiry cleanup) + **`decline-transaction`** + cancel paths: log `release`
- **`verify-paystack-payment`** + **`paystack-webhook`** on success: decrement BOTH `stock_quantity` and `reserved_quantity` by the purchased qty, then log `sold`. **This closes the latent bug where reserve never converts to sold.**
- **`seller-products`** (PATCH new action `restock`): increment `stock_quantity` by `delta`, log `restock` with optional note. Also support `manual_adjustment` for absolute corrections.

### 3. Frontend

- New `RestockModal.tsx` on seller product detail (`SellerProductDetail.tsx`):
  - Shows current stock + reserved + available
  - Input: quantity to add, optional note
  - Calls `seller-products` PATCH `{action:'restock', product_id, delta, notes}`
- New `InventoryLogTable.tsx` showing the last 20 movements per product
- Out-of-stock badge on `<ProductStatusBadge>` already exists — driven automatically by the trigger now
- Service: `src/services/seller-products.service.ts` add `restockProduct()` + `getInventoryLogs()`

### 4. Archive safety check

Verify (read-only) that archiving via `seller-products` sets `status='archived'` + `is_active=false` without deleting the row, and that `product_inventory_logs.product_id` does NOT have `ON DELETE CASCADE` — keeps history even if a product is later hard-deleted by an admin.

## Out of scope

- Realtime stock notifications to seller
- Bulk restock CSV
- Inventory forecasting / alerts at low-stock thresholds (could be a follow-up)

## Files touched

**New:** migration, `src/components/seller/RestockModal.tsx`, `src/components/seller/InventoryLogTable.tsx`
**Modified:** `supabase/functions/cart-checkout/index.ts`, `supabase/functions/storefront-checkout/index.ts`, `supabase/functions/buyer-cart/index.ts`, `supabase/functions/verify-paystack-payment/index.ts`, `supabase/functions/paystack-webhook/index.ts`, `supabase/functions/decline-transaction/index.ts`, `supabase/functions/seller-products/index.ts`, `src/pages/SellerProductDetail.tsx`, `src/services/seller-products.service.ts` (or create), `src/integrations/supabase/types.ts` (auto-regen)

## Risk notes

- The "convert reserve → sold" change in `verify-paystack-payment` is the highest-risk edit. It's currently silently skipped, so adding it is strictly safer, but I'll guard with idempotency: only decrement if a `sold` log row for the same `reference_id` (transaction_id) doesn't already exist.
- The trigger flips status automatically — sellers cannot manually keep a published product visible at zero stock. This matches `mem://logic/product-status-definitions`.

