

# Fix NaN on Seller Transaction Share Page

## Problem

The `seller-transaction-detail` edge function was updated to return a unified `service_fee_amount` field, but the share page (`SellerTransactionShare.tsx`) and its child component (`TransactionSuccess.tsx`) still reference `platform_fee_amount`, which is now `undefined` — causing NaN in the fee percentage and "You'll Receive" amount.

## Changes

### 1. `src/pages/SellerTransactionShare.tsx` (lines 85-91)

Replace the pricing prop mapping to use `service_fee_amount` and `seller_net_amount` from the API instead of the old split fields:

```ts
const pricingProps = pricing
  ? {
      service_fee_amount: pricing.service_fee_amount,
      seller_net_amount: pricing.seller_net_amount,
      total_amount: pricing.buyer_total_amount,
    }
  : null;
```

### 2. `src/components/seller/TransactionSuccess.tsx`

- Update the `pricing` prop interface to use `service_fee_amount` and `seller_net_amount` instead of `platform_fee_amount` and `paystack_fee_amount`
- Line 54: change `sellerNet` to use `pricing.seller_net_amount` directly
- Line 55-56: change `feePercent` to compute from `service_fee_amount`
- Line 176-177: display `service_fee_amount` instead of `platform_fee_amount`
- Add "SafeDeal Service Fee" label (matching the unified fee model) with "(capped)" badge when fee equals ₦2,000

