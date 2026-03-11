

# Fix Pricing Consistency + Cap Platform Fee + Show Fee Breakdown

## Problem Summary

1. **Transactions table** shows `buyer_total_amount` (₦1,248,000) while **detail/delivery pages** show `item_amount` (₦1,200,000) — inconsistent
2. **Platform fee is uncapped** — for a ₦1,200,000 item, SafeDeal charges ₦32,800 platform fee on top of Paystack's ₦2,000. That's excessive.
3. **No fee breakdown visible** to sellers in the transactions table or delivery page — they don't understand why net amount differs from item amount

## Changes

### 1. Cap Platform Fee at ₦2,000 (both server + client pricing)

Update `computePricing` in both files to cap `platformFee` at ₦2,000, matching Paystack's benchmark:

```
platformFee = Math.min(Math.max(targetServiceFee - paystackFee, 0), 2000)
```

For the ₦1,200,000 example: service fee drops from ₦34,800 → ₦4,000 (₦2,000 Paystack + ₦2,000 platform).

| File | Change |
|------|--------|
| `supabase/functions/_shared/pricing.ts` | Add `Math.min(..., 2000)` cap on `platformFee` |
| `src/lib/pricing.ts` | Same cap |

### 2. Fix Amount Consistency — Show Item Amount Everywhere

Change the `seller-transactions` edge function to return `item_amount` instead of `buyer_total_amount` as the primary `amount` field, so the transactions table matches the detail page.

| File | Change |
|------|--------|
| `supabase/functions/seller-transactions/index.ts` | Map `amount` to `item_amount` instead of `buyer_total_amount`; also add `item_amount` to the SELECT query and include `service_fee` + `processing_fee` in response |

### 3. Show Fee Breakdown to Sellers

Add a small fee summary row below the amount in:
- **Transactions table**: Show a muted subtitle under the amount like "Net: ₦X" so the seller sees both
- **Update Delivery page**: Add a collapsible or inline fee breakdown showing Item Amount, Processing Fee, Platform Fee, and Net Amount

| File | Change |
|------|--------|
| `src/pages/SellerTransactions.tsx` | Add "Net: ₦X" subtitle under amount in table cell |
| `src/pages/SellerUpdateDelivery.tsx` | Add fee breakdown section in the header card |

### Summary of all files

| File | Action |
|------|--------|
| `supabase/functions/_shared/pricing.ts` | Cap platform fee at ₦2,000 |
| `src/lib/pricing.ts` | Cap platform fee at ₦2,000 |
| `supabase/functions/seller-transactions/index.ts` | Return `item_amount` as `amount`; add fee fields to response |
| `src/pages/SellerTransactions.tsx` | Show net amount subtitle in table |
| `src/pages/SellerUpdateDelivery.tsx` | Add fee breakdown in header |

