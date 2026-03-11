

# Fix: Pricing Not Populated on Share Page

## Problem
The `seller-transaction-detail` edge function computes pricing from `escrow_states.held_amount`, which is 0 for transactions in `awaiting_buyer` status (no payment yet). The actual pricing is stored in the `transaction_pricing` table, which is never queried.

## Fix

### `supabase/functions/seller-transaction-detail/index.ts`

1. Add a query to `transaction_pricing` in the `Promise.all` block:
   ```sql
   SELECT item_amount, platform_fee_amount, processing_fee_amount, 
          seller_net_amount, buyer_total_amount, currency_code
   FROM transaction_pricing WHERE transaction_id = ?
   ```

2. Change pricing logic: use `transaction_pricing` data directly instead of computing from escrow. Only fall back to `computePricing` if `transaction_pricing` row doesn't exist.

### Also fix: Row click navigation in `SellerTransactions.tsx`

Based on the screenshots, the table rows should be clickable links to the detail page, and the action buttons should route conditionally. Will verify current state matches the plan from last session.

| File | Change |
|------|--------|
| `supabase/functions/seller-transaction-detail/index.ts` | Query `transaction_pricing` table; use its data for pricing instead of computing from escrow |

