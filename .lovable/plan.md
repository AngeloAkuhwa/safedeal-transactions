

# Simplify Buyer Pricing Display — Single SafeDeal Protection Fee

## Current Problem

The buyer payment summary (`BuyerPaymentSummary.tsx`) shows **three** fee lines:
- Item Price
- SafeDeal Protection Fee (X.X%)
- Processing Fee

This contradicts the product principle of showing **one single fee**.

## Changes

### 1. Update pricing logic — cap total service fee at ₦2,000

**Files:** `supabase/functions/_shared/pricing.ts` and `src/lib/pricing.ts`

After computing `paystackFee + platformFee`, cap the total at ₦2,000:
```ts
const rawServiceFee = paystackFee + platformFee;
const serviceFeeAmount = Math.min(rawServiceFee, 2000);
const effectivePlatformFee = Math.max(serviceFeeAmount - paystackFee, 0);
```

Internal fields (`paystack_fee_amount`, `platform_fee_amount`) still returned for accounting, but `service_fee_amount` and `total_amount` reflect the cap.

### 2. Simplify buyer payment summary (lines 486-511)

**File:** `src/pages/BuyerPaymentSummary.tsx`

Replace the 3-line breakdown with:

```
Item Price                    ₦1,200,000
SafeDeal Protection Fee       ₦2,000  (capped)
─────────────────────────────────────────
Total You Pay                 ₦1,202,000
```

Specific changes:
- Remove the `Processing Fee` line (line 499-502)
- Remove the percentage display `(X.X%)` from Protection Fee label
- Add `(capped)` badge next to fee amount
- Add microcopy below: "Covers secure payment holding, buyer protection, and dispute resolution."
- Remove `paystackFee` variable usage (line 252) — no longer needed in UI

### 3. Add trust block below pricing (replace existing "100% Secure Payment" block)

**File:** `src/pages/BuyerPaymentSummary.tsx` (lines 513-521)

Replace with a richer "Your Payment is Protected" card:
- Title: "Your Payment is Protected"
- Body: "SafeDeal holds your payment securely until you confirm the item has been received and matches the agreement."
- 3 checkmarks: Secure escrow payment, Buyer verification window, Dispute protection

### 4. Update seller-side fee display

**File:** `src/pages/SellerUpdateDelivery.tsx` (lines 144-166)

Replace 4-column breakdown (Item Amount / Processing Fee / Platform Fee / Net Payout) with 3 lines:
- Item Amount
- SafeDeal Service Fee (single combined, capped)
- Your Net Payout

### 5. Normalize old data in edge functions

**Files:** `supabase/functions/seller-transaction-detail/index.ts` and `supabase/functions/seller-transactions/index.ts`

When returning pricing, compute: `service_fee = Math.min(processing_fee + platform_fee, 2000)` and `seller_net = item_amount - service_fee`. This ensures old records with inflated fees display correctly.

### 6. Update service interfaces

**File:** `src/services/seller-transaction-detail.service.ts` — add `service_fee_amount` to pricing interface
**File:** `src/services/seller-transactions.service.ts` — replace `platform_fee` + `processing_fee` with `service_fee`

## Files Summary

| File | Change |
|------|--------|
| `supabase/functions/_shared/pricing.ts` | Cap total service fee at ₦2,000 |
| `src/lib/pricing.ts` | Same cap |
| `src/pages/BuyerPaymentSummary.tsx` | 3 lines → 2 lines + total, add trust block, add "(capped)" badge |
| `src/pages/SellerUpdateDelivery.tsx` | 4-col → 3-line fee display with "SafeDeal Service Fee" |
| `supabase/functions/seller-transaction-detail/index.ts` | Return combined `service_fee_amount`, normalize old data |
| `supabase/functions/seller-transactions/index.ts` | Return combined `service_fee`, normalize old data |
| `src/services/seller-transaction-detail.service.ts` | Add `service_fee_amount` to interface |
| `src/services/seller-transactions.service.ts` | Replace split fees with `service_fee` |

