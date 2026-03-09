

# Plan: Paystack Payment Integration for SafeDeal Escrow

## Overview
Integrate Paystack Inline Popup for real payment processing. This is Phase 1: Payment Collection. Seller payout (Transfers API) and buyer refund (Refunds API) are future phases.

## Your API Keys
You need **two keys** from your **Paystack Dashboard → Settings → API Keys & Webhooks**:

| Key | Purpose | Format |
|-----|---------|--------|
| **PAYSTACK_SECRET_KEY** | Server-side API calls + webhook HMAC | `sk_live_...` or `sk_test_...` |
| **PAYSTACK_PUBLIC_KEY** | Frontend popup initialization | `pk_live_...` or `pk_test_...` |

**Recommendation**: Start with **test keys** to validate the flow.

---

## Money Architecture (Aligned with Your Guide)

```text
┌─────────────────────────────────────────────────────────────────┐
│                    SAFEDEAL ESCROW MODEL                        │
├─────────────────────────────────────────────────────────────────┤
│  Buyer pays ₦103,500 (item ₦100k + fee ₦3.5k)                   │
│       ↓                                                         │
│  SafeDeal receives FULL AMOUNT (no split)                       │
│       ↓                                                         │
│  Escrow ledger records:                                         │
│    • payment_credit: ₦103,500                                   │
│    • fee_record (paystack): ₦1,550                              │
│    • fee_record (platform): ₦1,950                              │
│    • escrow_hold (seller principal): ₦100,000                   │
│       ↓                                                         │
│  LATER (Phase 2): Buyer confirms → POST /transfer to seller     │
│  OR: Dispute → POST /refund to buyer                            │
└─────────────────────────────────────────────────────────────────┘
```

**Key principle**: No Paystack split payments. Full amount to SafeDeal, payout via Transfers later.

---

## Database Assessment

### Tables Already Exist (No Migration Needed)
All required tables exist with correct structure:
- `payments` — buyer payment attempts
- `escrow_states` — current escrow snapshot
- `escrow_ledger_entries` — immutable audit trail
- `payouts` — seller transfers (Phase 2)
- `refunds` — buyer refunds (Phase 2)
- `payment_webhook_logs` — webhook audit log
- `transaction_pricing` — fee breakdown

### Existing Ledger Entry Types (Sufficient)
Current enum values map to the user's recommended entries:
| User's Recommended | Existing Enum | Usage |
|--------------------|---------------|-------|
| `buyer_payment_received` | `payment_credit` | Total amount received |
| `paystack_processing_fee_recorded` | `fee_record` | Paystack fee |
| `platform_fee_recorded` | `fee_record` | Platform fee |
| `seller_principal_held` | `escrow_hold` | Item amount held |
| `funds_frozen` | `freeze_hold` | Dispute freeze |
| `seller_payout_*` | `payout_debit` | Phase 2 |
| `buyer_refund_*` | `refund_debit` | Phase 2 |

---

## State Machine Transitions

The money_status validator requires two steps:
1. `not_secured` → `payment_pending` (initiate)
2. `payment_pending` → `funds_held_in_escrow` (verify)

Transaction status: `awaiting_payment` → `payment_secured`

---

## Implementation

### 1. Request Secrets
Both `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` are needed before implementation.

### 2. Create `supabase/functions/initiate-paystack-payment/index.ts`
- **Auth**: JWT required (validate buyer)
- **Flow**:
  1. Resolve shareToken → transaction via service client
  2. Verify status = `awaiting_payment`, money_status = `not_secured`
  3. Verify caller is the buyer
  4. Compute pricing using shared `computePricing()` helper
  5. Generate unique reference: `SD-{txCode}-{timestamp}`
  6. Transition money_status: `not_secured` → `payment_pending`
  7. Insert `payments` record (status: `pending`)
  8. Insert `money_status_history` record
  9. Call Paystack `POST /transaction/initialize` with:
     - `amount`: total in kobo (×100)
     - `email`: buyer email
     - `currency`: "NGN"
     - `channels`: ["card"] or ["bank"] based on method
     - `metadata`: { transaction_id, share_token, buyer_user_id }
  10. Return `{ access_code, reference, public_key }`

### 3. Create `supabase/functions/verify-paystack-payment/index.ts`
- **Auth**: JWT required
- **Flow**:
  1. Call Paystack `GET /transaction/verify/{reference}`
  2. **Idempotency**: if payment.status already `succeeded`, return success
  3. On Paystack success — atomic updates:
     - `payments.status` → `succeeded`, `captured_at`, `raw_payload`
     - `transactions.status` → `payment_secured`
     - `transactions.money_status` → `funds_held_in_escrow`
     - `transactions.agreement_locked_at` → `now()`
     - `transactions.payment_received_at` → `now()`
     - `escrow_states.state` → `held`, `held_amount` = item_amount
     - Create 4 ledger entries:
       - `payment_credit` (total)
       - `fee_record` (paystack fee)
       - `fee_record` (platform fee)
       - `escrow_hold` (seller principal = item_amount)
     - `transaction_status_history` record
     - `money_status_history` record
     - `transaction_agreement_snapshots` (lock item/pricing/delivery/notes/media)
     - `transaction_events` (type: payment_received)
     - Seller notification
  4. On failure: update payment to `failed`, revert money_status → `not_secured`

### 4. Create `supabase/functions/paystack-webhook/index.ts`
- **Auth**: No JWT — HMAC signature verification
- **Flow**:
  1. Verify `x-paystack-signature` using HMAC-SHA512 with secret
  2. Log ALL events to `payment_webhook_logs`
  3. On `charge.success`: run same idempotent verification logic
  4. Return 200 immediately (Paystack requires quick response)

### 5. Update `src/pages/BuyerPaymentSummary.tsx`
- **Remove**: disabled card input fields and billing address section (Paystack handles securely)
- **Keep**: payment method selection (card/bank)
- **Load**: `https://js.paystack.co/v1/inline.js` dynamically
- **Update handlePay**:
  ```typescript
  const { data } = await supabase.functions.invoke("initiate-paystack-payment", {
    body: { shareToken, paymentMethod: selectedMethod }
  });
  
  const handler = PaystackPop.setup({
    key: data.public_key,
    access_code: data.access_code,
    callback: async (response) => {
      await supabase.functions.invoke("verify-paystack-payment", {
        body: { reference: response.reference, shareToken }
      });
      setShowSuccess(true);
    },
    onClose: () => setIsProcessing(false)
  });
  handler.openIframe();
  ```
- **Success modal**: navigate to `/t/${shareToken}/agreement`

### 6. Update `supabase/config.toml`
```toml
[functions.initiate-paystack-payment]
verify_jwt = false

[functions.verify-paystack-payment]
verify_jwt = false

[functions.paystack-webhook]
verify_jwt = false
```

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/functions/initiate-paystack-payment/index.ts` | Create |
| `supabase/functions/verify-paystack-payment/index.ts` | Create |
| `supabase/functions/paystack-webhook/index.ts` | Create |
| `src/pages/BuyerPaymentSummary.tsx` | Edit — remove card inputs, add Paystack popup |
| `supabase/config.toml` | Edit — add 3 function configs |

**No database migrations needed** — all tables and enums are already in place.

---

## Security Safeguards
1. **Never trust frontend**: Always verify via Paystack API + webhook backup
2. **Idempotent processing**: Check payment.status before updates
3. **HMAC verification**: Webhook signature validated before processing
4. **Unique references**: `SD-{txCode}-{timestamp}` prevents replay attacks
5. **JWT validation**: Only authenticated buyer can initiate payment

---

## Future Phases (Not This Ticket)
- **Phase 2**: Seller payout via `POST /transfer` after buyer confirms
- **Phase 3**: Buyer refund via `POST /refund` for disputes
- **Phase 4**: Seller recipient creation during onboarding (`POST /transferrecipient`)

