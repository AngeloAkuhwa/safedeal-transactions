

# Fix: "Transaction amount not set" in Paystack Popup

## Problem
Paystack Inline JS requires the `amount` parameter in `PaystackPop.setup()` even when `access_code` is provided. The current frontend only passes `key`, `access_code`, and `email`.

## Solution
1. **Backend** (`supabase/functions/initiate-paystack-payment/index.ts`): Add `amount` (in kobo) to the response JSON — the variable `amountInKobo` is already computed.

2. **Frontend** (`src/pages/BuyerPaymentSummary.tsx`): Pass `amount: initData.amount` to `PaystackPop.setup()`.

### Changes

| File | Change |
|------|--------|
| `supabase/functions/initiate-paystack-payment/index.ts` | Add `amount: amountInKobo` to response JSON (line ~244) |
| `src/pages/BuyerPaymentSummary.tsx` | Add `amount: initData.amount` to `PaystackPop.setup()` config (line ~148) |

