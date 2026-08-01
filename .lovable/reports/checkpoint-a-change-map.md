# Checkpoint A — preflight and change map

Read-only. No schema, data, code or deployment change in this checkpoint.

## Repository
- HEAD `f9c9ec2268a5c66dfcdfd9adaef538d791136670` (2026-08-01T15:37:36Z), clean tree. Rollback point for Correction 1.

## Database (re-verified)
- `escrow_ledger_entries` columns: id, transaction_id, entry_type (enum), currency_code, amount (numeric), balance_after, reference_type, reference_id, notes, created_by_user_id, created_at, metadata, is_cash_movement (generated).
- No `idempotency_key` / `payload_fingerprint` column present (count = 0) — Checkpoint B is additive as planned.
- relacl: `postgres=arwdDxtm | anon=arwdDxtm | authenticated=arwdDxtm | service_role=arwdDxtm | sandbox_exec=ar`. Direct DML is open to all application roles; Checkpoint D revoke is required and unchanged.
- Triggers: `prevent_escrow_ledger_delete` only.
- Cron: single `reconcile-escrow-hourly @ 7 * * * *`.
- Volumes: 21 transactions, 44 ledger rows, 5 payouts, 1 refund, 3,762 reconciliation result rows.

## Settlement semantics (matches plan §3.1, no contradiction)
- `release_payout_atomic` writes no ledger row; `complete_payout_atomic` writes the only `payout_debit`.
- `start_refund_atomic` writes no ledger row; `complete_refund_atomic` writes the only `refund_debit`; `fail_refund_atomic` writes no ledger row.
- Commitment entries today: 1 `payout_awaiting_release`, 2 `dispute_release_approved_pending_admin_release`, 0 `dispute_refund_reserved`.
- No immediate-terminal release branch exists. Approval and settlement are already mutually exclusive.

## Direct ledger DML in application code (exhaustive)
- `supabase/functions/verify-paystack-payment/index.ts:193`
- `supabase/functions/paystack-webhook/index.ts:188`
- `supabase/functions/seller-confirm-completion/index.ts:297`
- `supabase/functions/seller-confirm-completion/index.ts:354`

All four are replaced by RPCs #12 and #13 in Checkpoint C, so the Checkpoint D revoke has no remaining dependency. No writer outside plan §3 was found.

## Lease default
No instrumented wall-time sample is available for `reconcile-escrow` (row timestamps are per-run). Default `finance.reconciliation_lease_timeout_seconds = 300` (the plan's floor), bounded 60..3600, revisited once a measured run exists.

## Gate result
PASS — schema, grants, triggers, cron, volumes and writer inventory all match the approved plan. Proceeding to Checkpoint B.
