# Financial source of truth — revised completion plan (checkpointed)

Plan only. Nothing is built, migrated, published or pushed until you approve each checkpoint.

## 1. Current-state findings (verified this turn)

**Exists and works — preserve**
- `supabase/functions/_shared/reconciliation.ts` (single reader: rows, summary, `ISSUE_CATALOG`, `toRemediationRows`).
- DB routines applied: `admin_financial_reconciliation(_since,_only_issues)`, `admin_financial_reconciliation_summary(_since)`, `escrow_available_balance(uuid)`, `admin_duplicate_ledger_entries`, `admin_orphan_completed_payouts`, `admin_reconciliation_mismatches`. EXECUTE granted to `service_role` only.
- Migration `20260801130434_*.sql` applied: `escrow_ledger_entries.is_cash_movement` generated column, unique index `escrow_ledger_unique_cash_movement (transaction_id, entry_type, reference_type, reference_id) WHERE reference_id IS NOT NULL AND entry_type IN (payment_credit, escrow_hold, payout_debit, refund_debit)`, `escrow_ledger_tx_type_idx`, and `complete_payout_atomic` with an escrow-balance guard plus released/held accounting on completion only.
- `admin-dashboard`, `admin-escrow-overview`, `admin-reconciliation` share the one routine.
- `FinancialRemediationTable` + Financial Remediation tab on `/admin/reconciliation`.
- `admin-payouts-detail` timestamp fix; `release-core.ts` release-amount drift guard.
- Cron `reconcile-escrow-hourly` scheduled; results land in `escrow_reconciliation_results`.
- Git: clean tree, HEAD `745d1983`.

**Described but not actually wired**
- `_shared/financial-model.ts` is imported by **zero** files — `buildCanonicalFinancials`, `escrowBalanceMinor`, `canDisburse`, `payoutCompletionDisplay` are dead code today. Money is still derived per function in `admin-transaction-detail`, `admin-escrow-detail`, `admin-payouts-list/detail`, `admin-transactions-monitor`, `admin-disputes-queue`, `dispute-detail`, `admin-user-detail`, `admin-export-worker`, `admin-export-transaction-data`, `seller-payouts`, `transaction-detail`.
- No tests for the model (`_shared/__tests__` holds only `pricing.parity.test.ts`).
- Remediation tab is read-only: no drill-down, filters, dry-run, lifecycle actions, CSV.
- `reconcile-escrow` has no run header, no finding dedupe, no last-success health strip.
- No idempotency key on ledger writes; duplicate safety depends on callers always passing `reference_id`.
- `complete_refund_atomic` / `start_refund_atomic` have no escrow-balance guard.

**Config sources confirmed** — `system_settings.release_review_target_hours = 24`, `escrow_alert_thresholds`, `payout_max_retry_attempts = 3`, `timeout_rules.hours_until_trigger`. SLA values will be read through the existing settings resolver, never hardcoded in UI.

**Permissions confirmed** — the `financial_controls` module exposes `view, create, approve, reject, configure, export`. There is **no** existing apply/remediate mutation key. `financial_controls.approve` and `.configure` are already classified as HIGH permissions.

**Read-only validation records** — SD-2026-000019, 000021 (released), 000023 (held), 000024 (pending release, payout failed), 000002 (held 1,248,000 with only 2 ledger rows), 000003/000004 (resolved, still `funds_pending_release`).

## 2. Confirmed completed work to preserve
Everything in the first bullet block above, plus all existing roles, permission keys, routes, tables, drawers, dialogs, filters, dark admin styling, loading/error patterns and the single escrow ledger.

## 3. Remaining gaps
**P0** — (1) canonical model unused by every consumer; (2) no idempotency key on ledger writes; (3) refund path has no balance guard; (4) status contradictions unmapped (resolved + pending release, escrow released vs payout pending/failed, completed payout without timestamp).

**P1** — (5) remediation workflow incomplete; (6) scheduled reconciliation lacks run header/dedupe/health; (7) exports and audit rows not canonical.

**P2** — (8) no model/parity tests; (9) duplicate frontend money formatting.

## 4. Idempotency migration design (corrected)

- Add `escrow_ledger_entries.idempotency_key text NULL`. Historical rows keep `NULL` and are never written to.
- **Preflight (read-only, reported before the migration is proposed):** count rows, count `reference_id IS NULL` cash rows, and list any `(transaction_id, entry_type, reference_type, reference_id)` group with `count > 1` to prove `escrow_ledger_unique_cash_movement` has no conflict.
- Index: `CREATE UNIQUE INDEX IF NOT EXISTS escrow_ledger_idem_key ON public.escrow_ledger_entries (idempotency_key) WHERE idempotency_key IS NOT NULL;`
- **CONCURRENTLY:** the Supabase migration runner executes each migration inside a transaction, and `CREATE INDEX CONCURRENTLY` cannot run in a transaction block. It will therefore **not** be used. The plain partial index takes a short `ACCESS EXCLUSIVE` lock; at the current table size (low thousands of rows) that is sub-second. It is still applied as its own single-statement migration, at a low-traffic moment, with `SET lock_timeout = '3s'` so the migration fails fast rather than queueing behind a long transaction.
- **No backfill** of historical keys in this correction.
- `escrow_ledger_unique_cash_movement` is preserved. It is touched only if the preflight proves a conflict, and then only with that evidence documented in the migration.
- **Key strategy** (deterministic, stable across retries):
  - User actions: `tx:<transaction_id>:<entry_type>:<source_table>:<source_row_id>` (for example `payout:<payout_id>`), so a double click reuses the same key.
  - Scheduled jobs: `job:<job_name>:<transaction_id>:<entry_type>:<period_bucket>`.
  - Provider webhooks: `psk:<paystack_event_id_or_reference>:<entry_type>`.
- **Retry semantics:** every writer inserts with `ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`; when nothing is returned the writer re-reads the existing row by key and returns the original result with `idempotent: true` — the pattern `complete_payout_atomic` already uses.
- **Tests:** duplicate button submit, double job execution in one window, duplicate webhook delivery of the same Paystack event, and a retried failed payout — each must leave exactly one ledger movement.

## 5. Executable rollback policy

Every migration ships as a pair: the forward file under `supabase/migrations/` and executable rollback SQL under `supabase/rollback/` — not comments. For each `CREATE OR REPLACE FUNCTION`, the **current** definition is captured verbatim from `pg_get_functiondef` and written into the rollback file as runnable SQL before the forward migration is proposed.

| Object | Forward | Rollback | Pre-check | Post-check |
|---|---|---|---|---|
| `idempotency_key` column | `ADD COLUMN ... NULL` | `DROP COLUMN idempotency_key` | duplicate-group report | column exists, all rows NULL |
| `escrow_ledger_idem_key` | partial unique index | `DROP INDEX` | non-null key duplicates = 0 | index valid, size |
| Refund guards | `CREATE OR REPLACE complete_refund_atomic` / `start_refund_atomic` | re-run captured prior `pg_get_functiondef` | capture current defs | guard raises on over-refund inside a rolled-back test transaction |
| `reconciliation_runs` | `CREATE TABLE` + GRANT + RLS + policy | `DROP TABLE` | table absent | insert/select as service_role |
| `reconciliation_findings` | `CREATE TABLE` + GRANT + RLS + policy + unique `(transaction_id, issue_key) WHERE status='open'` | `DROP TABLE` | table absent | dedupe index blocks a second open finding |
| RPC signatures | none changed; any new RPC is added under a new name | `DROP FUNCTION <new_name>` | n/a | existing callers still resolve the old signature |

Stop conditions: preflight finds duplicates, a post-check fails, or any consumer parity test fails → run the rollback file, restore prior function definitions, report, do not proceed. No migration updates a historical financial row; all data corrections go through the confirmed remediation flow.

## 6. Checkpoints

### Checkpoint 0 — Baseline and preservation (no mutations)
Record HEAD commit, applied migration list, reconciliation counts by status, the latest `escrow_reconciliation_results` run, and current behaviour notes for Dashboard, Escrow, Payouts and Reconciliation. Produce the full impact list.
*Unchanged:* everything. *Acceptance:* baseline document exists. *Rollback point:* `745d1983`. *Re-approval:* not needed.

### Checkpoint 1 — Canonical contract and tests
Files: `_shared/financial-model.ts` (additive only — add `amount_authorised`, `pending_release_amount`, `reconciliation_status`, `financial_execution_status`; no existing field renamed or removed) and new `_shared/__tests__/financial-model.test.ts`.
No consumer rewiring. *Acceptance:* new tests pass, typecheck clean, zero runtime change. *Rollback:* revert two files. *Re-approval:* recommended before Checkpoint 2.

### Checkpoint 2 — Ledger and atomic protection
Objects: `idempotency_key` column + partial unique index (section 4); refund and release balance guards added inside the existing atomic functions; writers updated incrementally (`paystack-webhook`, `release-core.ts`, `retry-payout`, `refund-transaction`, `complete_payout_atomic` callers).
*Acceptance:* duplicate click/job/webhook tests each produce one movement; over-refund and over-release raise; rollback rehearsed in a transaction. *Rollback:* section 5 table. *Re-approval:* required (schema change).

### Checkpoint 3 — Read-consumer migration
Pilot `admin-transaction-detail`: return canonical fields **alongside** the existing ones and diff old vs canonical for every live transaction before switching the UI. Then, one at a time: `admin-dashboard`, `admin-escrow-overview` / `admin-escrow-detail`, `admin-payouts-list` / `admin-payouts-detail`, `admin-disputes-queue` / `dispute-detail`, `admin-flagged-user-detail`, `admin-export-worker` / `admin-export-transaction-data`.
Response contracts stay backwards compatible; legacy fields are not removed in this plan. Frontend work is data-source only — no layout, route, style or component replacement. Every new query degrades to the existing empty/error state inside the existing error boundary, never a blank page.
*Acceptance:* per-consumer parity report shows zero unexplained differences; visuals unchanged. *Stop:* a parity failure halts that consumer; the previous one stays live. *Re-approval:* recommended after the pilot.

### Checkpoint 4 — Financial remediation workflow
Extend the existing tab and `FinancialRemediationTable` rather than replacing them: row drill-down drawer (stored vs canonical vs difference, cause, source records, recommended action), filter row (status, severity, cause, age, transaction, owner), dry-run preview, assign, propose, review, apply, dismiss-with-reason, reopen, mandatory reason, audit row, and CSV export through the existing admin export pattern. Built from the existing table, drawer, dialog, toast and filter components. No bulk historical correction.
*Acceptance:* dry-run writes nothing; apply is audited and idempotent; non-authorised roles see Apply disabled. *Re-approval:* required (mutation surface).

### Checkpoint 5 — Extend the existing scheduled reconciliation
Extend `reconcile-escrow` and the existing `reconcile-escrow-hourly` job only — no second schedule. Add a `reconciliation_runs` header (run id, started/ended, scope, checked, matched, mismatched, requires review, failed, error summary), finding dedupe (one open finding per `(transaction_id, issue_key)`), notification dedupe reusing the existing `orchestration_notification_dedupe` pattern, a last-successful-run and health strip on Escrow and Reconciliation, and a permission-controlled manual run. Reconciliation never mutates balances.
*Acceptance:* a rerun is a no-op for unchanged state; no duplicate findings or notifications. *Re-approval:* required (schema change).

### Checkpoint 6 — Cross-screen parity and regression
Wire audit rows and exports to canonical values, run the full test matrix, validate read-only against the records in section 1, and confirm Dashboard and Escrow counts agree and summary cards equal their filtered rows.

## 7. Remediation authority

No role is created or renamed. Enforcement is layered: UI capability check → edge-function `requirePermission` → SECURITY DEFINER RPC re-check → audit row.

| Role | View / investigate | Assign / propose | Apply correction |
|---|---|---|---|
| Super Admin | yes | yes | yes |
| Senior Admin | yes | yes | no — requires approval |
| Finance-focused role (existing `financial_controls.approve` holder) | yes | yes | no — requires approval |
| Support Agent / Dispute Agent / limited ops | only financial context already permitted | no | no |

Reads use the existing `financial_controls.view`. Propose, assign and dismiss reuse `financial_controls.create` and `financial_controls.reject`, which already exist in this module and are semantically correct — no unrelated key is repurposed. **Apply** has no exact existing key: it is gated to Super Admin by role for now, and `financial_controls.remediate` is listed only as a **proposed future permission requiring separate approval**. It is not created in this work, and Apply stays disabled for every non-Super-Admin.

## 8. Status and SLA rules

Eight statuses stay separate and are never merged in display: transaction lifecycle, payment, escrow, dispute, resolution outcome, release approval, payout execution, reconciliation.

`resolved + funds_pending_release`:
- **Normal** while `now() - resolved_at <= release_review_target_hours` (read from `system_settings` through the existing settings resolver; no UI hardcoding).
- **Requires review** past that SLA — creates or updates one active finding.
- **Mismatch** (severity by amount and cause) when the payout failed, no valid payout or release instruction exists, escrow says released while the payout is pending or failed, canonical values disagree with stored values, or the ledger balance contradicts the escrow state.
- A finding auto-resolves only when the underlying state becomes consistent; otherwise it is closed manually with a reason.

## 9. Tests
Vitest (model and classification): full release, partial refund, full refund, failed payout, safe retry, adjustment/reversal, over-release, over-refund, approval-then-failed-payout, completed payout without timestamp, SLA-window versus post-SLA classification.
Manual and integration: duplicate button submit, duplicate webhook delivery, duplicate job execution, Dashboard-to-Escrow parity, summary cards versus filtered rows, permission denial per role, dry-run versus apply, rollback rehearsal, error recovery without a blank page.
Read-only validation records: SD-2026-000019/21/23/24 plus 000002/000003/000004.

## 10. Acceptance criteria
One transaction shows identical figures and statuses on every screen and export; no page recomputes money; duplicate clicks, retries and webhook replays create no second movement; releases and refunds cannot exceed escrow; escrow reads released only after a completed payout; Dashboard and Escrow mismatch counts always agree; every correction is dry-run previewable, reasoned, audited and idempotent; no historical row changes without a confirmed authorised action; every migration has a rehearsed executable rollback.

## 11. Risks, assumptions, stop conditions
- The index build takes a brief exclusive lock; mitigated by a single-statement migration and `lock_timeout`.
- Historical rows keep `idempotency_key = NULL` and continue to rely on the existing cash-movement unique index.
- Assumption: `release_review_target_hours` is the correct SLA source for pending-release classification — please confirm.
- Stop conditions: preflight duplicates, a failed post-check, a consumer parity failure, or any test in section 9 failing.

## 12. Explicitly unchanged
Roles and permission names; the dark admin design system, layouts, routes, pages, tables, drawers, dialogs and filters; the single escrow ledger; buyer and seller pricing behaviour; historical financial rows; the existing hourly cron schedule; `escrow_ledger_unique_cash_movement`; all legacy response fields; no parallel service, ledger, permission system or reconciliation job; no automatic publish or Git push.