
# Phase B4 — `release-funds` edge function

## Goal

Build a single admin-callable endpoint that takes a transaction in `funds_pending_release` and initiates the Paystack Transfer to the seller. The function flips the DB into `funds_releasing` **before** calling Paystack, so a duplicate click cannot trigger two transfers. The terminal `funds_released` flip happens later in `paystack-webhook` (already built in B3).

## Contract

Endpoint: `POST /functions/v1/release-funds`

Auth: `requireAdmin` (Bearer token; 401/403 on failure).

Request body (validated with zod):
```
{
  "transaction_id": "uuid",        // required
  "payout_id": "uuid" (optional),  // disambiguates if multiple payouts exist
  "notes": "string" (optional, max 500)
}
```

Response:
- `200 { ok: true, payout_id, transfer_reference, transfer_code, status }`
- `400` validation / business-rule rejection (with `code`)
- `401` / `403` auth
- `409` state conflict (e.g. `not_in_pending_release`, `payout_blocked`, `recipient_missing`)
- `502` Paystack error (state already rolled back to `funds_pending_release`)
- `500` unexpected (logged via `log-error`)

## Flow (in order, with safety stops)

1. **Auth**: `requireAdmin(req)` → `{ adminClient, userId }`.
2. **Validate body** with zod. Reject on bad input.
3. **Load transaction** (`id, money_status, seller_id, currency_code, transaction_code`). Reject if not `funds_pending_release` → 409 `not_in_pending_release`.
4. **Resolve payout**:
   - If `payout_id` provided, fetch and confirm it belongs to this transaction and is in `awaiting_release`.
   - Otherwise, find the single `awaiting_release` payout for the transaction. If 0 → 409 `no_awaiting_payout`. If >1 → 409 `ambiguous_payout` (force the caller to pass `payout_id`).
   - Reject if `release_blocked = true` → 409 `payout_blocked` (return `payout_blocked_reason`).
5. **Resolve seller payout account**: fetch `payout_accounts` row for seller where `is_active = true` AND `recipient_code IS NOT NULL`. If missing → 409 `recipient_missing` (and call `flag_for_release_review` with reason `missing_recipient` so it lands back in the queue with the right banner).
6. **Atomic state flip — `release_payout_atomic`** (RPC already exists):
   - Asserts `funds_pending_release` and `payout.status = awaiting_release` under row locks.
   - Flips payout → `pending`, sets `release_approved_by_user_id`, `released_at`, `last_release_attempt_at`.
   - Flips transaction → `funds_releasing` and writes `money_status_history`.
   - Inserts `admin_actions` row (`action_type = release_funds`).
   - Marks `release_review_queue` row → `processing`, claims it for this admin.
   - On RPC failure (e.g. someone else already advanced it), return 409 with the Postgres error code.
7. **Build deterministic Paystack reference**: `payout_${payout.id}` (matches what `paystack-webhook` looks up — see `findPayoutByReference`).
8. **Call Paystack Transfer** via `_shared/paystack.createTransfer`:
   - `source: "balance"`, `amount: nairaToKobo(payout.amount)`, `recipient: recipient_code`, `reason: "SafeDeal release for ${transaction_code}"`, `reference: payout_${payout.id}`.
9. **Persist provider result** on the payout row: `provider_reference = reference`, `initiated_at = now()`, append the transfer code into `notes` (audit only — webhook is the source of truth for completion).
10. **On Paystack non-OK** (network, 4xx, `status: false`):
    - Call `fail_payout_atomic(payout_id, reason, max_retries)` so:
      - payout → `failed` with `last_release_error`,
      - transaction rolls back `funds_releasing → funds_pending_release`,
      - queue row → `failed`.
    - Notify ops via `notifyOpsTeam` (severity `high`).
    - Return `502 { error: "paystack_transfer_failed", message }`.
11. **On Paystack OK**:
    - Insert a `transaction_event` row (`type: release_initiated`, actor = admin).
    - Notify the seller (`notifyUser`, type `payment_update`, "We're releasing your funds…").
    - Return `200`.
    - **Do not** mark `funds_released` here. That happens in `paystack-webhook` on `transfer.success` (already wired in B3) — guarantees we only confirm once Paystack confirms.

## Files

- **New**: `supabase/functions/release-funds/index.ts`
- **No DB migration needed** — `release_payout_atomic`, `fail_payout_atomic`, and `flag_for_release_review` already exist; `payouts` already has `provider_reference`, `initiated_at`, `notes`.
- **No client/UI changes in B4** — endpoint will be consumed later by the admin console (Phase C+). For now, it's exercised via `supabase--curl_edge_functions`.

## Idempotency & race safety

- Two simultaneous calls: only one wins `release_payout_atomic` (row lock + status guard); the other gets `payout_not_in_awaiting_release` → 409.
- Webhook arrives before our `provider_reference` write completes: webhook lookup falls back to `payout_${payout_id}` in the reference convention, then to `provider_reference` — both resolve. The atomic completer in `complete_payout_atomic` is idempotent.
- Caller retries after a 502: payout is already `failed` with `retry_allowed` set per `payout_max_retry_attempts`. Retry path will be its own endpoint in B-later (`retry-payout`); B4 does not auto-retry.

## Tests (Deno, `index_test.ts`)

1. Rejects unauthenticated / non-admin (`401` / `403`).
2. Rejects invalid body (`400`).
3. Rejects when transaction not in `funds_pending_release` (`409 not_in_pending_release`).
4. Rejects when no active recipient on payout account (`409 recipient_missing`) and verifies a queue row was flagged.
5. Happy path with a mocked Paystack OK: asserts payout flipped to `pending`, transaction to `funds_releasing`, `provider_reference = payout_<id>`, queue row claimed, `admin_actions` row written, seller notification queued.
6. Paystack failure path: asserts rollback to `funds_pending_release`, payout `failed`, queue `failed`, ops notification, 502 response.

## Out of scope for B4

- Retry endpoint (`retry-payout`) — B5.
- Manual refund endpoint (`refund-buyer`) — B6.
- Admin UI — comes after the backend pipeline is fully tested.

## Acceptance

- `curl POST /release-funds` against a seeded `funds_pending_release` transaction, with admin token, drives it to `funds_releasing` and produces a real Paystack `transfer.success` webhook that the existing `paystack-webhook` handler closes out to `funds_released`.
- All non-happy paths leave the system in a consistent state (no transaction stuck in `funds_releasing` without either a webhook resolution or a `failed` payout + rollback).
