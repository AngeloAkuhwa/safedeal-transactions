

# Plan: Dynamic Tiered Service Fee with Paystack Rules

## Problem
The UI shows "Service Fee (0.0%)" because the backend computes `service_fee_rate` by dividing stored `platform_fee_amount + processing_fee_amount` by `item_amount` — but those DB columns are likely 0 or null. The fix is to compute fees dynamically using SafeDeal's tiered policy and Paystack's real local pricing rules.

## Key Definitions
- **item_amount** = agreed item price before buyer-facing fees
- **service_fee_rate** = buyer-facing all-in percentage (backend-owned commercial value)
- **service_fee_amount** = paystack_fee_amount + platform_fee_amount

## Changes

### 1. New file: `supabase/functions/_shared/pricing.ts`

Shared pricing helper with:

**Paystack local NGN rules:**
- 1.5% + ₦100
- ₦100 waived if amount < ₦2,500
- Capped at ₦2,000

**SafeDeal tiered rates:**
- ₦0–₦100,000 → 3.9%
- ₦100,001–₦500,000 → 3.5%
- ₦500,001–₦2,000,000 → 2.9%
- Above ₦2,000,000 → 2.5%

**Computation:**
1. `paystackFee` = apply Paystack local rules
2. `targetFee` = `itemAmount * tierRate`
3. `platformFee` = `max(targetFee - paystackFee, 0)`
4. `serviceFeeAmount` = `paystackFee + platformFee`
5. `serviceFeeRate` = `serviceFeeAmount / itemAmount`
6. `totalAmount` = `itemAmount + serviceFeeAmount`

Exports `computePricing(itemAmount, currencyCode, mode)` returning `{ currency_code, item_amount, paystack_fee_amount, platform_fee_amount, service_fee_amount, service_fee_rate, total_amount }`.

International mode is stubbed (3.9% + ₦100 for Mastercard/Visa/Verve) for future use.

### 2. Update `supabase/functions/resolve-share-token/index.ts` (lines 106–113)

Replace the manual sum of `platform_fee_amount + processing_fee_amount` with:
```typescript
import { computePricing } from "../_shared/pricing.ts";
// ...
const pricingRaw = pricingRes.data;
const computedPricing = pricingRaw
  ? computePricing(Number(pricingRaw.item_amount) || 0, pricingRaw.currency_code || "NGN")
  : null;
```

### 3. Update `supabase/functions/transaction-agreement/index.ts` (lines 103–110)

Same replacement — import `computePricing` and use `item_amount` from DB to dynamically compute all fee fields.

### 4. Update `supabase/functions/transaction-detail/index.ts` (lines 164–169)

Replace the IIFE that sums `platform_fee_amount + processing_fee_amount` with `computePricing(Number(p.item_amount) || 0, p.currency_code || "NGN")`.

### 5. Update service interfaces

Add `paystack_fee_amount: number` to pricing interfaces in:
- `src/services/review.service.ts`
- `src/services/agreement.service.ts`
- `src/services/transaction-detail.service.ts`

### 6. No frontend display changes needed

All 6 UI locations already render `service_fee_rate` and `service_fee_amount` from backend data with the correct format: `Service Fee (X.X%)` + "Includes payment processing".

### 7. No DB migration needed

Fees computed dynamically from `item_amount` stored in `transaction_pricing`.

## Verification Example

For ₦850,000 (tier: 2.9%):
- Paystack: min(850000 × 0.015 + 100, 2000) = ₦2,000 (capped)
- Target fee: 850000 × 0.029 = ₦24,650
- Platform: ₦22,650
- Service fee: ₦24,650, rate: 2.9%
- Total: ₦874,650

