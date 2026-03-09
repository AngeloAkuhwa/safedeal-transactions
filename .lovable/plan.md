

# Paystack Payment Integration — Implementation Plan

## Secrets Status
Both `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` are confirmed in the project. Ready to proceed.

## What We'll Build

### 1. Create `supabase/functions/initiate-paystack-payment/index.ts`
**JWT-protected endpoint** that:
- Validates the authenticated buyer owns the transaction
- Resolves `shareToken` → transaction via `transaction_links`
- Confirms `status = awaiting_payment` and `money_status = not_secured`
- Computes pricing using the shared `computePricing()` helper
- Generates unique reference: `SD-{txCode}-{timestamp}`
- Transitions `money_status`: `not_secured` → `payment_pending`
- Inserts `payments` record (status: `pending`, provider: `paystack`)
- Inserts `money_status_history` record
- Calls Paystack `POST /transaction/initialize` with amount in kobo, buyer email, channels (`["card"]` or `["bank"]`)
- Returns `{ access_code, reference, public_key }` to frontend

### 2. Create `supabase/functions/verify-paystack-payment/index.ts`
**JWT-protected endpoint** that:
- Calls Paystack `GET /transaction/verify/{reference}`
- **Idempotency**: if `payments.status` already `succeeded`, returns success without re-processing
- On Paystack success — atomic updates:
  - `payments` → status `succeeded`, `captured_at`, `raw_payload`
  - `transactions` → status `payment_secured`, money_status `funds_held_in_escrow`, `agreement_locked_at = now()`
  - `escrow_states` → state `held`, `held_amount` = item_amount
  - 4 `escrow_ledger_entries`: `payment_credit` (total), `fee_record` (paystack fee), `fee_record` (platform fee), `escrow_hold` (seller principal)
  - `transaction_status_history` record
  - `money_status_history` record
  - `transaction_agreement_snapshots` — locks item, pricing, delivery, notes, media as immutable JSONB
  - `transaction_events` — `payment_received`
  - Seller notification inserted
- On failure: update payment to `failed`, revert `money_status` → `not_secured`

### 3. Create `supabase/functions/paystack-webhook/index.ts`
**Public endpoint** (no JWT) that:
- Verifies `x-paystack-signature` HMAC-SHA512
- Logs ALL events to `payment_webhook_logs`
- On `charge.success`: runs same idempotent verify + DB update logic
- Returns 200 immediately

### 4. Update `src/pages/BuyerPaymentSummary.tsx`
- **Remove** the disabled card input fields (lines 462-486) — Paystack handles card data securely
- **Remove** the billing address section (lines 523-560) — not needed for Paystack
- **Update** bank transfer selection to show it's available (remove "coming soon")
- **Load** `https://js.paystack.co/v1/inline.js` dynamically on mount
- **Replace `handlePay`** with real flow:
  1. Call `initiate-paystack-payment` via `supabase.functions.invoke()`
  2. Open `PaystackPop.setup({ key, access_code, callback, onClose })`
  3. `callback`: call `verify-paystack-payment` → show success modal
  4. `onClose`: reset processing state, show info toast
  5. Errors: show failed modal with error details
- **Add `failureReason` state** to display specific Paystack error in failed modal

### 5. Update `supabase/config.toml`
Add three function configs:
```toml
[functions.initiate-paystack-payment]
verify_jwt = false

[functions.verify-paystack-payment]
verify_jwt = false

[functions.paystack-webhook]
verify_jwt = false
```

## State Machine Compliance
The `money_status` validator requires two steps:
1. `not_secured` → `payment_pending` (during initiate)
2. `payment_pending` → `funds_held_in_escrow` (during verify)

Transaction status: `awaiting_payment` → `payment_secured`

## No Database Migrations Needed
All tables (`payments`, `escrow_states`, `escrow_ledger_entries`, `transaction_agreement_snapshots`, `transaction_status_history`, `money_status_history`, `transaction_events`, `notifications`, `payment_webhook_logs`) already exist with correct schemas. All edge functions use the service role key, bypassing RLS.

## Files Summary

| File | Action |
|------|--------|
| `supabase/functions/initiate-paystack-payment/index.ts` | Create |
| `supabase/functions/verify-paystack-payment/index.ts` | Create |
| `supabase/functions/paystack-webhook/index.ts` | Create |
| `src/pages/BuyerPaymentSummary.tsx` | Edit |
| `supabase/config.toml` | Edit |

