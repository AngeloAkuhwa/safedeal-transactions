# Phase B (Final) — SafeDeal Mediated Release Backend

## Verdict on the reviewer's feedback

**Direction: correct. Roughly 90% of their corrections are accepted. ~10% needs clarification.**

| # | Reviewer correction | Verdict | Note |
|---|---|---|---|
| 1 | Drop "admin" tokens from product copy; keep them only inside server-internal function names | **Accept** | Aligns with our Phase A naming sweep. |
| 2 | Rename `admin-release-payout` → `release-payout` etc. | **Accept** | Cleaner. UI never sees them anyway. |
| 3 | **Remove `override_seller_confirmation` from Phase B** | **Accept** | It undermines the dual-confirmation contract we just shipped. Move to a future "Exception Handling" phase with a separate function `release-payout-exception` requiring elevated role + evidence. |
| 4 | Stronger idempotency: skip Paystack call when payout already `processing` / `completed` with `provider_reference` | **Accept** | Critical. Prevents double transfers. |
| 5 | Better webhook uniqueness key: `(provider, event_type, provider_reference)` + optional `provider_event_id` | **Accept** | |
| 6 | Queue status set: `pending / claimed / processing / failed / released / refunded / held / dismissed` | **Accept (partial)** | Our queue is `text` typed today — no migration needed, just enforce the literals. |
| 7 | `transfer.failed` shouldn't auto-flip queue back to `pending` (must require explicit retry) | **Accept** | Queue → `failed`, payout → `failed`, `retry_allowed = failed_attempt_count < cap`. |
| 8 | `transfer.reversed` is high-severity, not equivalent to `failed` | **Accept** | Sets `needs_release_review=true`, posts a ledger reversal entry, `release_review_reason='transfer_reversed'`. |
| 9 | Refund only when **no completed payout** exists; full refund only in Phase B | **Accept** | Partial refunds defer to a later dispute-resolution phase. |
| 10 | Seller cannot self-retry payout — internal team only | **Accept** | Page shows "Fix Payout Account" / "Contact Support", never "Retry Transfer". |
| 11 | Verification statuses: `pending / verified / failed / requires_update` | **Partial accept** | Today the column is plain `text`; we'll constrain with a CHECK. `requires_update` is added for the case where seller edits a previously-verified account. |
| 12 | All money math in **kobo** with safe rounding | **Accept** | Single helper `nairaToKobo(n)` in `_shared/money.ts`. |
| 13 | New `release_attempts` audit table | **Defer (out of scope)** | Captured adequately by `payouts.failed_attempt_count` + `edge_function_errors` + `money_status_history`. We can add the dedicated table in Phase E if telemetry needs deepen. |
| 14 | New `refunds` table | **Accept (small migration)** | Today there's no refunds table — we need one to track Paystack refund references and statuses independently from `payouts`. |
| 15 | `provider_event_hash` column on webhook logs | **Defer** | `(provider, event_type, provider_reference)` unique covers our actual events. Not worth schema churn yet. |

**Two corrections I am adding on top of the reviewer:**
- The `update-payout-account` upsert today **only stores a masked account number**. Paystack `/transferrecipient` needs the full 10-digit number. We must call Paystack **before** persisting the masked form, and never store the plaintext. Ordering matters.
- Buyer notification on `transfer.success` should not say "transaction completed" — the buyer's transaction was already `completed` at handshake time. Use "Funds released to seller" instead, to keep the mental model consistent.

---

## Final scope and order

`B0 (migration) → B1 → B3 → B2 → B4 → B5 → B6 → B7 (contract only)`

---

### B0 — Migration `019_phase_b_release_pipeline.sql`

1. **`payout_accounts`**: add `provider text`, `provider_recipient_id text`, `last_verification_error text`, `provider_response jsonb`. Add `CHECK (verification_status IN ('pending','verified','failed','requires_update'))`.
2. **`payouts`**: add `last_release_error text`, `last_release_attempt_at timestamptz`, `retry_allowed boolean NOT NULL DEFAULT false`. (`failed_attempt_count`, `release_blocked`, `payout_blocked_reason`, `release_approved_by_user_id`, `released_at`, `notes`, `provider_reference` already exist.)
3. **`transactions`**: add `release_approved_at timestamptz`, `release_approved_by uuid`, `release_completed_at timestamptz`. (`needs_release_review`, `release_review_reason` already exist.)
4. **New table `refunds`**: `id, transaction_id, payment_id, refund_amount numeric, currency_code text, reason text, notes text, status text CHECK IN ('pending','processing','completed','failed','cancelled'), provider text, provider_reference text, provider_response jsonb, initiated_by_user_id uuid, initiated_at, completed_at, failed_at, failure_reason, failed_attempt_count int default 0, created_at, updated_at`. RLS: parties can SELECT (`is_transaction_party`), no INSERT/UPDATE for end users (service-role only).
5. **`payment_webhook_logs`**: add `provider_event_id text` nullable; create `UNIQUE (provider, event_type, provider_reference)` partial index `WHERE provider_reference IS NOT NULL`. Drop the existing weaker unique if any.
6. **`system_settings`** seed: `payout_max_retry_attempts = 3`, `release_review_severity_threshold = 'medium'`.
7. **State-machine SQL helpers** (`SECURITY DEFINER`, all use `validate_money_transition`): `release_payout_atomic`, `complete_payout_atomic`, `fail_payout_atomic`, `reverse_payout_atomic`, `start_refund_atomic`, `complete_refund_atomic`, `fail_refund_atomic`, `flag_for_release_review`.
8. **`_shared`** code (TypeScript, not SQL): `auth.ts → requireAdmin(req)`, `paystack.ts → { createTransferRecipient, createTransfer, createRefund, verifyWebhookSignature }`, `money.ts → nairaToKobo / koboToNaira`, `notify.ts → notifyUser / notifyOpsTeam`.

### B1 — `update-payout-account` (extend)

1. Validate seller role + ownership, fields (`bank_code`, `bank_name`, `account_number` 10-digit, `account_name`).
2. Call Paystack `POST /transferrecipient` **first** (with the plaintext account number, never persisted).
3. On 2xx: upsert `payout_accounts` with `provider='paystack'`, `provider_recipient_code`, `provider_recipient_id`, `verification_status='verified'`, `last_verified_at=now()`, `last_verification_error=null`, `masked_account_number='****** ' + last4`, `provider_response=...`. Set `account_verifications.payout_verified=true`. Auto-unblock any `payouts` blocked solely by `payout_blocked_reason='payout_account_unverified'` → flip `awaiting_release` and clear queue notes.
4. On 4xx: upsert with `verification_status='failed'`, `provider_recipient_code=null`, `last_verification_error=<paystack message>`. Leave `payout_verified=false`. Log to `edge_function_errors`.
5. On 5xx/network: **do not persist**, return 502, log error.
6. Editing a previously-verified account flips status back to `requires_update` until Paystack re-verifies.

### B2 — New `release-payout` (admin/ops only)

**Auth:** `requireAdmin(req)`. **Input:** `{ transaction_id, notes?, idempotency_key? }`. **No `override_seller_confirmation`.**

**Guards** (all required, first miss returns 409 + machine-readable code):
- tx exists, `status='completed'`, `buyer_confirmed_at NOT NULL`, `seller_confirmed_at NOT NULL`
- `money_status='funds_pending_release'`
- no open dispute, no fraud freeze
- payout row exists, `status='awaiting_release'`, `release_blocked=false`
- `payout_accounts.verification_status='verified'` and `provider_recipient_code IS NOT NULL`
- `transaction_pricing.seller_net_amount > 0`

**Idempotency short-circuit:** if `payout.status IN ('processing','completed')` AND `provider_reference IS NOT NULL`, return current state without calling Paystack.

**Atomic pre-transfer (single SQL function `release_payout_atomic`):**
- payout `awaiting_release → pending`; set `release_approved_by_user_id`, `released_at=now()`, `notes`
- tx money `funds_pending_release → funds_releasing`; set `release_approved_at`, `release_approved_by`
- insert `money_status_history`
- insert `escrow_ledger_entries` `entry_type='payout_awaiting_release'` (already in enum)
- insert `admin_actions(action_type='release_funds')`
- queue → `status='processing'`, `claimed_by_user_id`, `claimed_at=now()`

**Paystack call (after commit):** `POST /transfer { source: 'balance', amount: nairaToKobo(seller_net), recipient, reason: 'SafeDeal payout {tx_code}', reference: 'payout_${payout_id}' }`. Stable reference — retries always reuse the same one so Paystack can dedupe.
- 2xx: payout `pending → processing`, store `provider_reference`, `provider_response`. Notify seller "Your payment release has been approved and is processing." Notify buyer "Funds released to seller."
- 4xx/5xx: rollback via `fail_payout_atomic` — payout → `failed`, money `funds_releasing → funds_pending_release`, `failed_attempt_count += 1`, `last_release_error`, `last_release_attempt_at`, `retry_allowed = (count < payout_max_retry_attempts)`, queue → `failed`. Log to `edge_function_errors`. Notify ops with severity `high`.

### B3 — Extend `paystack-webhook`

Already verifies HMAC-SHA512 over raw body. Add:
- Idempotency key: `(provider, event_type, provider_reference)` UNIQUE; if conflict, return 200 no-op.
- `transfer.success`: short-circuit if payout already `completed`. Else `complete_payout_atomic`: payout → `completed`, money `funds_releasing → funds_released`, `release_completed_at=now()`, `escrow_states.released_amount += amount`, ledger `payout_debit`, queue → `released`. Notify seller "Paid out successfully." Notify buyer "Funds released to seller."
- `transfer.failed`: `fail_payout_atomic` — payout → `failed`, money `funds_releasing → funds_pending_release`, increment counter, `retry_allowed` flag, queue → `failed`, queue notes `transfer failed: {reason}`. Notify seller (calm copy: "Payment release failed. SafeDeal is reviewing it."), notify ops. **No auto-retry.**
- `transfer.reversed`: `reverse_payout_atomic` — payout → `reversed` (new label, queue/payout `text`), if money was already `funds_released` post a reversal ledger entry and set money to `funds_frozen`, otherwise `funds_releasing → funds_pending_release`. Set `transactions.needs_release_review=true`, `release_review_reason='transfer_reversed'`. Queue → `failed` with severity `high`. Page ops immediately.
- `refund.processed`: `complete_refund_atomic` — refunds row → `completed`, money `refund_pending → refund_issued`, `transactions.status → refunded`, ledger `refund_debit`. Notify both parties.
- `refund.failed`: refunds row → `failed`, restore prior money state via `fail_refund_atomic`, alert ops.

### B4 — New `refund-transaction` (admin/ops only)

**Auth:** `requireAdmin`. **Input:** `{ transaction_id, refund_amount?, reason, notes? }`. **Phase B = full refund only**; if `refund_amount` omitted, default to `payments.amount`.

**Guards:**
- payment exists with `status='success'`, `provider_reference NOT NULL`
- money in `{funds_held_in_escrow, funds_pending_release, funds_frozen}`
- **no payout exists with `status IN ('processing','completed')`** (hard block — refund post-payout is a separate, harder ops flow)
- no in-flight `refunds` row with status `pending|processing`
- reason is one of the allowed codes (validated server-side)

**Atomic (`start_refund_atomic`):** insert refunds row `status='pending'`; money → `refund_pending`; if a `payouts` row exists in `awaiting_release|blocked`, set `status='cancelled'`, `notes='refunded by SafeDeal review'`; queue `status='refunded'`; `admin_actions(action_type='refund_buyer')`; ledger snapshot; history.

**Paystack:** `POST /refund { transaction: payments.provider_reference, amount?: kobo, customer_note: reason }`. 2xx → refunds row `pending → processing`, store `provider_reference`. 4xx/5xx → rollback money to prior status, refunds row `failed`, log error.

### B5 — New `flag-for-release-review` (admin/ops only, idempotent)

**Input:** `{ transaction_id, reason, severity?: 'low'|'medium'|'high', notes? }`. **Allowed reasons:** `missing_seller_confirmation`, `missing_buyer_confirmation`, `payout_account_missing`, `pricing_missing`, `delivery_proof_missing`, `silent_dispute`, `failed_payout`, `manual_hold`, `suspicious_activity`.

**Effect:** set `transactions.needs_release_review=true`, `release_review_reason=reason`. Upsert into `release_review_queue` with `queue_type='stuck'`, `status='pending'` — `rrq_unique_open_per_type` index makes the upsert safe. Insert `admin_actions(action_type='escalate_case')`. If severity `high`, page ops via notification fan-out. Phase E cron will call this same function for stuck-detection.

### B6 — New `resolve-release-review` (admin/ops only)

**Input:** `{ transaction_id, resolution: 'release'|'refund'|'hold'|'dismiss'|'request_more_info', notes }` (notes always required, ≥10 chars).

- Validate queue row exists open for this tx; caller has role.
- `release` → invoke B2 in-process (shared service module, not HTTP self-call).
- `refund` → invoke B4 in-process.
- `hold` → money `* → funds_frozen` (if transition allowed), `release_review_reason='manual_hold'`, queue `status='held'`.
- `dismiss` → only allowed if no pricing/payout-account/dispute blocker remains; clear `needs_release_review`, queue `status='dismissed'`.
- `request_more_info` → keep queue open, status `awaiting_info`, notify the relevant party with the requested evidence.

All paths set `resolved_at=now()` (except `request_more_info`) and write `admin_actions`.

### B7 — Seller payouts contract (UI deferred, server only)

`seller-payouts` edge function and `src/services/seller-payouts.service.ts` expose:
- `payout_account: { verified: boolean, recipient_code_present: boolean, status: 'pending'|'verified'|'failed'|'requires_update' }`
- per row: `status_label` (server-rendered seller-friendly string per the table below), `block_reason_code`, `retry_eligible: false` (always — sellers never trigger retries)
- aggregates: `awaiting_release_count`, `processing_count`, `failed_count`

**Status label map (server-side):**

| DB status | Seller label |
|---|---|
| `awaiting_release` | Awaiting Release |
| `pending` | Release Approved |
| `processing` | Payment Processing |
| `completed` | Paid Out |
| `failed` | Release Failed |
| `reversed` | Reversed |
| `cancelled` | Cancelled |
| `blocked` | Action Required |

UI work (chips, tooltip "Both parties confirmed. SafeDeal is reviewing the release.", red "Bank not verified" badge, no Retry button) is mechanical and lives in the next phase.

---

## Test plan (acceptance, runnable end-to-end)

1. Happy path: seeded handshaked tx → `release-payout` → payout `processing`, money `funds_releasing`, `provider_reference` set → simulate `transfer.success` → money `funds_released`, ledger `payout_debit`, queue `released`, seller "Paid Out" notification.
2. Idempotency: replay `release-payout` while `processing` → no second Paystack call, returns existing state.
3. Idempotency: replay `transfer.success` webhook → second call no-ops via UNIQUE.
4. Failure: Paystack `/transfer` 4xx → full rollback, `failed_attempt_count=1`, `retry_allowed=true`, queue `failed`.
5. Reversal: send `transfer.reversed` after a `transfer.success` → reversal ledger entry, money → `funds_frozen`, `needs_release_review=true`, `release_review_reason='transfer_reversed'`, ops paged.
6. Guards: open dispute → release rejected 409 (`code='open_dispute'`). Missing recipient code → 409 (`code='payout_account_unverified'`). Missing pricing → 409 (`code='pricing_missing'`).
7. Refund happy path: B4 with no payout → `refund.processed` webhook → `funds_released`-equivalent: `refund_issued`, ledger `refund_debit`, both parties notified.
8. Refund block: try B4 after `transfer.success` → 409 (`code='payout_already_completed'`).
9. `update-payout-account` Paystack 4xx → `verification_status='failed'`, blocked payouts stay blocked, error logged.
10. `flag-for-release-review` called twice with same `(tx, reason)` → single queue row.
11. `resolve-release-review` `dismiss` while `payout_account_missing` blocker still present → 409.

---

## Out of scope (explicitly deferred)

- **Override seller confirmation** (separate `release-payout-exception` function, future phase).
- **Partial refunds** (dispute-resolution phase).
- **Refund-after-payout** (more complex; involves recovery from seller; ops-runbook phase).
- **Cron stuck-tx watchdog** (Phase E).
- **Seller analytics** (Phase D).
- **Admin queue UI shell** (separate UI plan once endpoints land).

---

## Direction call

**Yes — we are moving in the right direction.** The reviewer's corrections strengthen the original draft and are now folded in. The single most consequential change is **dropping `override_seller_confirmation`** — that protects the dual-confirmation contract we just shipped in Phase A. Everything else is hardening: better idempotency, clearer status taxonomy, refunds-as-first-class, no seller-initiated retries.

Approve this plan to proceed with implementation in the order `B0 → B1 → B3 → B2 → B4 → B5 → B6 → B7`.
