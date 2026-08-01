# Correction 1 — consolidated remaining financial source-of-truth plan (Checkpoints A–H)

No implementation occurred in this response. Everything below comes from read-only inspection of the current repository and the connected database.

## 1. Verified current state (re-checked now, not assumed)

- Current HEAD: `4b3c6943` (2026-08-01 14:44 UTC), working tree clean. Baseline report `.lovable/reports/checkpoint-0-financial-baseline.md` re-read; its rollback commit `501f1ddf` is superseded by the Checkpoint 1 commit above.
- PostgreSQL 17.6 confirmed. `system_settings.release_review_target_hours = 24`, resolved dynamically via the settings resolver (`setting_key`/`setting_value`).
- Ledger table `escrow_ledger_entries`: `amount numeric` (major units, 2dp), nullable `balance_after`, nullable `reference_type`/`reference_id`, `metadata jsonb`, generated `is_cash_movement`. **No `idempotency_key` column exists.** 19 rows have `reference_id IS NULL`.
- Existing unique index `escrow_ledger_unique_cash_movement` covers only `payment_credit, escrow_hold, payout_debit, refund_debit` where `reference_id` is not null.
- Entry-type vocabulary (11 values): `payment_credit, escrow_hold, freeze_hold, payout_debit, refund_debit, fee_record, adjustment, payout_awaiting_release, dispute_refund_reserved, dispute_release_approved_pending_admin_release, dispute_no_action`.
- Money RPCs present: `release_payout_atomic, complete_payout_atomic, fail_payout_atomic, retry_payout_atomic, reverse_payout_atomic, start_refund_atomic, complete_refund_atomic, fail_refund_atomic, freeze_funds_atomic, unfreeze_funds_atomic, flag_for_release_review, escrow_available_balance, admin_financial_reconciliation(+_summary), admin_orphan_completed_payouts, admin_reconciliation_mismatches, admin_escrow_records_page, admin_escrow_kpis`.
- Writers (RPC callers): `_shared/release-core.ts` (release, fail payout, start refund, fail refund), `paystack-webhook` (complete/fail/reverse payout, complete/fail refund), `retry-payout`, `admin-transaction-actions` (freeze/unfreeze), `resolve-release-review` (freeze).
- Direct ledger writers/readers: `verify-paystack-payment`, `paystack-webhook`, `seller-confirm-completion`, `reconcile-escrow`, plus read-only `admin-transaction-detail`, `admin-escrow-detail`, `admin-escrow-overview`, `admin-export-transaction-data`.
- `_shared/financial-model.ts` (693 lines, from Checkpoint 1) still has **zero runtime consumers**.
- Reconciliation growth confirmed: 3,762 result rows across 1,179 runs for a handful of transactions — the hourly cron (`reconcile-escrow-hourly @ 7 * * * *`, single schedule) writes a new finding row per run instead of updating one active finding. `escrow_reconciliation_results` is uniquely keyed on `(transaction_id, run_id)`, so history is preserved but active-state dedup does not exist.
- Volumes: 21 transactions, 44 ledger rows, 5 payouts, 1 refund.

Dependency order note: Checkpoint E (reconciliation foundation) is kept before F (consumer migration) as requested; no safer reordering was found.

## 2. Checkpoints

### A — Fresh preflight and change map
Re-verify HEAD/diff, schema, constraints, RLS, grants, cron and settings at execution time; emit the exact file/migration/RPC change list, lock analysis and current non-sensitive counts into `.lovable/reports/checkpoint-a-change-map.md`.
Gate: stop if schema or working tree contradicts section 1.
Rollback: none (read-only).

### B — Idempotency schema foundation
Migration (additive only):
- `ALTER TABLE public.escrow_ledger_entries ADD COLUMN idempotency_key text` (nullable; may briefly take ACCESS EXCLUSIVE — run with `lock_timeout`).
- `CREATE UNIQUE INDEX escrow_ledger_idem_key ON public.escrow_ledger_entries (idempotency_key) WHERE idempotency_key IS NOT NULL`. A normal CREATE INDEX takes a SHARE lock: reads allowed, writes blocked for the build; the table has 44 rows so the build is instantaneous. `CONCURRENTLY` is not used because the migration runner wraps statements in a transaction.
- No backfill of historical rows.
Gate: column/index present, no duplicate non-null keys, RLS/grants unchanged, suite green.
Rollback: `DROP INDEX escrow_ledger_idem_key; ALTER TABLE ... DROP COLUMN idempotency_key;` (no data touched).

### C — Deterministic writer idempotency
Integrate `financial-model.ts` into every writer above. Key format `<domain>:<operation>:<transaction_id>:<stable_operation_id>:<entry_type>` where the stable operation ID is an immutable business row ID (payment id, payout id, refund id, dispute outcome id, admin action id) — never timestamps, randoms or attempt counters.
Files: `_shared/release-core.ts`, new thin helper `_shared/financial-writer.ts` (key derivation + conflict detection), `paystack-webhook`, `retry-payout`, `verify-paystack-payment`, `seller-confirm-completion`, `admin-transaction-actions`, `resolve-release-review`.
Same key + same canonical payload returns the existing result. Same key + different payload fails closed and records an auditable conflict. No `item_amount`/absent-snapshot fallback for mutations.
Gate: retry and concurrency tests yield exactly one ledger movement and one business outcome.
Rollback: revert function code (schema untouched).

### D — Database invariants and atomic balance enforcement
Migration:
- Trigger `escrow_ledger_require_idem` on insert: require a non-null `idempotency_key` for value-affecting types using an explicit `NEW.entry_type IN (...)` list aligned with `VALUE_AFFECTING_TYPES` (excludes `fee_record` and the informational dispute markers), not the generated column.
- Balance guards inside `start_refund_atomic`, `complete_refund_atomic`, `release_payout_atomic`, `retry_payout_atomic`, `reverse_payout_atomic`: `SELECT ... FOR UPDATE` on the transaction row first, then the payout/refund row, then `escrow_available_balance`; reject amounts exceeding available escrow, duplicate finalization and conflicting terminal states. Documented lock order: transactions → payouts/refunds → ledger insert.
- Keep pending / failed / completed settlement amounts separate; no double counting of escrow funding vs remaining balance. Append-only history preserved.
Gate: SQL tests for over-refund, over-release, duplicate operations, concurrency, adjustment/reversal signs, pending/failed/completed payouts, and existing valid flows.
Rollback: captured `pg_get_functiondef` text for each replaced function, plus `DROP TRIGGER`.

### E — Reconciliation foundation
- New `reconciliation_runs` table (run id, started_at, heartbeat_at, finished_at, status, lease owner) with an atomic lease-claim RPC; the Edge Function heartbeats for the whole run so the lease outlives any single transaction. Overlapping runs exit cleanly.
- New `reconciliation_findings` table: one active finding per `(transaction_id, rule, severity)` with `first_seen, last_seen, occurrence_count, owner, severity, status, resolution_proof, closed_at`. `escrow_reconciliation_results` history retained untouched.
- Auto-close only when a later authoritative run proves the condition cleared (proof stored).
- One shared summary path (`admin_financial_reconciliation_summary` + `_shared/reconciliation.ts`) consumed by both Dashboard and Escrow; service-role boundary and grants preserved.
Gate: overlapping-run, retry, dedup, proof-closure and Dashboard/Escrow parity tests.
Rollback: drop the two new tables and the lease RPC; the current cron path keeps working.

### F — Canonical read service and controlled consumer migration
- New `_shared/financial-read.ts` aggregation over the canonical model and authoritative RPCs; frontend contract in `src/services/financial-model.service.ts`.
- Pilot on `admin-transaction-detail` behind the existing system-settings feature-flag pattern, with legacy-vs-canonical diff diagnostics (no sensitive data). Require zero-minor-unit difference on clean reconciled transactions before expanding.
- Migration order: Transactions list/detail → Disputes → Escrow and release/refund queues → Payouts (`admin-payouts-list`, `admin-payouts-detail`; correct payout ID, transaction, item, seller, payout-account owner, gross, deductions, net, status, timestamps) → Flagged Users → Dashboard → exports (`admin-export-worker`, `admin-export-transaction-data`, `admin-escrow-export`) → audit summaries.
- Summary cards recomputed from the same filtered record set, or explicitly labelled all-time. Completed payouts without a valid completion timestamp render "Unavailable" and are marked `requires_review`.
- Existing dark admin design, routes and components preserved; loading, empty, retry, access-denied and error-boundary states kept.
Gate: per-consumer parity, route, permission and flag-rollback tests; no console/network regressions.
Rollback: flip the flag off per consumer.

### G — Admin remediation and review workflow
Extend the existing **Financial remediation** tab on `/admin/reconciliation`: stored vs canonical vs difference, affected records/screens, severity, evidence, recommended compensating action and status; per-record dry-run preview that writes nothing. Apply authority uses the immutable Super Admin role key plus the existing `financial_controls` effective permission — never a display label, and no permission is broadened. Apply is not executed during the build or verification. Any future apply appends compensating entries with deterministic idempotency key, reason, actor, correlation ID, before/after evidence and an audit event. No bulk fix-all action.
Gate: unauthorized-role denial, dry-run repeatability, zero-write proof, idempotent apply simulation, audit completeness.
Rollback: hide the apply action; the report stays read-only.

### H — Final verification and handoff
Typecheck, lint, production build and full test suite; migration preflight/postflight of constraints, functions, triggers, RLS and grants; re-enumerate financial writers to prove none bypass canonical guards; verify canonical values for the known inconsistent transactions (SD-2026-000019/21/23/24) and representative clean transactions across Transactions, Disputes, Escrow, Payouts, Flagged Users, Dashboard, exports and audit records; verify the Dashboard mismatch count and compliance state exactly match Escrow under identical filters; exercise full release, partial refund, full refund, failed payout, retry, adjustment, reversal, mismatch, concurrent duplicate submission and completion-timestamp behaviour; confirm no historical deletion, silent rewrite, secret exposure, blank screens, dead routes, console errors or repeated network loops. Then deliver the implementation report, changed files/migrations/functions, verification evidence, non-applied remediation items and a role-based UI smoke-test guide, and stop.

## 3. Data and permission impact
- Schema: one nullable column, one partial unique index, one insert trigger, two new reconciliation tables, guarded rewrites of eight existing money RPCs. No historical row is modified or deleted.
- Permissions: reuses `financial_controls.view` and the existing mutation key; no role gains new authority.

## 4. Test matrix
Unit (canonical model, key derivation, decimal parser) · writer idempotency/retry/conflict · SQL invariants (over-refund, over-release, duplicate finalization, concurrency, sign correctness) · reconciliation (lease overlap, dedup, proof closure, Dashboard/Escrow parity) · per-consumer parity · permission/route/error-boundary · export column fidelity.

## 5. Expected UI impact
No visual redesign. Money figures become consistent across Transactions, Disputes, Escrow, Payouts, Flagged Users, Dashboard and exports; payout detail fields corrected; missing completion timestamps show "Unavailable"; the remediation tab gains dry-run detail.

## 6. Exclusions and blockers
Excluded: publishing or deploying, bulk historical remediation, destructive data change, non-NGN currency work, and any Correction 2 scope. Flagged rather than assumed: the 3-row `adjustment`/`admin_unfreeze` anomaly and the 19 null-`reference_id` ledger rows are routed to remediation review, not migrated or rewritten.