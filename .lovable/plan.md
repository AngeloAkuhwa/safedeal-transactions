
# Phase 6 — Reconciliation & Observability

## Status (this run) — shipped

- **Migration**: `escrow_reconciliation_results` (RLS admin-read, service-role write), `v_pricing_snapshot_coverage`, `v_pricing_snapshot_audit`, plus the hourly `pg_cron` job `reconcile-escrow-hourly` (7th minute of every hour).
- **Edge functions**:
  - `reconcile-escrow` — service-role; walks payments/payouts/refunds/ledger; writes one row per (tx, run); fires `notifyOpsTeam` on drift. Idempotent per `run_id`.
  - `admin-reconciliation` — admin-gated read API for the UI.
- **Service / UI**: `src/services/admin-reconciliation.service.ts` + `src/pages/AdminReconciliation.tsx` at `/admin/reconciliation` with Escrow Drift / Pricing Coverage tabs, Phase-7 readiness banner, and a manual "Run now (24h)" button.
- **Smoke run**: triggered with 87 600h lookback — considered 9 transactions, found 3 real drifts (legitimate pre-existing ledger gaps). Ops alerts dispatched.
- **Phase 7 unblock**: gating threshold lives on the admin screen; the banner turns green automatically once `v_pricing_snapshot_coverage` shows 100% `snapshot_complete`.

**Goal:** Prove, automatically and continuously, that every transaction's money state matches across three sources of truth — Paystack (external), `escrow_ledger_entries` (internal append-only ledger), and `payouts` / `refunds` (operational outcome) — and surface a pricing-snapshot audit for admins. Phase 6 unblocks Phase 7 (legacy column removal) by quantifying snapshot coverage.

This phase is **read-only on financial data** (no money math changes, no snapshot rewrites). It adds one reconciliation job, one admin screen, and structured logging.

---

## Scope (in)

### 1. Reconciliation job (`reconcile-escrow` edge function)

Runs hourly via `pg_cron`. For each transaction touched in the last 24h (or with an open discrepancy), compute:

- `paystack_collected` = sum of succeeded `payments.amount` for the tx.
- `paystack_paid_out` = sum of `payouts.amount` where `status in ('processing','completed')`.
- `paystack_refunded` = sum of `refunds.amount` where `status in ('processing','completed')`.
- `ledger_balance` = signed sum of `escrow_ledger_entries.amount` per tx (held minus released/refunded), using the entry-type convention already in `release-core.ts` and `seller-confirm-completion`.

Write one row per (transaction, run) into a new table `escrow_reconciliation_results`:

```text
id, transaction_id, run_id, run_at,
paystack_collected, paystack_paid_out, paystack_refunded,
ledger_balance, expected_ledger_balance, delta,
status: 'ok' | 'drift' | 'missing_ledger' | 'missing_pricing',
detail jsonb
```

Rules:
- `ok` ⇔ |delta| < ₦0.01 AND a `payout_awaiting_release` / `payout_released` / `refund_issued` entry exists for every operational state change.
- `drift` ⇔ |delta| ≥ ₦0.01 — fires a `notifyOpsTeam` security_alert with the delta.
- Job is idempotent per `run_id`; new runs do not mutate prior rows.

### 2. Pricing-snapshot audit

A second pass in the same job inspects `transaction_pricing` for every transaction where `money_status != 'awaiting_payment'`:

- `snapshot_complete` ⇔ all of `item_amount`, `platform_fee_amount`, `payment_processing_fee_amount`, `service_fee_amount`, `seller_payout_amount`, `buyer_total_amount`, `pricing_model_version` are non-null.
- `snapshot_legacy` ⇔ canonical columns null but legacy (`processing_fee_amount`, `seller_net_amount`) present.
- `snapshot_missing` ⇔ no row.

Aggregates land in a new view `v_pricing_snapshot_coverage` (counts per status, last 30 / 90 / all-time). Phase 7 gating threshold: 100% of `money_status != 'awaiting_payment'` rows on `snapshot_complete` for at least 30 days.

### 3. Admin "Reconciliation & Pricing Audit" screen

New route `/admin/reconciliation` (admin-only, gated via `has_role(auth.uid(),'admin')`). Two tabs:

- **Escrow drift** — table from latest run of `escrow_reconciliation_results` where `status != 'ok'`. Columns: tx code, money status, collected, paid out, refunded, ledger balance, delta, status badge, detail expand. Actions: "Open transaction", "Mark investigated" (writes to existing `admin_investigations`).
- **Pricing coverage** — KPI cards from `v_pricing_snapshot_coverage` + a table of `snapshot_legacy` / `snapshot_missing` rows with "Open transaction" link. Includes a "Phase 7 readiness" banner: green when threshold met, amber otherwise with the count remaining.

Data access via two new service functions in `src/services/admin-reconciliation.service.ts`, backed by a `admin-reconciliation` edge function (no direct Supabase client in components, per project rule).

### 4. Structured observability

- Every drift row emits a `notifyOpsTeam` alert with severity `high` when delta ≥ ₦100, `medium` otherwise.
- Reconciliation job logs `run_id`, row counts, drift count, and pricing coverage % per run to `system_logs`.
- Add `pricing_model_version` to the existing payout-released `transaction_events.event_data` for forward auditing.

---

## Scope (out)

- No retroactive snapshot backfill. Legacy rows stay; Phase 7 will decide policy.
- No automatic remediation of drift — Phase 6 only *detects and reports*.
- No new pricing fields, no Paystack rule changes.
- No public/buyer/seller-facing UI changes.

---

## Database changes (one migration)

1. `CREATE TABLE public.escrow_reconciliation_results (...)` + GRANTs (`SELECT` to `authenticated`, `ALL` to `service_role`, no `anon`) + RLS policy `admin-only read via has_role(...)`.
2. `CREATE OR REPLACE VIEW public.v_pricing_snapshot_coverage` with `security_invoker = on` (per project's role-visibility view pattern). GRANT `SELECT` to `authenticated`.
3. `CREATE INDEX` on `escrow_reconciliation_results (transaction_id, run_at DESC)` and `(status) where status != 'ok'`.
4. `pg_cron` job `reconcile-escrow-hourly` → `net.http_post` to the edge function (project anon key + `Authorization` header, per the standard scheduling pattern).

No changes to existing financial tables. `prevent_delete` triggers untouched.

---

## Edge functions

- `reconcile-escrow` (new) — service-role only, reads payments/payouts/refunds/ledger/pricing, writes results + alerts. Validated input (`run_id` optional).
- `admin-reconciliation` (new) — admin-gated, returns latest run rows + coverage KPIs. Uses direct `fetch` for any PATCH ("mark investigated"), per project rule.

---

## Verification

- Seed-script test: insert a known-drift tx, run `reconcile-escrow` once, assert one `drift` row + one ops alert.
- Backfill test: run against last 7 days of staging data, expect 0 drift rows (any drift = real issue to triage).
- Coverage view: `SELECT * FROM v_pricing_snapshot_coverage` returns numeric counts summing to total post-payment tx count.
- Admin screen: load `/admin/reconciliation` as admin (renders), as non-admin (403/redirect).
- `tsc --noEmit` and edge-function deploy clean.

---

## Rollback

- Disable the cron job (`SELECT cron.unschedule('reconcile-escrow-hourly')`).
- Drop the admin route (purely additive).
- Table and view can be left in place; nothing else reads them.

No financial data is mutated by Phase 6, so rollback is risk-free.

---

## Risk

Low. Read-only on money. The only side-effect is rows in a new table and ops-alert notifications. Worst case is a false-positive drift alert from a known timing window (e.g., Paystack transfer "processing" but ledger not yet posted) — mitigated by the 24h lookback window and idempotent `run_id`.

---

## Estimated work

- 1 migration (table + view + cron).
- 2 edge functions (`reconcile-escrow`, `admin-reconciliation`).
- 1 service (`admin-reconciliation.service.ts`) + 1 page (`AdminReconciliation.tsx`) + small route wire-up.
- No notification/email copy changes (Phase 5 already covered those).

After Phase 6 runs cleanly for 30 days with 100% snapshot coverage, Phase 7 (legacy column fallback removal) becomes safe to execute mechanically.
