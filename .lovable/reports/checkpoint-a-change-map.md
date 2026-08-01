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

## Checkpoint C — completed

- SQL: `canonical_payload_v1`, `canonical_fingerprint_v1` (v1 = `v1:` + sha256 of flat sorted `key=value` lines), `ledger_write_guarded`, `record_payment_capture_atomic` (#12), `record_completion_release_intent_atomic` (#13). All `SECURITY DEFINER`, execute revoked from `anon`/`authenticated`, granted to `service_role` only.
- Guard semantics: same key + same fingerprint → `duplicate` (no second movement); same key + different fingerprint → durable row in `financial_idempotency_conflicts` and the calling routine raises, so nothing is written.
- TS twin: `supabase/functions/_shared/financial-writer.ts` (canonical form, `toMinorUnits`, `buildIdempotencyKey`) with SQL-generated golden vectors in `__tests__/financial-writer.test.ts` (10 tests, passing alongside the 24 financial-model tests).
- Callers cut over (no direct ledger DML remains in edge functions): `verify-paystack-payment`, `paystack-webhook` (both → #12, keyed on the Paystack event id), `seller-confirm-completion` (both payout paths → #13, keyed on the seller confirmation id; commitment only, never a debit).
- `vitest.config.ts` now includes `supabase/functions/**/*.test.ts` and excludes the Deno-only `pricing.parity.test.ts`.

Next: Checkpoint D — rewrite the remaining money RPCs (#1–#10) on top of `ledger_write_guarded` and revoke direct ledger DML from application roles.
