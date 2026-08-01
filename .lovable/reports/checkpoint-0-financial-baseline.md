# Checkpoint 0 — Financial source of truth: read-only baseline

Date: 2026-08-01. No code, migration, data, deployment or Git change was made. All statements below come from read-only inspection.

## 1. Code baseline

- HEAD commit: `501f1ddf249911d5cea84029d2586e78e9900cbc` (2026-08-01 14:01:41 +0000). This is the rollback point for all later checkpoints (supersedes `745d1983` quoted in the plan).
- Migration files on disk: **146**. Latest applied financial migration: `20260801130434_3e4d701a-5165-4c3d-83c9-799d592fec28.sql`.
- `supabase/functions/_shared/financial-model.ts` remains imported by zero files (dead code, confirmed).

## 2. Database / environment

- PostgreSQL `17.6`. Lock behaviour to be re-verified in Checkpoint 2 preflight; `CREATE INDEX` takes a `SHARE` lock (reads allowed, writes blocked), `ALTER TABLE ... ADD COLUMN` may briefly take `ACCESS EXCLUSIVE`.
- `system_settings.setting_key = 'release_review_target_hours'` → `24`. Confirmed as the SLA source; read via the settings resolver, never hardcoded in UI.
- Note: `system_settings` columns are `setting_key` / `setting_value` (not `key` / `value`).

## 3. Volume snapshot

| Object | Count |
|---|---|
| `transactions` | 21 |
| `escrow_ledger_entries` | 44 |
| `payouts` | 5 |
| `escrow_reconciliation_results` | 3,756 |

## 4. Reconciliation state

- Results by status: `drift` 3,531, `ok` 225.
- Distinct transactions in drift: **3**.
- Last reconciliation write: `2026-08-01 13:07:02Z`; 6 rows written in the last 2 hours.
- Cron job present: `reconcile-escrow-hourly`, schedule `7 * * * *` (single schedule, as required).
- `admin_financial_reconciliation_summary` correctly rejects a non-service_role caller (`permission denied`), confirming EXECUTE is restricted to `service_role`.

## 5. Contradiction counts (current)

| Condition | Count |
|---|---|
| `resolved` + `funds_pending_release` | 2 |
| Completed payouts with no `released_at` | 1 |
| Payouts in `failed` / `pending` / `processing` | 4 |

## 6. Idempotency preflight (early result — action required at Checkpoint 2)

- `escrow_ledger_entries.idempotency_key` does **not** exist; index `escrow_ledger_idem_key` does **not** exist.
- `escrow_ledger_unique_cash_movement` exists.
- Rows with `reference_id IS NULL`: **19**.
- Duplicate `(transaction_id, entry_type, reference_type, reference_id)` groups: **1**
  - transaction `b1000001-0003-4000-8000-000000000003`, `entry_type = adjustment`, `reference_type = admin_unfreeze`, 3 rows, total 676,000.00.
  - This group is **not** blocked by `escrow_ledger_unique_cash_movement` (that index only covers `payment_credit, escrow_hold, payout_debit, refund_debit`), so it is not a conflict for the existing index — but it is a documented data anomaly to route through the remediation flow, not a migration fix.

## 7. Routines confirmed present

`admin_financial_reconciliation`, `admin_financial_reconciliation_summary`, `escrow_available_balance`, `complete_payout_atomic`, `complete_refund_atomic`, `start_refund_atomic` — all 6 present. Refund functions still lack escrow-balance guards (Checkpoint 2 scope).

## 8. Impact list for later checkpoints

- Edge functions still deriving money independently: `admin-transaction-detail`, `admin-escrow-detail`, `admin-payouts-list`, `admin-payouts-detail`, `admin-transactions-monitor`, `admin-disputes-queue`, `dispute-detail`, `admin-user-detail`, `admin-export-worker`, `admin-export-transaction-data`, `seller-payouts`, `transaction-detail`.
- Screens affected downstream: Dashboard, Escrow, Payouts, Reconciliation (incl. Financial Remediation tab), Disputes, Flagged Users, Transactions monitor, exports.
- Unchanged in this checkpoint: everything.

## 9. Status

Checkpoint 0 complete. Work stops here. Checkpoint 1 requires a new explicit approval.