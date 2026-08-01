# Financial source of truth — completion and verification plan

## 1. Current-state findings (verified against repo + database)

Verified by reading files and querying the live database this turn.

**Exists and works**
- `supabase/functions/_shared/reconciliation.ts` — single reconciliation reader (`fetchReconciliationRows`, `fetchReconciliationSummary`, `ISSUE_CATALOG`, `toRemediationRows`).
- Database routines exist: `admin_financial_reconciliation(_since, _only_issues)`, `admin_financial_reconciliation_summary(_since)`, `escrow_available_balance(uuid)`, `admin_duplicate_ledger_entries`, `admin_orphan_completed_payouts`, `admin_reconciliation_mismatches`. Execute is granted to `service_role` only (correct — edge functions call them).
- Migration `20260801130434_*.sql` is applied: `escrow_ledger_entries.is_cash_movement` generated column, unique index `escrow_ledger_unique_cash_movement` on `(transaction_id, entry_type, reference_type, reference_id)` for cash types, `escrow_ledger_tx_type_idx`, and the rewritten `complete_payout_atomic` with an escrow-balance guard plus released/held accounting on payout completion.
- `admin-dashboard`, `admin-escrow-overview`, `admin-reconciliation` all read the same routine — no duplicate mismatch query.
- `FinancialRemediationTable` + Financial Remediation tab on `/admin/reconciliation` render current vs calculated vs difference with cause and recommended action.
- `admin-payouts-detail` no longer reads the non-existent `payments.paid_at`; `release-core.ts` carries the release-amount drift guard.
- Hourly `reconcile-escrow` cron job (`reconcile-escrow-hourly`) is scheduled and writes to `escrow_reconciliation_results`.

**Described but NOT actually wired**
- `supabase/functions/_shared/financial-model.ts` is imported by **zero** files. Every canonical field (`buildCanonicalFinancials`, `escrowBalanceMinor`, `canDisburse`, `payoutCompletionDisplay`) is currently dead code. Money is still computed per function in `admin-transaction-detail`, `admin-escrow-detail`, `admin-payouts-list/detail`, `admin-transactions-monitor`, `admin-disputes-queue`, `dispute-detail`, `admin-export-worker`, `admin-export-transaction-data`, `admin-user-detail`, `seller-payouts`, `transaction-detail`.
- No unit tests for the financial model (`_shared/__tests__` contains only `pricing.parity.test.ts`).
- Remediation UI is read-only: no drill-down, no filters, no dry-run, no assign/dismiss/resolve/reopen, no CSV export from the tab.
- `reconcile-escrow` records run rows but there is no run-header record (records checked/matched/failed/error summary) and no dedupe of repeat findings/notifications; no "last successful run + health" strip on Escrow/Dashboard.
- Frontend still formats money independently in several places (`src/lib/pricing.ts` consumers, dispute and transaction detail pages).

**Live data available for read-only validation**
SD-2026-000019 and 000021 (released, escrow zeroed), 000023 (held, 4 ledger rows), 000024 (funds_pending_release, held 37,035, 5 ledger rows), 000003/000004 (resolved but still `funds_pending_release`), 000002 (held 1,248,000 with only 2 ledger rows — likely `ledger_split_mismatch`). These are the validation set; nothing about them will be hardcoded.

**Git state** — working tree clean, latest commit `745d1983`. Nothing to preserve manually.

## 2. Confirmed completed work to preserve (no rework)
Reconciliation routine and summary, cash-movement flag and duplicate index, `escrow_available_balance`, hardened `complete_payout_atomic`, dashboard/escrow/reconciliation shared reader, payouts-detail timestamp fix, release-core drift guard, the remediation table component and tab, existing permission keys (`financial_controls.view`, escrow/payout keys), the dark admin design system.

## 3. Remaining gaps ranked

**P0**
1. Canonical model is unused — each admin consumer still derives money independently.
2. No idempotency key / source reference on non-cash and adjustment ledger writes; `payment_credit`+`escrow_hold` duplicate protection depends on callers always passing `reference_id` (not enforced).
3. Refund path has no escrow-balance guard equivalent to `complete_payout_atomic` (`complete_refund_atomic`, `start_refund_atomic`).
4. Status contradictions unmapped: resolved-but-pending-release, escrow released vs payout pending/failed, completed payout without timestamp.

**P1**
5. Remediation flow incomplete (drill-down, filters, dry-run, lifecycle actions, CSV, audit).
6. Scheduled reconciliation lacks a run header, dedupe and a visible health strip.
7. Exports and audit log entries do not use canonical values.

**P2**
8. No test coverage for the model, reconciliation parity or guard behaviour.
9. Frontend duplicate formatting cleanup.

## 4. Files, functions, DB objects and routes affected
- Shared: `_shared/financial-model.ts` (extend: authorised amount, pending-release, financial execution status, reconciliation status), `_shared/reconciliation.ts`, `_shared/release-core.ts`, `_shared/money.ts`.
- Edge functions to rewire onto the model: `admin-transaction-detail`, `admin-escrow-detail`, `admin-escrow-overview`, `admin-payouts-list`, `admin-payouts-detail`, `admin-transactions-monitor`, `admin-disputes-queue`, `dispute-detail`, `admin-flagged-user-detail`, `admin-user-detail`, `admin-export-worker`, `admin-export-transaction-data`, `admin-dashboard`, `reconcile-escrow`, plus a new mode on `admin-reconciliation` for drill-down/dry-run/finding lifecycle.
- DB: new `escrow_ledger_entries.idempotency_key` (nullable + unique partial index), balance guards inside `complete_refund_atomic`/`start_refund_atomic`, `reconciliation_runs` header table, `reconciliation_findings` lifecycle table (status/assignee/reason), all with GRANTs and RLS.
- Frontend: `src/services/admin-reconciliation.service.ts`, `AdminReconciliation.tsx`, `FinancialRemediationTable.tsx` (+ new drawer/filter/dialog components matching existing admin patterns), plus read-only field swaps in escrow, payout, transaction, dispute and flagged-user views. Routes unchanged.

## 5. Safe migration plan
Three additive migrations, each with dry-run first:
1. Ledger idempotency column + partial unique index created `NOT VALID`-style (index built on new writes only after a read-only duplicate report confirms zero conflicts).
2. Refund balance guards inside existing atomic functions (`CREATE OR REPLACE`, no data change).
3. `reconciliation_runs` and `reconciliation_findings` tables with GRANTs, RLS and admin-only policies.
No historical row is updated by any migration. Rollback = drop the new index/tables and restore the previous function bodies (kept verbatim in the migration comments).

## 6. Backend sequence
1. Extend and unit-test `financial-model.ts` (kobo integers only).
2. Rewire consumers one function at a time, each returning identical field names so the UI contract is stable.
3. Add refund guards + ledger idempotency key; make every writer pass a stable key.
4. Add run header + findings lifecycle to `reconcile-escrow` and `admin-reconciliation`; dedupe open findings by `(transaction_id, issue_key)`.
5. Add dry-run remediation endpoint (computes proposed correction, writes nothing) and a separate confirmed-apply endpoint requiring reason + permission + audit row.

## 7. Frontend sequence (UI preserved)
Data-source-only changes for Dashboard, Transactions, Transaction Detail, Disputes, Escrow, Release Review, Payouts, Flagged Users. UI additions confined to the existing Financial Remediation tab: filter row (status/severity/cause/age/owner), row drill-down drawer, dry-run preview dialog, confirm-with-reason dialog, CSV export button — all built from existing admin components, dark theme, sticky headers and loading states.

## 8. Permission and audit impact
Reads keep `financial_controls.view`. Remediation mutations need a write key; the closest existing candidate will be reused if present, otherwise `financial_controls.remediate` is **identified but not created** until you approve. Every mutation writes an `admin_actions`/`audit_logs` row with actor, role, target refs, before/after, changed keys, amount+currency, reason, approval ref, idempotency/correlation ID, timestamp, result.

## 9. Test plan
Vitest for the model and reconciliation classification: full release, partial refund, full refund, failed payout, retry, adjustment/reversal, over-release, over-refund, approval-then-failed-payout, completed payout without timestamp. Manual matrix: duplicate button submit, duplicate webhook replay, dashboard/escrow parity, summary vs filtered rows, permission denial, remediation dry-run vs apply, error boundary on failure. Read-only validation against SD-2026-000019/21/23/24 plus 000002/000003/000004.

## 10. Acceptance criteria
Same transaction shows identical figures and statuses everywhere; no page recomputes money; duplicate clicks/webhooks create no second movement; release and refund cannot exceed escrow; escrow shows released only after a completed payout; dashboard and escrow mismatch counts always agree; every remediation is dry-run previewable, reasoned and audited; no historical data changed without an explicit confirmed action.

## 11. Risks, assumptions, questions
- Backfilling `idempotency_key` on historical rows is out of scope; the index applies to new writes.
- Question: should remediation actions be allowed for Senior Admin, or Super Admin only?
- Question: for `funds_pending_release` cases resolved long ago (000003, 000004), do you want a remediation finding raised, or is that a normal operational state?

## 12. Will not be changed
Roles and permission names, the dark admin design system and layout, existing routes, the escrow ledger as the single ledger, buyer/seller-facing pricing behaviour, historical financial rows, cron schedule (recommended hourly, unchanged), and any working code listed in section 2.
