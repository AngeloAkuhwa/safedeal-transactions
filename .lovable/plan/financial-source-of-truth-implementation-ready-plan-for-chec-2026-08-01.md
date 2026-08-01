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

## 4. Canonical contract (all money fields are validated integer **minor units**, kobo; NGN precision = 2)

### 4.0 Money ingestion and validation — fail closed

- One exact decimal parser converts PostgreSQL `numeric` **strings** to minor units: parse sign, integer part and at most 2 fractional digits textually (no `Number()` on the whole string, no float multiplication). Rounding is applied **once**, at ingestion, and only when the source carries more than 2 fractional digits (round half-up); every later operation is integer-only.
- A value is **valid** only if it is a finite safe integer after conversion (`Number.isSafeInteger`), within the documented magnitude ceiling, and non-negative for fields declared non-negative. Signed fields (`adjustment`, reversal legs, net balances) may be negative and are declared as such.
- **Nothing is clamped.** Negative-where-forbidden, NaN, non-terminating/over-precision fractional minor units, unsafe integers and overflow each raise a typed `InvariantError` carrying field, raw value and transaction id. The canonical builder then returns `reconciliation_status = 'requires_review'` with the invariant list attached, and **every mutation path (release, refund, payout, adjustment, remediation apply) must refuse to proceed**. Invalid money is surfaced, never hidden.
- Missing **optional** values may use an explicitly documented fallback only when business-safe (e.g. `currency` defaults to `NGN`; `discount`/`tax` default to 0 because their absence in the snapshot means "not applied"). Each fallback is listed in the table with a reason.
- Missing **authoritative** values have no fallback. In particular a missing `transaction_pricing.seller_payout_amount` **must not** fall back to `item_amount` for any mutation: it yields `seller_release_amount = null` + `requires_review`, and release/refund/payout logic refuses. If a display-only fallback is retained in a read surface it is returned as a separate field `seller_release_amount_display_estimate` explicitly labelled **non-authoritative**, excluded from every invariant and never read by mutation code.

### 4.1 Verified payment/payout/refund status vocabulary (from the live enums)

- `payment_status`: `pending, authorized, succeeded, failed, refunded`. Therefore `amount_authorised = Σ payments.amount where status ∈ (authorized, succeeded)` and `amount_captured = Σ payments.amount where status = 'succeeded'`. No invented status such as "processing-authorised" is used anywhere.
- `payout_status`: `awaiting_release, pending, processing, completed, failed, cancelled, blocked, reversed`.
- `refund_status`: `pending, processing, completed, failed, cancelled`.
- `escrow_ledger_entry_type`: `payment_credit, escrow_hold, freeze_hold, payout_debit, refund_debit, fee_record, adjustment, payout_awaiting_release, dispute_refund_reserved, dispute_release_approved_pending_admin_release, dispute_no_action`.

### 4.2 Conservation model derived from `escrow_available_balance` (no double counting)

The database routine is authoritative and is reproduced exactly, never re-invented:

```text
available_escrow = Σ escrow_hold + Σ adjustment − Σ payout_debit − Σ refund_debit
```

`payment_credit`, `fee_record`, `freeze_hold`, `payout_awaiting_release`, `dispute_refund_reserved`, `dispute_release_approved_pending_admin_release` and `dispute_no_action` are **not** balance terms in that routine; they are capture, revenue, reservation and intent markers. The canonical model therefore uses two separate, non-overlapping equations.

**(A) Capture identity — buyer money that entered the platform:**

```text
amount_captured (payments, status = succeeded)
  = Σ escrow_hold  (escrow funding)
  + Σ fee_record   (platform revenue + processing cost retained outside escrow)
```

Live check: captured/credits 4,287,669.00 = escrow_hold 4,259,725.00 + fee_record 27,944.00. Exact.

**(B) Escrow movement identity — how escrow funding was consumed:**

```text
Σ escrow_hold + Σ adjustment
  = Σ payout_debit + Σ refund_debit + available_escrow
```

This is the routine rearranged, so it holds by construction; a violation means the routine and the stored `balance_after` disagree and is reported as `mismatch`.

`amount_in_escrow` (= Σ `escrow_hold`, historical funding) and `available_escrow` / `remaining_balance` (current derived balance) appear on **opposite sides** of (B) and are never added together. The previously proposed `captured = escrow + refunds + payouts + remaining` is withdrawn as double-counting.

**Participation of each concept:**

| Concept | Ledger/table effect | In (A) | In (B) | Notes |
|---|---|---|---|---|
| Signed `adjustment` | signed ledger entry | no | yes (+, may be negative) | corrections/unfreeze; never a row edit |
| Reversal (`reverse_payout_atomic`) | compensating signed entry | no | yes | restores escrow via `adjustment` |
| `freeze_hold` | reservation marker | no | **no** (routine ignores it) | reported separately as `frozen_amount`; a freeze that exceeds `available_escrow` is `requires_review` |
| Completed refund | `refund_debit` | no | yes (−) | only `status='completed'` |
| Completed payout | `payout_debit` | no | yes (−) | only `status='completed'` |
| Pending/processing payout | **no ledger debit** | no | no | reported as `pending_payout_amount`, reserved against `available_escrow` |
| Failed payout | no ledger debit | no | no | reported as `failed_settlement_amount`, still held/reserved |
| Approved-but-unexecuted release | `payout_awaiting_release`, `dispute_release_approved_pending_admin_release` | no | no | reported as `pending_release_amount` |
| `fee_record` | revenue marker | yes | no | excluded from escrow balance |

Reserved-capacity guard used before any mutation:

```text
disbursable = available_escrow − frozen_amount − pending_payout_amount
              − failed_settlement_amount − pending_release_amount
```

A release/refund is permitted only when `0 < requested ≤ disbursable`, mirrored by the database guard.

### 4.3 Field table

| Field | TS type | Unit | Source | Formula | Missing/invalid behaviour | Invariant |
|---|---|---|---|---|---|---|
| `currency` | string | — | `transaction_pricing.currency_code` | passthrough | documented fallback `NGN` | one currency per transaction; mixes rejected |
| `item_subtotal` | int | minor | snapshot | exact parse | missing ⇒ `requires_review` | ≥0 |
| `buyer_protection_fee` | int | minor | `platform_fee_amount` | exact parse | missing ⇒ 0 (documented: fee not applied) | ≥0 |
| `processing_fee` | int | minor | `payment_processing_fee_amount` | exact parse | missing ⇒ 0 (documented) | ≥0 |
| `discounts` / `taxes` | int | minor | snapshot | exact parse | missing ⇒ 0 (documented) | ≥0 |
| `total_buyer_charge` | int | minor | `buyer_total_amount` | snapshot; if absent `item+fees+tax−discount` | mismatch with parts ⇒ invariant | = sum of parts |
| `amount_authorised` | int | minor | `payments` | Σ where status ∈ (`authorized`,`succeeded`) | — | ≥ `amount_captured` |
| `amount_captured` | int | minor | `payments` | Σ where status = `succeeded` | — | satisfies identity (A) |
| `fees_retained` | int | minor | ledger | Σ `fee_record` | — | part of (A) |
| `amount_in_escrow` | int | minor | ledger | Σ `escrow_hold` (historical funding) | — | ≥0; never added to `available_escrow` |
| `available_escrow` | int | minor | ledger | mirrors `escrow_available_balance` | negative ⇒ `mismatch` | authoritative value is the DB routine |
| `remaining_balance` | int | minor | ledger | alias of `available_escrow` | — | identical by definition |
| `frozen_amount` | int | minor | ledger | Σ `freeze_hold` − unfreeze `adjustment` | negative ⇒ invariant | ≤ `available_escrow` else `requires_review` |
| `refund_amount` | int | minor | `refunds` | Σ where `completed` | — | ≤ `amount_captured` |
| `seller_release_amount` | int \| null | minor | `seller_payout_amount` | snapshot **only** | missing ⇒ `null` + `requires_review`; mutations blocked | ≤ disbursable |
| `seller_release_amount_display_estimate` | int \| null | minor | `item_amount` | display only | **non-authoritative** | never used by mutations |
| `payout_amount` | int | minor | `payouts` | Σ where `completed` | — | matches Σ `payout_debit` else `mismatch` |
| `pending_release_amount` | int | minor | ledger + release review | approved/reviewed release instructions not yet executed as a payout (`payout_awaiting_release`, `dispute_release_approved_pending_admin_release`, `payouts.status='awaiting_release'`) | — | ≥0 |
| `pending_payout_amount` | int | minor | `payouts` | Σ where status ∈ (`pending`,`processing`) | — | reserved against escrow |
| `failed_settlement_amount` | int | minor | `payouts` | Σ where status = `failed` | — | **never labelled pending release**; stays held/reserved until retry, cancellation or remediation |
| `committed_amount` | int | minor | derived | `pending_release + pending_payout + failed_settlement` | — | display-only aggregate; components always exposed separately and labelled |
| `platform_revenue` / `processing_cost` | int | minor | snapshot | passthrough | — | ≥0 |
| `reconciliation_status` | `'reconciled'\|'pending_settlement'\|'mismatch'\|'requires_review'` | — | derived | identities (A) and (B) + invariant list | any invariant ⇒ `requires_review` | one value per transaction |
| `financial_execution_status` | `'not_funded'\|'held'\|'frozen'\|'pending_release'\|'pending_payout'\|'released'\|'refunded'\|'partially_refunded'\|'failed_settlement'` | — | payouts+refunds+`money_status` | precedence: failed_settlement > frozen > refunded > partially_refunded > released > pending_payout > pending_release > held > not_funded | — | single value |
| `payout_completed_at` | string \| null | ISO (UTC) | `payouts.completed_at` | passthrough | `completed` with no trustworthy timestamp ⇒ `null` + `needs_review` finding | **never fabricated or inferred**; only an authoritative provider/audit timestamp may supply it |
| `pending_release_sla_state` | `'normal'\|'requires_review'` | — | `release_review_target_hours` via `get_effective_setting` | age vs setting | — | never hardcoded |

Storage and comparison are UTC. Display timezone uses the **existing** formatting source in the codebase (`src/lib/format.ts` / the current admin locale handling); no `Africa/Lagos` literal is introduced, because no platform timezone setting exists in `system_settings` today. If a platform timezone setting is later added, the resolver is the single source.

## 5. Revised checkpoint order (fastest safe)

1 → 2A → 2B → 2C → **4 (reconciliation foundation, moved before remediation)** → 3 pilot → 3 rollout → 5 (remediation) → 6 (parity + export cutover).

## 6. Checkpoint detail

**CP1 — canonical contract + tests (zero runtime).** Changes exactly **two** files: (1) existing `supabase/functions/_shared/financial-model.ts`, **additively** — exact decimal parser, validated safe-integer minor units, typed `InvariantError`, the two conservation identities, the disbursable guard and the new pending/committed fields; (2) new `supabase/functions/_shared/__tests__/financial-model.test.ts`. **No `src/lib/financial/canonical-contract.ts`** — no mirrored second financial model is created. Frontend/runtime contract exposure happens later (CP3) through the existing response-type / type-generation pattern used by the current admin services. Unchanged: every consumer, every DB object, all deployments. Data impact: none. The module stays imported by zero runtime code, so nothing executes in production. Tests (pure, no DB/network): identity (A) and (B) on live-shaped fixtures, full/partial release, full/partial refund, pending vs processing vs failed vs completed payout separation, signed adjustment, reversal, freeze/unfreeze, missing `seller_payout_amount` ⇒ `requires_review` + mutation blocked, `completed` payout without timestamp ⇒ `needs_review`, SLA in/out of window via injected setting, multi-currency rejection, and fail-closed cases (negative, NaN, >2-dp, unsafe integer, overflow) asserting an `InvariantError` rather than a clamp to zero. Preflight: `tsgo`. Acceptance: those two files changed and no others; all new and existing Vitest suites green; zero runtime diff. Rollback: revert those exact two files; no DB, no deploy. Stop: report and wait.

**CP2A — schema only.** `ALTER TABLE escrow_ledger_entries ADD COLUMN idempotency_key text NULL;` then `CREATE UNIQUE INDEX escrow_ledger_idem_key ON escrow_ledger_entries(idempotency_key) WHERE idempotency_key IS NOT NULL;` as two single-statement migrations with `SET lock_timeout='3s'`. `CREATE INDEX` takes a `SHARE` lock (reads continue, writes blocked for the build); `ALTER TABLE ADD COLUMN` with a NULL default may briefly take `ACCESS EXCLUSIVE`. Actual migration-runner transaction behaviour is verified by rehearsal inside a rolled-back transaction before applying. Preflight: confirm zero non-null keys, confirm `escrow_ledger_unique_cash_movement` present. Post-check: `\d` shows both indexes. No backfill; 19 NULL `reference_id` rows and all history stay NULL. Rollback: `DROP INDEX escrow_ledger_idem_key; ALTER TABLE ... DROP COLUMN idempotency_key;`.

**CP2B — writer adoption, backward compatible.** Keys are **deterministic across retries**: they never contain an attempt number, a current timestamp or a retry-generated random value. Each key embeds a *stable operation id* that is created once for the business operation and reused by every retry, plus the entry type so that two different ledger movements produced by one event cannot collide:

- `user:<action>:<transaction_id>:<stable_operation_id>:<entry_type>`
- `provider:paystack:<event_id_or_reference>:<transaction_id>:<entry_type>`
- `job:<job_name>:<period_bucket>:<transaction_id>:<entry_type>`

Where the stable operation id comes from, in priority order: (1) the **immutable id of the source row** the movement settles — `payouts.id`, `refunds.id`, `payments.id`, `disputes.id`, `release_review_queue.id` — used wherever one exists, which covers every verified writer in §2; (2) for admin-initiated actions with no pre-existing source row, a client-generated request id supplied in the request body, persisted on the originating `admin_actions` row at creation and re-sent unchanged by the retry path; (3) for provider events, the Paystack `event.id`/`reference` already persisted in `payment_webhook_logs`. Period bucket for cron writers is the deterministic schedule slot (e.g. `2026-08-01T14`), not `now()`.

Every verified writer from §2 passes a key; retries insert with `ON CONFLICT (idempotency_key) DO NOTHING` and re-select the original row, returning the original result. Writers are deployed **before** any enforcement. Tests: double-click, webhook replay, cron re-run inside the same bucket, RPC retry after timeout, and two distinct entry types from one event both persisting. Rollback: redeploy the previous function bodies (captured verbatim with `pg_get_functiondef` into `supabase/rollback/`).

**CP2C — enforcement + guards.** Enforcement does **not** rely on the generated `is_cash_movement` column inside a `BEFORE INSERT` trigger; PostgreSQL 17 generated-column visibility in `BEFORE` triggers is not assumed. The trigger tests `NEW.entry_type` against an explicit, verified list instead. That list is wider than the four types covered by `escrow_ledger_unique_cash_movement` and covers every type that changes or reserves financial value, verified against the real function bodies: `payment_credit, escrow_hold, payout_debit, refund_debit, adjustment, freeze_hold, payout_awaiting_release, dispute_refund_reserved, dispute_release_approved_pending_admin_release`. (`fee_record` and `dispute_no_action` are excluded as non-reserving markers.) New rows of those types must carry a non-null `idempotency_key`; **historical rows are untouched** and the existing unique index is preserved unchanged. Also added: `escrow_available_balance`-based guards inside `start_refund_atomic` and `complete_refund_atomic` (today unguarded), enforcing `0 < requested ≤ disbursable`; lock order everywhere `transactions` → `payouts`/`refunds` → ledger. `complete_refund_atomic`'s documented transitions (`refund_pending` → `funds_pending_release` when a `partial_refund_release` outcome exists, else `refund_issued`/`refunded`, plus `escrow_states` and `release_review_queue` updates) are preserved exactly.

**Ordered rollback after 2B/2C, explicitly:** (1) drop the enforcement trigger and the refund guards, restoring the captured previous function bodies; (2) roll back the writer/function deployments from 2B; (3) only then drop `escrow_ledger_idem_key` and the `idempotency_key` column from 2A. Reversing this order would leave writers emitting a column that no longer exists, or enforcement active against writers that no longer send keys.

**CP4 — reconciliation foundation (before remediation).** Extends the existing `reconcile-escrow` job only; no second job, no new cron schedule. New `reconciliation_runs` (run key, lease owner, `started_at`, `heartbeat_at`, `finished_at`, outcome, counts) and `reconciliation_findings` (one active finding per transaction+issue, `closed_at IS NULL` = active, severity, status, resolution) with GRANTs, RLS and indexes.

**Concurrency — corrected.** `pg_advisory_xact_lock` is *not* claimed to protect the Edge Function: the function makes several separate PostgREST calls, each its own transaction, so a transaction-scoped lock is released before the run finishes. Instead, either (preferred) the protected comparison runs entirely inside **one database RPC** so a single transaction covers the whole reconciliation and `pg_advisory_xact_lock` genuinely applies; or, where the work must stay in the Edge Function, an **atomic lease** on `reconciliation_runs`: a partial unique index guaranteeing at most one row with `finished_at IS NULL`, acquired by a single `INSERT ... ON CONFLICT DO NOTHING RETURNING` (non-blocking — an overlapping cron or manual run gets no row and **exits safely** rather than queueing), refreshed by a heartbeat, and reclaimable when `heartbeat_at` is older than the documented stale-lease threshold. The chosen design is verified by an overlapping-run test before rollout.

**The 1,178 duplication, explained.** `escrow_reconciliation_results` holds 3,759 rows across `count(DISTINCT run_id) = 1178` runs and 10 distinct transactions. Grouping `count(DISTINCT run_id)` **per `transaction_id`** shows three transactions — `4a37ac0f…`, `b1000001-0005…`, `06c3374c…` — each present in all **1,178** runs, while the other seven appear in 25–51 runs. Cause: the job re-selects every transaction that had a non-`ok` result in the last 7 days, so three permanently-drifting transactions are re-evaluated and re-written on every hourly run for ever; there is no run header and no finding deduplication. 3 × 1,178 = 3,534 of the 3,759 rows. CP4 replaces this fan-out with one persistent finding per transaction+issue, ending the unbounded growth. Retention/archival of the existing rows is proposed separately; **no deletion happens here.** Balances stay read-only.

**CP3 — canonical read migration.** Pilot `admin-transaction-detail`: canonical fields returned additively alongside every legacy field, per-consumer feature flag for instant rollback, shadow comparison across all 21 transactions with **zero minor-unit** money tolerance; only status-label differences (`financial_execution_status` vs legacy `money_status` wording) are accepted. New explicit approval required after the pilot report before the remaining consumers migrate. Export consumers are shadow-compared here but **not cut over** — cutover belongs to CP6.

**CP5 — remediation workflow.** Built on CP4 tables: assignee, proposal, review, dismissal, reopen, before/after JSONB snapshots, audit via existing `admin_actions`/`audit_logs`. Action catalogue split into status/timestamp repairs (backfill `released_at`, clear stale `funds_pending_release`, close resolved findings) and financially significant actions (signed compensating `adjustment` entry only — never row edits). Dry-run RPC + confirmed apply RPC, deterministic idempotency key, mandatory reason, explicit confirmation, post-action re-reconcile, immutable audit. Permission map: view→`financial_controls.view`, propose→`financial_controls.create`, dismiss/reject→`financial_controls.reject`, approve→`financial_controls.approve`, export→`financial_controls.export`; **Apply is Super Admin only**, resolved through `internal_roles.key='super_admin'` / role ID via `internal_effective_permissions` + `has_internal_role` — never display text. No bulk mutation.

**CP6 — parity matrix + export/audit cutover.** Screen-by-screen matrix across Dashboard, Transactions, transaction detail, Escrow, Payouts, Disputes, user detail, Reconciliation, buyer/seller views, audit and exports, for: authorised, fees, held, released, refunded, pending release, available escrow, payout status, transaction lifecycle, dispute status, reconciliation status. Filters, scope, currency and timezone (UTC storage; display via the existing formatting/locale source in the codebase — no hardcoded Africa/Lagos) are aligned before any comparison. Export/audit cutover ships as its own flagged deployment, separate from pure validation.

## 7. Dependency map

CP1 blocks CP2C/CP3/CP4 (shared formulas). CP2A blocks 2B blocks 2C. CP2C blocks CP5 (safe mutation). CP4 blocks CP5 (persistence) and CP6 (status column). CP3 pilot blocks CP3 rollout blocks CP6.

## 8. Ready to approve now

**Checkpoint 1 only** — pure additive contract + tests, zero runtime effect, revert-by-file rollback.

## 9. Resolved product decisions

1. **Release/payout amounts are never mixed.** `pending_release_amount` (approved/reviewed release instructions not yet executed), `pending_payout_amount` (pending/processing payout records reserved against escrow) and `failed_settlement_amount` (failed payouts awaiting retry or review) are three distinct canonical values. Failed payouts are **never** labelled pending release; they remain held/reserved per the verified payout state machine until an explicit retry, cancellation or remediation action changes the state. Dashboard and Escrow cards may show a combined `committed_amount` only while the three components remain separately available and clearly labelled.
2. **Findings auto-close only on proof.** Applying a remediation action does not close a finding. A finding closes only after a **later reconciliation run proves the underlying state consistent**; if drift remains it stays open. An accepted exception may be manually dismissed only with a mandatory reason and an immutable audit record.
