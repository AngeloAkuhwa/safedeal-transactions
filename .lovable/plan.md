# Correction 1 — final consolidated financial source-of-truth plan (Checkpoints A–H)

No implementation, migration, data change, commit or deployment occurred in this response. All facts below come from read-only inspection of the current repository and connected database.

## 0. Approval and stop rule

A future instruction saying exactly **"Approve Correction 1 implementation"** authorizes Checkpoints A through H **in order, without further approval after each successful gate**. Every gate runs its stated verification automatically. If a gate fails, or inspection contradicts this plan, work stops immediately with a failure report — no continuation, weakened tests, bypassed safeguards, speculative fixes or scope expansion.

Always excluded: publishing/deployment, destructive data change, bulk remediation, executing any historical remediation apply, permission/role broadening, and any Correction 2 scope.

## 1. Verified current state

- HEAD `4b3c6943` (2026-08-01 14:44 UTC), clean tree. Checkpoint 0 baseline re-read; rollback point is this commit.
- PostgreSQL 17.6. `system_settings(id, setting_key, setting_value, created_at, updated_at, scope, vendor_id, is_overridable, updated_by, auto_release_enabled_by, auto_release_enabled_at, auto_release_previous_value)`. `release_review_target_hours = 24`, resolved via `_shared/settings-resolver.ts` → `get_effective_settings`; never hardcoded in UI.
- `escrow_ledger_entries(id, transaction_id, entry_type enum, currency_code, amount numeric, balance_after numeric NULL, reference_type text NULL, reference_id uuid NULL, notes, created_by_user_id, created_at, metadata jsonb NULL, is_cash_movement GENERATED)`. **No idempotency or fingerprint column.** 19 rows have `reference_id IS NULL`.
- **Ledger ACL today (verified via `pg_class.relacl`)**: owner `postgres`; `anon`, `authenticated` and `service_role` all hold full `arwdDxtm` (including INSERT/UPDATE/DELETE). RLS policy: one SELECT policy `parties_select_escrow_ledger`. Trigger: `prevent_escrow_ledger_delete`. So today a service-role Edge Function can insert any ledger row — this is the real defect to close.
- Enum (11): `payment_credit, escrow_hold, freeze_hold, payout_debit, refund_debit, fee_record, adjustment, payout_awaiting_release, dispute_refund_reserved, dispute_release_approved_pending_admin_release, dispute_no_action`.
- Implemented `VALUE_AFFECTING_TYPES` (financial-model.ts:200): `payment_credit, escrow_hold, payout_debit, refund_debit, adjustment, freeze_hold, payout_awaiting_release, dispute_refund_reserved, dispute_release_approved_pending_admin_release`. `escrow_available_balance` credits `escrow_hold, adjustment`, debits `payout_debit, refund_debit`.
- All 13 money/settings RPCs inspected are `SECURITY DEFINER`, owner `postgres`, `search_path=public`.
- Role keys (immutable): `super_admin, senior_admin, dispute_manager, dispute_agent, support_agent, identity_officer, finance_operator, finance_approver, compliance_officer, auditor`. `financial_controls` actions: `view, create, approve, reject, configure, export`; `approve` held by `super_admin` and `finance_approver`, denied to `senior_admin`, SoD-conflicting with `disputes.resolve_all`.
- `escrow_reconciliation_results`: unique `(transaction_id, run_id)`; one admin SELECT policy; same permissive relacl as above. 3,762 rows / 1,179 runs; observed per-run write span ≈ 0 s (all rows share the run timestamp), so lease timeout must be derived from measured Edge Function wall time at Checkpoint A, not from row timestamps.
- Cron: one `reconcile-escrow-hourly @ 7 * * * *` plus 8 unrelated jobs. `reconcile-escrow` reads the ledger only (index.ts:97) — no ledger writes; that property is preserved and asserted.
- **`start_refund_atomic` creates the `refunds` row itself**, so `refunds.id` does not exist before the attempt and is not retry-stable (see §3).
- Volumes: 21 transactions, 44 ledger rows, 5 payouts, 1 refund. `financial-model.ts` (693 lines) has zero runtime consumers.

## 2. Enforceable database boundary (replaces the false trigger-based claim)

A shape-validating trigger cannot stop a service-role client from inventing a well-formed key and hash. The boundary is **privilege**, not shape:

1. After confirming no application path depends on direct ledger DML (Checkpoint A grep + runtime inventory), migration `D` runs `REVOKE INSERT, UPDATE, DELETE ON public.escrow_ledger_entries FROM anon, authenticated, service_role;` retaining only `SELECT` for `authenticated`/`service_role` (and existing `anon` SELECT, which RLS already restricts). `sandbox_exec` keeps `ar` only.
2. All ledger inserts happen inside `SECURITY DEFINER` RPCs owned by `postgres` (the verified table owner) with `SET search_path = public`, and `EXECUTE` granted only to `service_role` (never `anon`; `authenticated` only where an existing admin path already calls the RPC).
3. Append-only semantics preserved: existing `prevent_escrow_ledger_delete` trigger retained, and UPDATE/DELETE are now unavailable to every application role.
4. The shape/paired-null trigger remains as a correctness backstop inside the definer path, explicitly **not** as authorization.
5. Grant-bypass tests prove direct INSERT/UPDATE/DELETE as `anon`, `authenticated` and `service_role` all fail with `permission denied`, while the guarded RPCs succeed for authorized callers.

If Checkpoint A finds any live path depending on direct DML that cannot be routed through an RPC, the stop rule applies and the revoke is not attempted.

## 3. Complete writer inventory with retry-stable operation IDs

Key format: `<domain>:<operation>:<transaction_id>:<stable_operation_id>:<entry_type>`. Fingerprint: `v1:<sha256>` over canonical JSON (§4). Lock order everywhere: **`transactions` row → operation row (`payouts`/`refunds`) → balance recomputation via `escrow_available_balance` (a calculation over the now-stable ledger, not a lockable row) → ledger insert**, all in one RPC transaction. Because every writer takes the same two row locks in the same order before recomputing, no concurrent writer can change the balance between check and insert, and lock ordering prevents deadlock.

| # | RPC / writer (signature after change) | Operation & entry types | Stable ID — where it exists before the mutation | Fingerprint fields | Locks | Audit | Tests |
|---|---|---|---|---|---|---|---|
| 1 | `release_payout_atomic(p_transaction_id, p_payout_id, p_actor_user_id, p_notes)` | release approval → **commitment only**: at most one `payout_awaiting_release` per payout, created only if no open commitment exists for it. **Never writes `payout_debit`** (today it writes no ledger row at all — see §3.1) | `payouts.id` — the payout row exists before release; survives client and network retries | tx id, payout id, amount, entry type, currency | tx, payout | release | over-release vs uncommitted balance, duplicate release, concurrent, "no debit at approval" assertion |
| 2 | `complete_payout_atomic(p_payout_id, p_amount, p_provider_event_id text)` **(signature extended)** | settlement → the **single** `payout_debit`; the payout's commitment is retired in the same transaction by the terminal `payouts.status` change (§3.1) | `payouts.id` + Paystack event/transfer reference from the webhook body; identical on every webhook redelivery | payout id, amount, provider event id | tx, payout | completed | duplicate webhook, exactly one debit per payout, amount ≤ authorized commitment, missing timestamp → requires_review |
| 3 | `fail_payout_atomic(p_payout_id, p_reason, p_max_retries)` | failure, no ledger row | `payouts.id` (state-only, no key needed) | n/a | tx, payout | failed | repeat failure idempotent, retry cap |
| 4 | `retry_payout_atomic(p_payout_id, p_actor_user_id, p_notes)` | retry, state-only | `payouts.id` + stored `retry_count` | n/a | tx, payout | retried | retry after failure; retry after completion rejected |
| 5 | `reverse_payout_atomic(p_payout_id, p_amount, p_reason, p_provider_event_id text)` **(extended)** | reversal → `adjustment` credit | `payouts.id` + provider reversal/event ID from the webhook (never the literal word "reversal") | payout id, amount, provider event id | tx, payout | reversed | double reversal, over-reversal, sign |
| 6 | `start_refund_atomic(p_transaction_id, p_amount, p_actor_user_id, p_reason, p_notes, p_operation_id uuid)` **(extended — required)** | initiation → creates the `refunds` row **and exactly one `dispute_refund_reserved` commitment** for it. **Never writes `refund_debit`** (new commitment entry; today this RPC writes no ledger row and the type has 0 existing rows) | The RPC creates the `refunds` row, so `refunds.id` is **not** stable. Caller supplies `p_operation_id`: the immutable dispute-outcome / release-review record ID when one exists, otherwise a UUID minted once by the caller and reused verbatim on every retry | tx id, operation id, amount | tx, then created/located refund row | refund started | request-level duplicate, concurrent duplicate, over-refund vs uncommitted balance, one open reservation per refund |
| 7 | `complete_refund_atomic(p_refund_id, p_provider_event_id text)` **(extended)** | settlement → the **single** `refund_debit`; consumes that refund's reservation in the same transaction via the terminal `refunds.status` change (§3.1) | `refunds.id` (exists) + provider event ID | refund id, amount, provider event id | tx, refund | completed | duplicate webhook, exactly one debit per refund, settled amount ≤ authorized reservation, reserved and settled never both counted |
| 8 | `fail_refund_atomic(p_refund_id, p_reason)` | failure → **no ledger row and no compensating `adjustment`**; the reservation is retired exactly once by the terminal `refunds.status = 'failed'` transition (§3.1) | `refunds.id` + `fail` | refund id, amount | tx, refund | failed | repeat failure idempotent, reservation retired exactly once, no debit written, completion-after-failure rejected unless an eligible retry re-armed it |
| 9 | `freeze_funds_atomic(p_transaction_id, p_actor, p_reason, p_operation_id uuid)` **(extended)** | freeze → `freeze_hold` | Caller-supplied stable action/request UUID, or the immutable originating record (`release_review_queue.id` for `resolve-release-review`). **Never** a newly inserted `admin_actions.id` | tx id, operation id, amount | tx | frozen | double-submit, concurrent freeze |
| 10 | `unfreeze_funds_atomic(p_transaction_id, p_actor, p_target, p_reason, p_operation_id uuid)` **(extended)** | unfreeze → `adjustment` | Same rule as #9. This path produced the historical 3-row `admin_unfreeze` anomaly; the guard prevents recurrence, history untouched | tx id, operation id, target status, amount | tx | unfrozen | repeated unfreeze yields one entry |
| 11 | `flag_for_release_review(...)` | no value movement | n/a | n/a | tx | flagged | duplicate flag is a no-op (state-transition test only) |
| 12 | **new** `record_payment_capture_atomic(p_payment_id uuid, p_provider_event_id text)` — replaces direct inserts in `verify-paystack-payment:193` and `paystack-webhook:188` | bundle: `payment_credit` + `escrow_hold` + `fee_record` + payment state transition | `payments.id` (exists before capture) + provider event ID | payment id, captured amount, escrow amount, fee amount, provider event id | tx, payment | captured | verify/webhook race → one bundle; conservation identity A |
| 13 | **new** `record_completion_release_intent_atomic(p_transaction_id uuid, p_actor uuid, p_confirmation_id uuid)` — replaces `seller-confirm-completion:297,354` | **commitment only**: one `dispute_release_approved_pending_admin_release` **or** one `payout_awaiting_release`, never both and never a debit; where a payout row already exists the entry's `reference_type='payout'`/`reference_id=payouts.id` so §3.1 can match it | `transaction_completion_confirmations.id`. Checkpoint C first makes that confirmation row itself idempotent (unique per transaction+actor, created-or-reused) before deriving the key | tx id, confirmation id, amount, entry type | tx, confirmation | completion confirmed | double confirm, exactly one open commitment per payout, amount from authoritative snapshot only |
| 14 | `reconcile-escrow` | read-only | n/a | n/a | n/a | n/a | assert zero ledger inserts per run |

No writer may fall back to `item_amount` or a missing `seller_payout_amount`; missing authoritative snapshot or invalid money blocks the mutation. Any writer found at Checkpoint A that is not listed triggers the stop rule.

## 3.1 Authoritative settlement state machine (commitments vs debits)

Derived from the current function bodies, not assumed. Verified today: `release_payout_atomic` writes **no** ledger row (it only moves `payouts.awaiting_release → pending` and money `funds_pending_release → funds_releasing`); `complete_payout_atomic` writes the **only** `payout_debit`; `start_refund_atomic` writes **no** ledger row; `complete_refund_atomic` writes the **only** `refund_debit`; `fail_refund_atomic` writes no ledger row. Commitment entry types are written only by the confirmation/dispute intent paths (1 `payout_awaiting_release`, 2 `dispute_release_approved_pending_admin_release`, 0 `dispute_refund_reserved` rows today). There is therefore **no existing immediate-terminal release branch**: approval and settlement are already mutually exclusive, and the plan preserves that separation rather than introducing a second debit path.

**Rules**

1. One payout produces **exactly one** `payout_debit`, written only by `complete_payout_atomic` and made unique by its idempotency key. One refund produces **exactly one** `refund_debit`, written only by `complete_refund_atomic`.
2. Approval/initiation may create **at most one open commitment** per operation row (`payout_awaiting_release` or `dispute_release_approved_pending_admin_release` for a payout; `dispute_refund_reserved` for a refund), and never a debit.
3. **Retirement is derived, never mutated.** The ledger stays append-only: a commitment is *open* while its operation row is non-terminal, and *retired* the instant that row reaches a terminal state. Terminal payout statuses: `completed, failed, cancelled, reversed`. Terminal refund statuses: `completed, failed, cancelled`. Because the terminal status change and the debit are written in the same RPC transaction, consumption of the exact matching commitment is atomic; no ledger row is updated, deleted or compensated.
4. Commitment ↔ operation matching key: `(transaction_id, entry_type, reference_type='payout'|'refund', reference_id)`. Legacy commitment rows whose `reference_id` is the transaction ID are matched by `(transaction_id, entry_type)` and, when ambiguous, are flagged `requires_review` for remediation instead of being guessed.
5. Retry reuses the same business operation row, so it never creates a second reservation: `retry_payout_atomic` re-arms the same payout (`failed → pending`) and `fail_refund_atomic` → operator retry re-arms the same refund; the original commitment simply becomes open again. No new commitment entry is inserted when an entry for that operation already exists.

**Formulas** (integer minor units; `T` = transaction)

- `cash_available(T) = escrow_available_balance(T)` = Σ(`escrow_hold`) + Σ(`adjustment`) − Σ(`payout_debit`) − Σ(`refund_debit`). Commitment types are **not** in this sum — verified in the current function body — so a commitment never moves cash.
- `committed_amount(T)` = Σ(open commitment entries per rules 3–4). Counted **once**, and never as both remaining and settled: a commitment is either open (counted in `committed_amount`, excluded from `uncommitted_available`) or retired (excluded from `committed_amount`; its settlement, if any, already reduced `cash_available`).
- `uncommitted_available(T) = cash_available(T) − committed_amount(T)`.

**Validation per phase** (all inside one RPC transaction, lock order `transactions` → operation row → recompute)

- *Initiation/approval* (`release_payout_atomic`, `start_refund_atomic`): `amount ≤ uncommitted_available(T)`; fail closed otherwise.
- *Completion* (`complete_payout_atomic`, `complete_refund_atomic`): the matching commitment must exist and be open, and `settled_amount ≤ commitment_amount`; the balance check is `settled_amount ≤ cash_available(T)` — **not** against `uncommitted_available`, so an operation is never rejected by its own reservation. No other terminal movement for that operation may exist (uniqueness on the debit's idempotency key plus the terminal-status guard).
- *Failure* (`fail_payout_atomic`, `fail_refund_atomic`): terminal status only; the reservation is retired exactly once; no debit, no compensating `adjustment`.
- *Retry* (`retry_payout_atomic`, refund retry): same operation row, same commitment, no second reservation; retry after a completed terminal state is rejected.
- *Reversal* (`reverse_payout_atomic`): only after a completed debit; writes a signed `adjustment` credit, never re-opens the retired commitment.

Competing operations are serialized by the `transactions` row lock, so a refund reservation and a release approval cannot both consume the same uncommitted balance.

If Checkpoint A finds any function whose real semantics contradict these rules (for example an existing branch writing `payout_debit` outside `complete_payout_atomic`), the stop rule applies and the contradiction is reported instead of resolved by guesswork.

## 4. Canonical fingerprint specification (SQL ⇄ TypeScript parity)

- Payload is a JSON object of the fields named in §3, serialized as: UTF-8; object keys sorted ascending by Unicode code point, recursively; no insignificant whitespace; integers only for money (minor units, no decimals, no exponent); booleans as `true`/`false`; `null` allowed only for fields explicitly declared nullable and always emitted (never omitted); strings NFC-normalized before hashing; no floats anywhere.
- Digest: `SHA-256` over the UTF-8 bytes, lowercase hex, prefixed `v1:`. Version bump required for any rule change.
- Implemented twice: TypeScript in `_shared/financial-writer.ts`, SQL in a `canonical_fingerprint_v1(jsonb)` helper (`pgcrypto` digest).
- **Shared golden vectors** live in one JSON fixture executed by both the Vitest suite and a SQL test; any mismatch fails the gate and blocks rollout.

## 5. Protected event set and paired-null rule

- Guarded-RPC idempotency and the direct-DML revoke cover **all authoritative financial events**: the nine `VALUE_AFFECTING_TYPES` **plus `fee_record`**, which is balance-neutral but revenue-affecting and must not be duplicable.
- Trigger design: one trigger `escrow_ledger_require_idem` over the broader **authoritative-financial-event** set (the ten types above) rather than the balance-affecting set, so `fee_record` is covered without altering balance semantics. `dispute_no_action` stays informational and exempt.
- Paired-null check: `CHECK ((idempotency_key IS NULL AND payload_fingerprint IS NULL) OR (idempotency_key IS NOT NULL AND payload_fingerprint IS NOT NULL))` — historical rows keep both null; every new guarded event has both.

## 6. Durable idempotency-conflict handling

Chosen design (option 1, no raise): a guarded RPC performing `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id` that hits an existing row re-reads it in the same transaction.

- Same fingerprint → return the existing result as success. Exactly one movement, one business outcome.
- Different fingerprint → the RPC performs **no financial or state mutation**, inserts a deduplicated conflict record into `financial_idempotency_conflicts` (unique on `(idempotency_key, existing_fingerprint, incoming_fingerprint)`, storing transaction ID, entry type, both fingerprints, correlation ID, actor, timestamps — **no secrets, no provider payload, no personal data**) and **commits that audit row while returning a structured `{ status: 'idempotency_conflict', correlation_id }`** without raising. The Edge Function converts that result into a failed response and surfaces it; a failed audit write is itself raised and surfaced rather than swallowed.
Tests prove: zero ledger/state mutation on conflict, exactly one persisted conflict event across repeated attempts, and that the caller receives a failure.

## 7. Bundle atomicity

- `record_payment_capture_atomic` writes `payment_credit`, `escrow_hold`, `fee_record` **and** the payment state transition in one transaction: all commit or all roll back. Each row carries its own entry-type-scoped key and fingerprint, and all share one `correlation_id`.
- Reserved → completed refund: `complete_refund_atomic` retires the `dispute_refund_reserved` commitment (via the terminal `refunds.status` change, §3.1 rule 3) in the same transaction that writes the single `refund_debit`, so reservation and settlement are never both counted.
- Pending-release → payout: `complete_payout_atomic` retires the payout's commitment in the same transaction as the single `payout_debit`, likewise never double-counted; approval itself writes no debit.
- Tests: bundle conservation (identities A and B hold after each bundle), crash/partial-failure simulation showing no partial bundle persists, and duplicate-bundle tests.

## 8. Checkpoints

### A — Fresh preflight and change map
Re-verify HEAD/diff, schema, columns, constraints, indexes, enums, triggers, RLS, **relacl grants**, function definitions (`pg_get_functiondef`, owner, `prosecdef`, `proconfig`, EXECUTE grants), cron rows, settings, measured `reconcile-escrow` wall time (for the lease default), and the §3 writer inventory. Confirm no application path depends on direct ledger DML. Output `.lovable/reports/checkpoint-a-change-map.md`.
Gate: any contradiction with §1–§7 stops work. Rollback: none (read-only).

### B — Idempotency schema foundation
Migration `B` with `SET lock_timeout='3s'` and a statement timeout, additive only:
- `ADD COLUMN idempotency_key text`, `ADD COLUMN payload_fingerprint text` (a minimal additive column rather than reusing `metadata`, which already holds mutable provider payloads such as `{reference, amount, currency}` and cannot serve as an immutable comparison field).
- Checks: key shape (`length 8..200`, no whitespace), fingerprint shape (`^v1:[0-9a-f]{64}$`), and the paired-null check from §5.
- `CREATE UNIQUE INDEX escrow_ledger_idem_key ON public.escrow_ledger_entries (idempotency_key) WHERE idempotency_key IS NOT NULL`. A normal CREATE INDEX takes a SHARE lock — reads allowed, writes blocked for the build; at 44 rows the build is expected to be short but preflight and `lock_timeout` still apply and the migration fails fast rather than queueing. `CONCURRENTLY` is not used because the runner wraps statements in a transaction.
- New table `financial_idempotency_conflicts` (§6) with RLS enabled, no `anon`/`authenticated` DML, `service_role` mutation only, admin reads through the existing Edge/RPC pattern.
- No backfill; historical rows keep both columns null.
Gate: objects present, zero duplicate non-null keys, RLS/relacl identical to preflight capture, full suite green.
Rollback: drop index, checks, the conflicts table and both columns. No data touched.

### C — Guarded writers and deterministic idempotency
Add RPCs #12 and #13; extend signatures for #2, #5, #6, #7, #9, #10; make the completion-confirmation row idempotent; implement `_shared/financial-writer.ts` (key + `v1` fingerprint) and the SQL `canonical_fingerprint_v1` twin with golden vectors. Callers updated: `_shared/release-core.ts`, `paystack-webhook`, `verify-paystack-payment`, `seller-confirm-completion`, `retry-payout`, `admin-transaction-actions`, `resolve-release-review`. `reconcile-escrow` stays read-only.
Gate: golden-vector parity SQL⇄TS; per-writer request-level duplicate and concurrent duplicate tests showing exactly one movement and one outcome; conflict path per §6; invalid money and missing snapshots block mutations.
Rollback: revert Edge code and drop the new RPCs (schema from B is inert).

### D — Invariants, atomic balance enforcement and the privilege boundary
Migration `D`, in this order: (1) capture `pg_get_functiondef`, owner, `prosecdef`, `proconfig`, signature and EXECUTE grants for every function being replaced, plus current `relacl`, into a rollback artifact; (2) rewrite RPCs #1–#10 with the §3 lock order, balance guards (no refund/release/payout/completion/reversal above authoritative available escrow), duplicate-finalization and terminal-state rejection, sign validation, and separation of pending/failed/completed settlement amounts; (3) create the `escrow_ledger_require_idem` trigger over the ten authoritative types (§5) as a correctness backstop; (4) **`REVOKE INSERT, UPDATE, DELETE ON public.escrow_ledger_entries FROM anon, authenticated, service_role`**, retaining SELECT, and grant EXECUTE on the guarded RPCs to `service_role` only (§2).
Balance guards follow §3.1 exactly: initiation against `uncommitted_available`, completion against the matching open commitment plus `cash_available`, failure retiring the reservation with no debit, retry reusing the same operation and commitment.
Gate: grant-bypass tests (direct DML denied for all three roles, guarded RPCs succeed); the §3.1 state-transition and conservation suite (pending→completed, pending→failed, failed→retry→completed, duplicate completion, completion after failure without eligible retry, partial refund reservation, multiple permitted partial refunds, competing refund/release reservations, concurrent completion) asserting identities A and B and "exactly one debit per operation" at every state; plus over-refund, over-release, over-completion, over-reversal, duplicate start/complete/fail/reverse/retry, concurrency, rollback, sign correctness, trigger inclusion/exclusion list, append-only enforcement (no UPDATE of any commitment row), and all currently valid flows still succeeding.
Rollback, in order: restore the ten function definitions with owner, security mode, `search_path`, signature and EXECUTE grants exactly; drop the trigger; **only then** re-`GRANT INSERT, UPDATE, DELETE` back to the prior roles — never reopen direct DML while guarded-only code is still deployed.

### E — Reconciliation foundation
- `reconciliation_runs` (id, started_at, heartbeat_at, finished_at, status, lease_owner; all `timestamptz`, UTC) with `claim_reconciliation_lease()`, `heartbeat_reconciliation_lease()`, `close_reconciliation_lease()`. The Edge Function heartbeats for the whole run so the lease outlives any single transaction; a lease stale beyond the configured window is taken over exactly once by an atomic conditional update. Overlapping runs exit cleanly.
- **Lease timeout setting:** new dynamically resolved `finance.reconciliation_lease_timeout_seconds` in `system_settings`, read service-side through `settings-resolver.ts`, bounded validation `60..3600`, default set at Checkpoint A to the measured maximum `reconcile-escrow` wall time plus a 3× margin (floor 300 s). Never hardcoded in UI code.
- `reconciliation_findings`: identity **one active finding per `(transaction_id, rule_key)`** via `CREATE UNIQUE INDEX ... (transaction_id, rule_key) WHERE status='open'`; severity is a mutable attribute so a severity change updates the same finding. Columns: `first_seen, last_seen, occurrence_count, owner, severity, status CHECK (status IN ('open','closed')), resolution_proof jsonb, closed_at`. Each run updates `last_seen` and increments `occurrence_count`. Auto-close only on a later authoritative run proving the condition cleared, with proof stored.
- **Access path is one thing:** RLS enabled, **default deny, no direct-read policy for `anon`/`authenticated`**; `REVOKE ALL ... FROM anon, authenticated`; `GRANT ALL ... TO service_role`. All admin reads go through `admin-reconciliation` / the service-role RPC with `requirePermission("financial_controls.view")`. `admin_financial_reconciliation_summary` keeps its service-role-only EXECUTE boundary. `escrow_reconciliation_results` history is preserved untouched.
- One shared summary path (`_shared/reconciliation.ts` + `admin_financial_reconciliation_summary`) for Dashboard and Escrow. Exactly one cron schedule remains (`reconcile-escrow-hourly @ 7 * * * *`); no new job.
Gate: overlapping-run, stale-lease takeover, heartbeat, retry, dedup incl. severity change, proof-based closure, Dashboard/Escrow parity, RLS/grant denial tests, single-cron assertion, lease-setting bounds tests.
Rollback, in order: restore the previous `reconcile-escrow` code and query path and re-point the existing cron entry; verify a full legacy run succeeds; only then drop the lease RPCs, the two tables and the setting.

### F — Canonical read service and controlled consumer cutover
- Feature flags use the verified existing pattern (`system_settings` + `get_effective_settings` via `settings-resolver.ts`, as `commerce.checkout_enabled` does today). Eight new boolean keys, **default `false`**: `finance.canonical_reads.transaction_detail`, `.transactions`, `.disputes`, `.escrow`, `.payouts`, `.flagged_users`, `.dashboard`, `.exports`. Changeable only by `financial_controls.configure` holders through the existing `admin-system-settings` function. Rollback per consumer = set back to `false`.
- New `_shared/financial-read.ts` over the canonical model and authoritative RPCs; frontend contract `src/services/financial-model.service.ts`.
- Pilot `admin-transaction-detail`; diagnostics contain transaction IDs and minor-unit differences only — no names, emails, account numbers, tokens or provider payloads.
- Cutover criterion per consumer: zero-minor-unit difference on every reconciled record, and every non-reconciled record explained by a named `requires_review` reason. Order: Transactions list/detail → Disputes → Escrow and release/refund queues → Payouts (`admin-payouts-list`, `admin-payouts-detail`: payout ID, transaction ID, item, seller, payout-account owner, gross, deductions, net, status, timestamps) → Flagged Users → Dashboard → exports (`admin-export-worker`, `admin-export-transaction-data`, `admin-escrow-export`) → audit summaries.
- Summary cards recompute from the same filtered record set, or explicitly label all-time scope. Completed payouts with no valid completion timestamp show "Unavailable" and are marked `requires_review`.
- Dark admin design, routes, components, loading/empty/retry/access-denied/error-boundary states preserved.
Gate: per-consumer parity, URL-filter and date-scope parity, export parity, route and permission tests, feature-flag rollback test, no console/network regressions.

### G — Admin remediation report (read-only + dry run)
Extends the existing Financial remediation tab on `/admin/reconciliation`: stored vs canonical vs exact difference, affected records/screens, severity, evidence, recommended compensating action, status. Reads gated by `financial_controls.view` in `PermissionRoute` and `requirePermission` in `admin-reconciliation`. Dry-run preview writes nothing and is repeatable with identical output. **Apply is built disabled and never executed in this correction**; the only existing permission that could ever authorize it is `financial_controls.approve` (roles `super_admin`, `finance_approver`) — no permission is created or granted here. Any future apply appends compensating entries with deterministic key + fingerprint, reason, actor, correlation ID, before/after evidence and audit event. No bulk fix-all anywhere.
Gate: unauthorized-role denial in UI and backend, dry-run repeatability, zero-write proof, idempotent apply simulation in tests only, audit completeness.
Rollback: the tab reverts to its current read-only content.

### H — Independent final verification and handoff
Re-enumerate every writer and consumer **from the resulting codebase** and diff against the Checkpoint A inventory; require zero bypasses (zero direct value-affecting ledger DML outside guarded RPCs, proved by both code inventory and grant tests). Run typecheck; configured lint; production build; the full existing suite; new unit/integration/SQL tests; golden-vector parity; RLS and grant tests; concurrency tests; migration preflight/postflight, lock_timeout-failure, re-run-safety, partial-deployment-recovery and rollback tests in a disposable environment; route and permission tests; browser console and network checks. Verify canonical values for the known inconsistent records (SD-2026-000019/21/23/24, the 3-row `admin_unfreeze` anomaly, the completed payout with no timestamp) and representative clean transactions under identical filters across Transactions, Disputes, Escrow, Payouts, Flagged Users, Dashboard, exports and audit records; verify Dashboard mismatch count and compliance state exactly equal Escrow's under the same filters; exercise full release, partial refund, full refund, failed payout, retry, adjustment, reversal, mismatch, concurrent duplicate submission and completion-timestamp behaviour; confirm no historical deletion, silent rewrite, secret exposure, blank screen, dead route, console error or repeated network loop.
Skipped tests are reported individually with reasons; a skipped critical financial test is not a pass. Deliverables: implementation report; exact changed files/migrations/functions; verification evidence; remaining non-applied remediation items; role-based UI smoke-test guide. Then stop, pending the user's smoke-test confirmation.

## 9. Exact scope

Migrations: **3** (`B`, `D`, `E`).

- Columns added: **2** (`escrow_ledger_entries.idempotency_key`, `.payload_fingerprint`), nullable, no backfill.
- CHECK constraints added: **4** (key shape, fingerprint shape, paired-null on the ledger; `status` vocabulary on `reconciliation_findings`).
- Indexes added: **3** (`escrow_ledger_idem_key`; `reconciliation_findings` partial unique on open findings; `financial_idempotency_conflicts` dedup unique).
- Triggers added: **1** (`escrow_ledger_require_idem`); existing `prevent_escrow_ledger_delete` retained.
- Tables added: **3** (`financial_idempotency_conflicts`, `reconciliation_runs`, `reconciliation_findings`) — all RLS default-deny, service-role mutation only, no direct client reads.
- Grants changed: **1 revoke set** (`INSERT, UPDATE, DELETE` on `escrow_ledger_entries` from `anon`, `authenticated`, `service_role`), SELECT retained; EXECUTE granted to `service_role` on new/rewritten RPCs.
- Policies added: **0 direct-read policies** on the new tables (default deny by design).
- Functions rewritten: **10** (#1–#10), with signature extensions on #2, #5, #6, #7, #9, #10. Unchanged but state-tested: **1** (#11). Functions added: **6** (`record_payment_capture_atomic`, `record_completion_release_intent_atomic`, `canonical_fingerprint_v1`, `claim_reconciliation_lease`, `heartbeat_reconciliation_lease`, `close_reconciliation_lease`).
- Settings added: **9** (8 canonical-read flags + `finance.reconciliation_lease_timeout_seconds`).
- Edge Functions modified: `_shared/release-core.ts`, `_shared/reconciliation.ts`, new `_shared/financial-writer.ts`, new `_shared/financial-read.ts`, `verify-paystack-payment`, `paystack-webhook`, `seller-confirm-completion`, `retry-payout`, `admin-transaction-actions`, `resolve-release-review`, `reconcile-escrow`, `admin-transaction-detail`, `admin-transactions-monitor`, `admin-disputes-queue`, `dispute-detail`, `admin-escrow-overview`, `admin-escrow-detail`, `admin-payouts-list`, `admin-payouts-detail`, `admin-flagged-user-detail`, `admin-dashboard`, `admin-export-worker`, `admin-export-transaction-data`, `admin-escrow-export`, `admin-reconciliation`.
- Frontend: `src/services/financial-model.service.ts` (new) plus the consumer services/screens in F. No design or route change.
- Permissions: no new key, no new grant, no role change. Reads `financial_controls.view`; settings `financial_controls.configure`; remediation apply would need `financial_controls.approve` and stays disabled.
- Data: no historical row modified or deleted.

Conditional (Checkpoint A discovery; stop rule instead of silent expansion): any writer outside §3; any live dependency on direct ledger DML; any pre-existing idempotency-like column; any second cron path; any consumer not listed.

## 10. Test matrix

Canonical model units (parser, minor units, identities, settlement separation) · fingerprint golden vectors executed in both TypeScript and SQL · per-writer request-level duplicate, concurrent duplicate, and different-payload conflict · durable conflict-audit tests (zero mutation, exactly one event, failure surfaced) · bundle atomicity, conservation and crash/partial-failure · SQL invariants (over-refund, over-release, over-completion, over-reversal, duplicate finalization, terminal-state conflict, sign correctness, append-only, trigger inclusion/exclusion) · grant-bypass tests for `anon`/`authenticated`/`service_role` · reconciliation (lease overlap, stale takeover, heartbeat, dedup incl. severity change, proof closure, parity, single cron, lease-setting bounds) · RLS/grant denial on all new tables · consumers (per-screen parity, URL-filter/date-scope parity, export parity) · migration (lock_timeout failure, re-run safety, partial-deployment recovery, full rollback) · routes, permissions, error boundaries, console/network.

## 11. Expected UI impact

No visual redesign, no route change. Money figures become consistent across Transactions, Disputes, Escrow, Payouts, Flagged Users, Dashboard and exports; payout detail fields corrected; missing completion timestamps show "Unavailable" with a `requires_review` marker; the remediation tab gains per-record dry-run detail with the apply action disabled.

## 12. Exclusions and blockers

Excluded: publishing/deploying, bulk historical remediation, executing any remediation apply, destructive data change, non-NGN currency work, permission/role broadening, Correction 2 scope. Routed to remediation review rather than migration: the 3-row `admin_unfreeze` adjustment anomaly, the 19 null-`reference_id` ledger rows, the completed payout without a completion timestamp, and the resolved-dispute/funds-pending-release rows. No blocking product question remains.