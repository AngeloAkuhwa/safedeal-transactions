# Financial source of truth — implementation-ready plan for Checkpoints 1–6

Read-only inspection only. Nothing was implemented, migrated, deployed or committed for this revision. Checkpoint 0 produced one documentation artefact — `.lovable/reports/checkpoint-0-financial-baseline.md` — and made no runtime, schema, data or deployment change.

Every checkpoint below (and every sub-stage 2A/2B/2C and the Checkpoint 3 pilot gate) requires a **separate, explicit approval**. No checkpoint continues automatically into the next.

## 1. Verified schema inventory (live database, PostgreSQL 17.6)

- `escrow_ledger_entries` — `amount numeric(18,2)` (major currency units, NOT minor), `currency_code text NOT NULL`, `balance_after numeric(18,2) NULL`, `reference_type text NULL`, `reference_id uuid NULL`, `metadata jsonb NULL`, `is_cash_movement boolean` GENERATED STORED (`payment_credit, escrow_hold, payout_debit, refund_debit, adjustment`). Indexes: pkey, `escrow_ledger_tx_type_idx`, `escrow_ledger_unique_cash_movement` (UNIQUE on `transaction_id, entry_type, reference_type, reference_id` WHERE `reference_id IS NOT NULL` AND type in payment_credit/escrow_hold/payout_debit/refund_debit — **preserved unchanged**), `idx_escrow_ledger_created_at`, `idx_escrow_ledger_entry_type`, `idx_escrow_ledger_transaction`. FK to `transactions` ON DELETE RESTRICT. Trigger `prevent_escrow_ledger_delete`. RLS: single party SELECT policy; all writes are service-role/SECURITY DEFINER. **No `idempotency_key`.**
- Ledger contents today (44 rows, amounts are **major units, naira**): `payment_credit` 10 / 4,287,669.00; `escrow_hold` 10 / 4,259,725.00; `fee_record` 10 / 27,944.00; `adjustment` 4 / 967,200.00; `freeze_hold` 3 / 1,092,000.00; `payout_debit` 3 / 1,021,660.00; `dispute_release_approved_pending_admin_release` 2 / 967,200.00; `payout_awaiting_release` 1 / 37,035.00; `refund_debit` 1 / 124,800.00. 19 rows have `reference_id IS NULL`. The duplicate group on `b1000001-0003…0003` (`adjustment` / `admin_unfreeze`, 3 rows, 676,000.00 **major units**) is outside the existing unique index and is a remediation candidate, not a migration blocker.
- `transaction_pricing` (immutable snapshot): `currency_code`, `item_amount`, `platform_fee_amount`, `payment_processing_fee_amount`, `seller_payout_amount`, `buyer_total_amount`, `is_total_service_fee_capped`, `pricing_model_version` — all `numeric NOT NULL`.
- `escrow_states`: `state`, `held_amount`, `frozen_amount`, `released_amount`, `refunded_amount`, `last_changed_at`.
- `payouts`: `amount numeric(18,2)`, `status payout_status`, `initiated_at/completed_at/failed_at/released_at`, `release_blocked`, `failed_attempt_count`, `retry_allowed`. Today: 2 failed, 2 pending, 1 completed; 1 completed payout has no `released_at`.
- `refunds`: `refund_amount numeric(18,2)`, `status refund_status`, unique partial index `idx_refunds_one_open_per_tx` (pending/processing) and unique `provider_reference`. 1 row.
- `escrow_reconciliation_results`: `run_id`, `run_at`, `paystack_collected/paid_out/refunded`, `ledger_balance`, `expected_ledger_balance`, `delta` — all `numeric(14,2)` major units — plus `status`, `detail jsonb`. **1,178 distinct runs**, 3,756 rows, ~3 rows per run, 3 distinct transactions. Cause: the hourly job re-writes a row for every transaction that had drift in the last 7 days on *every* run, with no run header and no dedupe, so 3 permanently-drifting transactions have accumulated 1,178 rows each. Growth is unbounded.
- Routines verified present with exact signatures: `release_payout_atomic(p_transaction_id, p_payout_id, p_actor_user_id, p_notes)`, `complete_payout_atomic(p_payout_id, p_amount)`, `fail_payout_atomic(p_payout_id, p_reason, p_max_retries)`, `retry_payout_atomic`, `reverse_payout_atomic(p_payout_id, p_amount, p_reason)`, `start_refund_atomic(p_transaction_id, p_amount, p_actor_user_id, p_reason, p_notes)`, `complete_refund_atomic(p_refund_id)`, `fail_refund_atomic`, `freeze_funds_atomic`, `escrow_available_balance(_transaction_id)`, `admin_financial_reconciliation(_since, _only_issues)`, `admin_financial_reconciliation_summary(_since)` (service_role only — verified denial), `admin_escrow_kpis()`, `flag_for_release_review`.
- `escrow_available_balance` counts `escrow_hold + adjustment − payout_debit − refund_debit`; it ignores `freeze_hold`, and `complete_refund_atomic` / `start_refund_atomic` never call it — refunds are unguarded against over-refund.
- Settings: `release_review_target_hours` = 24 via `setting_key`/`setting_value`, resolved through `get_effective_setting`. Also present: `platform_fee_percentage`, `processing_fee_percentage`, `release_review_severity_threshold`, `escrow.auto_release_enabled`, `pricing.min_platform_fee_ngn`, `pricing.max_total_service_fee_ngn`. No hardcoding in UI.
- Permissions that exist and will be reused: `financial_controls.view / export / approve / configure / create / reject`. No new permission is created. `financial_controls.remediate` is **not** proposed.
- Cron: `reconcile-escrow-hourly`, `7 * * * *`, single job (the `cron` schema is not readable from the app role; verified via Checkpoint 0 baseline). Extended, never duplicated.

## 2. Verified writer inventory (money-affecting)

Direct ledger INSERTs: `complete_refund_atomic`, `complete_payout_atomic`, `release_payout_atomic`, `reverse_payout_atomic`, `freeze_funds_atomic`, `resolve_dispute_atomic`, plus edge functions `verify-paystack-payment`, `paystack-webhook`, `seller-confirm-completion`. Read-only ledger consumers: `admin-escrow-detail`, `admin-escrow-overview`, `admin-transaction-detail`, `admin-export-transaction-data`, `reconcile-escrow`.

RPC callers (shared/edge): `_shared/release-core.ts`, `_shared/payout-eligibility.ts`, `_shared/refund-eligibility.ts`, `admin-transaction-actions`, `resolve-release-review`, `retry-payout`, `paystack-webhook`. Scheduled writers: `reconcile-escrow` (read-only w.r.t. balances), `auto-timeout-payments`, `cart-expiry-cleanup` (no ledger writes — confirmed).

## 3. Verified consumer inventory (financial values)

Edge: `admin-transaction-detail`, `admin-escrow-detail`, `admin-escrow-overview`, `admin-escrow-export`, `admin-payouts-list`, `admin-payouts-detail`, `admin-payouts-summary`, `admin-transactions-monitor`, `admin-disputes-queue`, `dispute-detail`, `admin-user-detail`, `admin-user-detail-export`, `admin-flagged-user-detail`, `admin-dashboard`, `admin-dashboard-trend`, `admin-reconciliation`, `admin-export-worker`, `admin-export-transaction-data`, `seller-payouts`, `seller-dashboard`, `seller-analytics`, `seller-transactions`, `seller-transaction-detail`, `seller-disputes`, `seller-dispute-detail`, `buyer-dashboard`, `buyer-transactions`, `buyer-disputes`, `transaction-detail`, `transaction-verify`, `transaction-agreement`, `resolve-share-token`.

Frontend: `admin-transaction-detail.service.ts`, `admin-escrow.service.ts`, `admin-transactions-monitor.service.ts`, `admin-payouts.service.ts`, `admin-reconciliation.service.ts`, `seller-payouts.service.ts`, `seller-transaction-detail.service.ts`, `seller-dispute-detail.service.ts`, `transaction-detail.service.ts`, `agreement.service.ts`, `review.service.ts`, `verification.service.ts`, `lib/admin-consistency.ts`, `lib/pricing.ts`, `lib/payout-presentation.ts`, `lib/payment/money-format.ts`; pages `AdminTransactionDetail`, `AdminTransactions`, `AdminEscrow`, `AdminPayouts`, `AdminDisputeDetail`, `AdminReconciliation`, `AdminDashboard`, `AdminFlaggedUsers`, `BuyerTransactionDetail`, `SellerTransactionDetail`; components `EscrowRecordDrawer`, `SellerPayoutImpactCard`, `SellerConfirmCompletionCard`, `AgreementPreviewDialog`, `PricingBreakdown`, `SellerPayoutLine`.

## 4. Canonical contract table (all money fields are integer **minor units**, kobo; NGN precision = 2)

| Field | TS type | Unit | Source | Formula | Rounding | Null behaviour | Precedence | Invariant |
|---|---|---|---|---|---|---|---|---|
| `currency` | string | — | `transaction_pricing.currency_code` | passthrough | — | default `NGN` | snapshot wins | single currency per transaction |
| `item_subtotal` | number | minor | pricing snapshot | `item_amount×100` | round-half-up at ingest | 0 | snapshot only | ≥0 |
| `buyer_protection_fee` | number | minor | `platform_fee_amount` | ×100 | as above | 0 | snapshot only | ≥0 |
| `processing_fee` | number | minor | `payment_processing_fee_amount` | ×100 | as above | 0 | snapshot only | ≥0 |
| `total_buyer_charge` | number | minor | `buyer_total_amount` | snapshot, else `item+fees+tax−discount` | — | 0 | snapshot wins | = sum of parts |
| `amount_authorised` | number | minor | `payments` | Σ amount where status ∈ (succeeded, processing-authorised) | — | 0 | provider truth | ≥ captured |
| `amount_captured` | number | minor | `payments` | Σ succeeded | — | 0 | provider truth | ≤ authorised |
| `amount_in_escrow` | number | minor | ledger | Σ `escrow_hold` | — | 0 | ledger | ≥0 |
| `available_escrow` | number | minor | ledger | `escrow_hold + adjustment − payout_debit − refund_debit` | — | 0 | ledger | ≥0; mirrors `escrow_available_balance` |
| `frozen_amount` | number | minor | ledger | Σ `freeze_hold` − unfreeze adjustments | — | 0 | ledger | ≤ escrow |
| `refund_amount` | number | minor | `refunds` | Σ completed | — | 0 | completed only | ≤ captured |
| `seller_release_amount` | number | minor | `seller_payout_amount` | snapshot only | — | fallback `item_amount` | never buyer total | ≤ available escrow |
| `payout_amount` | number | minor | `payouts` | Σ completed | — | 0 | completed only | ≤ seller_release |
| `pending_release_amount` | number | minor | payouts+ledger | Σ pending/processing payouts + `payout_awaiting_release` | — | 0 | payouts win | ≥0 |
| `platform_revenue` | number | minor | snapshot | `platform_fee_amount` | — | 0 | snapshot | ≥0 |
| `processing_cost` | number | minor | snapshot | `payment_processing_fee_amount` | — | 0 | snapshot | ≥0 |
| `remaining_balance` | number | minor | ledger | `available_escrow` | — | 0 | ledger | ≥0 |
| `reconciliation_status` | `'reconciled'\|'pending_settlement'\|'mismatch'\|'requires_review'` | — | derived | captured = escrow+refunds+payouts+remaining | — | `requires_review` | mismatch > pending | one value per tx |
| `financial_execution_status` | `'not_funded'\|'held'\|'frozen'\|'pending_release'\|'released'\|'refunded'\|'partially_refunded'\|'failed_settlement'` | — | payouts+refunds+money_status | precedence: failed > frozen > refunded > partial > released > pending_release > held > not_funded | — | `not_funded` | as listed | single value |
| `payout_completed_at` | string\|null | ISO | `payouts.completed_at` | passthrough | — | `completed` without timestamp ⇒ null + `needs_review` | — | flagged into findings |
| `pending_release_sla_state` | `'normal'\|'requires_review'` | — | `release_review_target_hours` | age since resolved vs setting | — | `normal` | setting resolved dynamically | never hardcoded |

Edge behaviour: partial release/refund allowed while `available_escrow ≥ requested`; failed/pending payouts never reduce `amount_in_escrow`; adjustments and reversals are signed ledger entries, never row edits; missing ledger reference ⇒ `requires_review`; negative/NaN/overflow inputs clamp to 0 and raise an invariant failure in tests; multi-currency mixes are rejected rather than summed.

## 5. Revised checkpoint order (fastest safe)

1 → 2A → 2B → 2C → **4 (reconciliation foundation, moved before remediation)** → 3 pilot → 3 rollout → 5 (remediation) → 6 (parity + export cutover).

## 6. Checkpoint detail

**CP1 — canonical contract + tests.** Files: `supabase/functions/_shared/financial-model.ts` (additive only), new `src/lib/financial/canonical-contract.ts` types mirror, tests `supabase/functions/_shared/__tests__/financial-model.test.ts`. Unchanged: every consumer, all DB objects. Data impact: none. No imports, no deploy, no DB/network calls in tests. Preflight: `tsgo`. Tests: full/partial release, full/partial refund, failed/pending/completed payout, adjustment, freeze, unfreeze, reversal, completed-without-`released_at`, SLA in/out of window, missing reference, multi-currency, negative/zero/overflow/null. Acceptance: all new + existing Vitest suites green, zero runtime diff. Rollback: revert the two files (no DB). Stop: report and wait.

**CP2A — schema only.** `ALTER TABLE escrow_ledger_entries ADD COLUMN idempotency_key text NULL;` then `CREATE UNIQUE INDEX escrow_ledger_idem_key ON escrow_ledger_entries(idempotency_key) WHERE idempotency_key IS NOT NULL;` as two single-statement migrations with `SET lock_timeout='3s'`. `CREATE INDEX` takes a `SHARE` lock (reads continue, writes blocked for the build); `ALTER TABLE ADD COLUMN` with a NULL default may briefly take `ACCESS EXCLUSIVE`. Actual migration-runner transaction behaviour is verified by rehearsal inside a rolled-back transaction before applying. Preflight: confirm zero non-null keys, confirm `escrow_ledger_unique_cash_movement` present. Post-check: `\d` shows both indexes. No backfill; 19 NULL `reference_id` rows and all history stay NULL. Rollback: `DROP INDEX escrow_ledger_idem_key; ALTER TABLE ... DROP COLUMN idempotency_key;`.

**CP2B — writer adoption, backward compatible.** Key formats: `user:<action>:<tx_id>:<actor_id>:<nonce>`, `provider:<paystack_event_id>`, `job:<job_name>:<tx_id>:<period>`. Every verified writer from §2 passes a key; retries return the original result via `ON CONFLICT (idempotency_key) DO NOTHING` + re-select. Deploy writers before enforcement. Tests: double-click, webhook replay, cron re-run, RPC retry. Rollback: redeploy previous function bodies (captured with `pg_get_functiondef` into `supabase/rollback/`).

**CP2C — enforcement + guards.** Trigger `escrow_ledger_require_idem` rejecting new rows where `is_cash_movement AND idempotency_key IS NULL` (historical NULLs untouched, BEFORE INSERT only). Add `escrow_available_balance` checks inside `start_refund_atomic` and `complete_refund_atomic`; lock order everywhere: `transactions` → `payouts`/`refunds` → ledger. `complete_refund_atomic`'s documented transitions (`refund_pending` → `funds_pending_release` when a `partial_refund_release` outcome exists, else → `refund_issued`/`refunded`, plus `escrow_states` and `release_review_queue` updates) are preserved exactly. Rollback SQL contains the current bodies verbatim.

**CP4 — reconciliation foundation (before remediation).** Extend the existing `reconcile-escrow` job only. New `reconciliation_runs` (run key, started/succeeded/failed, counts) and `reconciliation_findings` (one active finding per transaction+issue, `closed_at IS NULL` = active, severity, status, auto-resolution) with GRANTs, RLS, indexes. `pg_advisory_xact_lock` prevents overlap; last successful run is preserved when a later run fails. Notification dedupe reuses `orchestration_notification_dedupe` pattern. Explains and stops the 1,178-run duplication; retention/archival proposed separately with **no deletion** here. Balances stay read-only.

**CP3 — canonical read migration.** Pilot `admin-transaction-detail`: canonical fields returned additively alongside every legacy field, per-consumer feature flag for instant rollback, shadow comparison across all 21 transactions with **zero minor-unit** money tolerance; only status-label differences (`financial_execution_status` vs legacy `money_status` wording) are accepted. New explicit approval required after the pilot report before the remaining consumers migrate. Export consumers are shadow-compared here but **not cut over** — cutover belongs to CP6.

**CP5 — remediation workflow.** Built on CP4 tables: assignee, proposal, review, dismissal, reopen, before/after JSONB snapshots, audit via existing `admin_actions`/`audit_logs`. Action catalogue split into status/timestamp repairs (backfill `released_at`, clear stale `funds_pending_release`, close resolved findings) and financially significant actions (signed compensating `adjustment` entry only — never row edits). Dry-run RPC + confirmed apply RPC, deterministic idempotency key, mandatory reason, explicit confirmation, post-action re-reconcile, immutable audit. Permission map: view→`financial_controls.view`, propose→`financial_controls.create`, dismiss/reject→`financial_controls.reject`, approve→`financial_controls.approve`, export→`financial_controls.export`; **Apply is Super Admin only**, resolved through `internal_roles.key='super_admin'` / role ID via `internal_effective_permissions` + `has_internal_role` — never display text. No bulk mutation.

**CP6 — parity matrix + export/audit cutover.** Screen-by-screen matrix across Dashboard, Transactions, transaction detail, Escrow, Payouts, Disputes, user detail, Reconciliation, buyer/seller views, audit and exports, for: authorised, fees, held, released, refunded, pending release, available escrow, payout status, transaction lifecycle, dispute status, reconciliation status. Filters, scope, currency and timezone (UTC storage, Africa/Lagos display) are aligned before any comparison. Export/audit cutover ships as its own flagged deployment, separate from pure validation.

## 7. Dependency map

CP1 blocks CP2C/CP3/CP4 (shared formulas). CP2A blocks 2B blocks 2C. CP2C blocks CP5 (safe mutation). CP4 blocks CP5 (persistence) and CP6 (status column). CP3 pilot blocks CP3 rollout blocks CP6.

## 8. Ready to approve now

**Checkpoint 1 only** — pure additive contract + tests, zero runtime effect, revert-by-file rollback.

## 9. Unresolved product decisions

1. Do failed/pending payouts count toward `pending_release_amount` on the Escrow KPI cards, or only `payout_awaiting_release` ledger rows? (Affects headline numbers; not derivable from code — both patterns exist today.)
2. Should the 3 permanently-drifting transactions be auto-closed as findings after remediation, or stay open until manually dismissed?
