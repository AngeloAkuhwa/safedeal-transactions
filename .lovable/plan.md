

# Batch 3: Payments, Escrow, Ledger, Payouts, Refunds

## Enums (6 total, created first)

1. **payment_provider** — paystack, flutterwave, stripe, manual
2. **payment_status** — pending, authorized, succeeded, failed, refunded
3. **payment_method_type** — card, bank_transfer, wallet
4. **escrow_state** — awaiting_payment, held, frozen, releasing, released, refunded
5. **escrow_ledger_entry_type** — payment_credit, escrow_hold, freeze_hold, payout_debit, refund_debit, fee_record, adjustment
6. **payout_status** — pending, processing, completed, failed, cancelled
7. **refund_status** — pending, processing, completed, failed, cancelled

## Table Creation Order

1. **payments** — FK to `transactions` and `profiles`. Stores every payment attempt with provider details, `raw_payload` JSONB for provider response, unique `provider_reference`. Indexes on transaction_id, provider_reference, status, provider.

2. **payment_webhook_logs** — No FK (intentional: webhooks may arrive before/after records exist). Stores raw provider events with processing status. Indexes on provider, provider_reference, processed_successfully.

3. **escrow_states** — 1:1 with transaction (unique on `transaction_id`). Current money snapshot: held/frozen/released/refunded amounts. Index on state.

4. **escrow_ledger_entries** — Append-only ledger, FK to `transactions` and `profiles` (created_by). Each entry records type, amount, balance_after, and optional reference (reference_type + reference_id for linking to payments/payouts/refunds). Indexes on transaction_id, entry_type, created_at. No `updated_at` column — ledger entries are immutable.

5. **payouts** — FK to `transactions` and `profiles` (seller_id). Tracks seller money release lifecycle. Indexes on transaction_id, seller_id, status.

6. **refunds** — FK to `transactions`, `profiles` (buyer_id), and `payments` (nullable). Tracks buyer refund lifecycle. Indexes on transaction_id, buyer_id, status, payment_id.

## Key Design Decisions

- `escrow_ledger_entries` has no `updated_at` — it is an immutable append-only audit trail
- `payment_webhook_logs` has no FK constraints — webhooks must be storable regardless of whether the referenced payment exists yet
- `refunds.payment_id` is nullable — refunds may occur from escrow without a direct payment link (e.g., partial refunds, admin adjustments)
- All money columns use `numeric(18,2)`
- RLS enabled on all 6 tables, policies deferred
- `updated_at` triggers applied to: payments, escrow_states, payouts, refunds (not webhook_logs or ledger_entries)
- `ON DELETE CASCADE` from transactions for child tables; `ON DELETE SET NULL` for optional profile references

## Implementation

One database migration with all enums and 6 tables. A copy saved to `src/db/migrations/003_batch3_payments_escrow.sql`.

No UI or API code.

