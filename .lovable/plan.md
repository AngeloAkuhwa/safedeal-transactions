## What I found

- The product row for `cdb185e5-51cc-4209-946b-b8a307d30181` currently says `stock_quantity = 3` and `reserved_quantity = 0`, so the seller screen is correctly rendering `Available = 3` from the stored data.
- The mismatch is upstream: the latest checkout session recorded **quantity 3** for this product in `checkout_session_items`, but the linked transaction still has **quantity 1** in `transaction_items`.
- Payment confirmation converts reserved stock to sold from the transaction-side quantity, so it only wrote a **sold -1** log and only decremented stock for **1 unit**.
- This means the buyer’s later “buy the last 3” attempt reused an older pending transaction without fully updating its quantity/reservation state.

## Plan

### 1) Fix pending-transaction reuse in both checkout flows
Update the reuse paths in:
- `supabase/functions/cart-checkout/index.ts`
- `supabase/functions/storefront-checkout/index.ts`

So that when a pending transaction is reused, the system also reconciles all dependent records with the buyer’s latest intent:
- transaction item quantity
- pricing snapshot
- delivery terms
- reserved stock delta on the product
- inventory reservation logging for that transaction

Goal: a reused pending transaction must behave exactly like a fresh checkout, not keep stale quantity `1` while the new checkout expects `3`.

### 2) Fix payment confirmation to convert the correct sold quantity
Update the payment-confirmation inventory conversion logic in:
- `supabase/functions/verify-paystack-payment/index.ts`
- any matching payment webhook path using the same conversion logic

So that it:
- derives sold quantities from the authoritative checkout-linked records when available
- handles grouped cart transactions safely
- no longer depends on a stale single `source_product_id` / outdated `transaction_items` row
- writes the correct `sold` inventory log per affected product

Goal: payment success must always reduce stock and clear reserved units by the exact quantity the buyer actually paid for.

### 3) Reconcile the already-affected Jordan product data
Apply a targeted data repair for the affected product/transaction chain so the live seller screen matches the paid purchase:
- compare the checkout session quantity, transaction quantity, current product stock, and existing inventory logs
- correct the product inventory counts to the paid quantity outcome
- add a correction log entry so the inventory history explains the adjustment instead of silently changing totals

Goal: this specific product should stop showing an incorrect `3 available` after the fix ships.

### 4) Validate the full inventory path end-to-end
Re-test these cases after the fix:
- direct storefront checkout with a pending transaction being retried at a different quantity
- cart checkout with quantity changes before payment
- payment confirmation updating seller product detail and inventory history

Expected outcome:
- seller product page shows the correct `Available = stock_quantity - reserved_quantity`
- inventory history shows matching reserve/sold movements for the paid quantity
- no flow leaves stock unchanged after successful payment

## Technical details

- Seller UI read path appears correct; it is reading backend data and computing `Available = stock_quantity - reserved_quantity` as intended.
- The bug is in the backend inventory lifecycle, not the seller page rendering.
- Main files likely involved:
  - `supabase/functions/cart-checkout/index.ts`
  - `supabase/functions/storefront-checkout/index.ts`
  - `supabase/functions/verify-paystack-payment/index.ts`
  - payment webhook inventory conversion code if separate
- No schema change is expected for this fix unless the reconciliation step reveals a missing supporting constraint.