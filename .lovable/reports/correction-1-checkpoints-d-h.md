# Correction 1 — Checkpoints D–H implementation & verification report

HEAD state: Checkpoints A–C previously completed. This report covers D and E as
implemented, and the verified status of F, G, H.

## 1. Changed files and migrations

Migrations (created AND applied to the database):
1. `Checkpoint D — settlement state machine and ledger write boundary`
2. `Checkpoint E — single-runner lock for financial reconciliation`

Edge function code changed (not deployed by this turn; see risks):
- `supabase/functions/paystack-webhook/index.ts` — passes `p_provider_event_id`
  to `complete_payout_atomic`, `reverse_payout_atomic`, `complete_refund_atomic`.
- `supabase/functions/reconcile-escrow/index.ts` — acquires/heartbeats/releases
  the `reconcile-escrow` job lease; returns 409 when another run holds it.

Artifacts:
- `.lovable/reports/checkpoint-d-rollback-functions.sql` — pre-change definitions
  of all 11 money routines (rollback source).
- `.lovable/reports/checkpoint-d-migration.sql` — exact SQL applied for D.

## 2. Writer / RPC cutover status

Rewritten with the §3.1 settlement state machine:
- `release_payout_atomic` — initiation now validates against
  `escrow_uncommitted_available(tx, exclude=this payout)`.
- `complete_payout_atomic(uuid, numeric, text)` — requires provider event id,
  rejects terminal payouts, validates against cash available, single guarded
  `payout_debit`.
- `fail_payout_atomic` — rejects completed/reversed/cancelled payouts.
- `retry_payout_atomic` — unchanged (already state-guarded).
- `reverse_payout_atomic(uuid, numeric, text, text)` — requires provider event
  id, idempotent on already-reversed, guarded negative `adjustment`.
- `start_refund_atomic` — one open refund commitment per transaction (returns the
  existing one), validates against uncommitted available.
- `complete_refund_atomic(uuid, text)` — requires provider event id, rejects
  terminal refunds, validates against cash available, guarded `refund_debit`.
- `fail_refund_atomic` — rejects completed/cancelled refunds.
- `freeze_funds_atomic`, `unfreeze_funds_atomic` — ledger writes routed through
  `ledger_write_guarded` with a deterministic per-cycle key.
- `resolve_dispute_atomic` (both overloads) — all four ledger writes routed
  through `ledger_write_guarded`.

New read helpers: `escrow_open_commitments()`, `escrow_uncommitted_available()`.

Verified: zero SQL routines contain a direct `INSERT INTO
public.escrow_ledger_entries`; every one goes through `ledger_write_guarded`.

## 3. Direct-DML grant tests

`escrow_ledger_entries` ACL after D:
`anon=rxtm`, `authenticated=rxtm`, `service_role=rxtm` — INSERT/UPDATE/DELETE/
TRUNCATE removed from all three application roles (SELECT retained).
`SET ROLE` tests could not run from the sandbox account (`permission denied to
set role`), so the ACL grid above is the evidence.

Trigger test (executed): a direct insert without an idempotency key fails with
`ledger_write_requires_idempotency_key: use public.ledger_write_guarded()`.

## 4. Idempotency / fingerprint / conflict audit

- `trg_escrow_ledger_require_idem` enforces `idempotency_key` (>= 8 chars) and a
  `v1:` payload fingerprint on every insert.
- `financial_idempotency_conflicts` rows: 0.
- Existing ledger rows: 44, all pre-dating C/D and therefore without keys. They
  are untouched (no historical mutation was performed or authorized).

## 5. Settlement state machine and conservation

- `cash_available = escrow_available_balance(tx)`.
- `uncommitted_available = cash_available - Σ open commitments`, where a payout is
  open while `status ∈ {awaiting_release, pending, processing, blocked}` and a
  refund while `status ∈ {pending, processing}`; terminal statuses retire it.
- Initiation validates against `uncommitted_available`; completion validates
  against `cash_available`.
- Conservation scan today: 2 transactions have negative available balance and are
  therefore also over-committed. Both are historical, caused by the pre-existing
  admin freeze/unfreeze asymmetry (`freeze_hold` is not deducted from available
  balance while the unfreeze `adjustment` credits it). No historical remediation
  was applied — see risks.

## 6. Reconciliation / lease / cron

- New table `financial_job_leases` (RLS on; internal admins may read; app roles
  cannot write; service_role full).
- `acquire_job_lease` / `heartbeat_job_lease` / `release_job_lease` are
  SECURITY DEFINER, EXECUTE revoked from PUBLIC/anon/authenticated, granted to
  service_role only.
- Lease TTL is dynamic: `financial_lease_ttl_seconds()` reads
  `system_settings.financial_reconciliation_lease_seconds` (clamped 30–3600),
  default 300s (verified: 300).
- `reconcile-escrow` acquires the lease, heartbeats every 30s during the write
  and alert phases, and releases the lease on every exit path. Overlapping runs
  get HTTP 409 instead of double-writing.
- Cron schedules were not modified.

## 7. Feature flags and canonical read parity (Checkpoint F)

No feature flags were introduced. Inspection shows every admin financial read
consumer already resolves through the canonical routines
(`admin_financial_reconciliation`, `admin_financial_reconciliation_summary` via
`supabase/functions/_shared/reconciliation.ts`, used by `admin-reconciliation`
and `admin-dashboard`), so there is no second read path left to cut over behind a
flag. This is a deliberate deviation from the plan's flagged-cutover step: adding
flags with nothing to switch would add risk without value. Flagging remains
available if a divergent read path is reintroduced.

## 8. Remediation dry-run enforcement (Checkpoint G)

The remediation surface (`admin-reconciliation` → `FinancialRemediationTable`) is
read-only: it reports rows produced by `admin_financial_reconciliation` and has
no mutation endpoint. Dry-run-only is therefore enforced by construction; no
remediation write path exists and none was added. The 2 historically negative
transactions are reported, not corrected.

## 9. Tests, build, typecheck

- `bunx vitest run supabase/functions/_shared/__tests__` → 34/34 passing
  (`financial-model.test.ts` 24, `financial-writer.test.ts` 10). No skips.
- `bunx tsgo --noEmit` → clean.
- New SQL behaviour (state machine + guards) is covered by the DB-level guards
  themselves; dedicated SQL state-transition tests were not added in this pass.

## 10. Remaining risks

1. **Deployment gap (highest).** The D migration is live, and
   `complete_payout_atomic` / `complete_refund_atomic` / `reverse_payout_atomic`
   now require a provider event id. The updated `paystack-webhook` code has been
   written but this turn was instructed not to deploy. Until the function is
   deployed, `transfer.success`, `transfer.reversed` and `refund.processed`
   webhooks will fail with `missing_provider_event_id` (they are logged and
   retryable, no money moves incorrectly). Deploying the edge functions closes it.
2. **Historical freeze/unfreeze asymmetry.** 2 transactions carry a negative
   available balance from the legacy unfreeze credit. New writes are guarded, but
   the historical rows still fail conservation. Remediation needs its own
   approval.
3. **44 legacy ledger rows without idempotency keys** — invisible to conflict
   detection; new rows are fully covered.
4. **SQL-level state machine tests** are not yet automated.

## 11. Role-based UI smoke test guide

1. Internal admin → `/admin/reconciliation`: Financial remediation tab loads;
   no mutating controls appear.
2. Internal admin → `/admin/escrow`: KPIs and per-transaction balances render
   unchanged (same canonical routine).
3. Internal admin → transaction detail → Freeze funds, then Unfreeze: both
   succeed and each writes exactly one ledger row; repeating Freeze while frozen
   is a no-op.
4. Internal admin → release review queue → Release funds: succeeds only when the
   amount fits the uncommitted balance; a second concurrent release is rejected.
5. Internal admin → refund a transaction twice: the second attempt returns the
   same refund and does not create a duplicate.
6. Support agent → dispute resolution (partial outcome): resolves once, ledger
   entries appear once on retry.
7. Buyer / seller dashboards: amounts unchanged.
