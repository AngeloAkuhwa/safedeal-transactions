

# Fix: Enable Payment Testing

## Problem
Two issues prevent testing the Paystack payment flow:

1. **Button greyed out** — requires the terms checkbox to be checked (scroll down on the page). This is by design.

2. **Seed data state conflict** — Transaction SD-2026-000001 has `money_status = payment_pending` in the database, but `initiate-paystack-payment` requires `not_secured`. The initiate function will return a 409 error even after checking the box.

## Solution

### Fix 1: Reset seed transaction state via migration
Run a migration to reset SD-2026-000001 back to the correct pre-payment state:
```sql
UPDATE transactions 
SET money_status = 'not_secured', status = 'awaiting_payment'
WHERE transaction_code = 'SD-2026-000001';
```

### Fix 2: Update initiate function to handle `payment_pending` re-attempts
Alternatively, update `initiate-paystack-payment` to also accept `payment_pending` as a valid starting state (for retry scenarios where the user abandoned a previous attempt). This is the better approach because:
- Users may close the popup and retry
- The Paystack session may expire
- The existing `payment_pending` → `not_secured` revert path already exists in the money validator

Changes to `supabase/functions/initiate-paystack-payment/index.ts`:
- Accept both `not_secured` AND `payment_pending` as valid starting states
- If already `payment_pending`, skip the transition (it's already there)
- Check for existing pending payments and reuse or cancel them

## How to Test

1. After the fix deploys, navigate to `/t/tok_seed_001/pay`
2. Scroll down and check the escrow agreement checkbox
3. Click "Pay ₦874,650"
4. The Paystack popup should open with test card details:
   - **Test card**: 4084 0840 8408 4081
   - **Expiry**: any future date
   - **CVV**: 408
   - **OTP**: 123456
5. After popup success, verify-paystack-payment runs automatically

## Files

| File | Action |
|------|--------|
| `supabase/functions/initiate-paystack-payment/index.ts` | Edit — accept `payment_pending` as valid starting state for retries |

