

# Fix Pricing Display + Create Update Delivery Page

## Issues Identified

1. **Pricing shows ₦0.00**: The edge function queries `transaction_pricing` correctly, but the fallback path uses wrong property names from `computePricing` result (`pricingResult.itemAmount` instead of `pricingResult.item_amount`). Also, the `transaction_pricing` table has no `service_fee_rate` column — querying it causes an error, making `pricingRow` null, which triggers the broken fallback.

2. **`/delivery` route 404**: The `SellerUpdateDelivery` page was never created, and the route was never added to `App.tsx`. Navigation to `/seller/transactions/:id/delivery` hits the catch-all 404.

## Fix Plan

### 1. Fix Edge Function Pricing (`supabase/functions/seller-transaction-detail/index.ts`)

- Remove `service_fee_rate` from the `transaction_pricing` SELECT (column doesn't exist, causes query failure)
- Fix fallback `computePricing` property mapping: use `pricingResult.item_amount`, `pricingResult.platform_fee_amount`, `pricingResult.paystack_fee_amount`, `pricingResult.total_amount` (matching the `PricingResult` interface)
- Compute `seller_net_amount` as `item_amount - platform_fee_amount` in fallback

### 2. Create Update Delivery Page (`src/pages/SellerUpdateDelivery.tsx`)

Matching the uploaded HTML design:
- Header card: title "Update Delivery Status", amount/code badge, money status banner, 3-col quick info (Buyer, Item, Date)
- Horizontal 5-step progress timeline
- Red evidence integrity warning banner
- Delivery form: order status select (Processing/Dispatched/Delivered), tracking number input, delivery notes textarea
- Evidence type grid (5 types: Courier Receipt, Tracking Proof, Package Photos, Signed Receipt, Video Proof)
- Drag-and-drop file upload zone
- "What Happens Next" 3-step info section
- Trust indicators row (Secure Process, 24/7 Support, Evidence Protection)
- Uses `SellerNav`, `Footer`, fetches data from `seller-transaction-detail` edge function

### 3. Register Route (`src/App.tsx`)

Add `/seller/transactions/:transactionId/delivery` → `SellerUpdateDelivery` under seller protected routes.

| File | Action |
|------|--------|
| `supabase/functions/seller-transaction-detail/index.ts` | Fix — remove bad column, fix fallback property names |
| `src/pages/SellerUpdateDelivery.tsx` | Create — full delivery update page |
| `src/App.tsx` | Edit — add delivery route |

