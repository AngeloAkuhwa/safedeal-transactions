# Phase B — Gap-Closure Plan

## Audit summary

What's already shipped end-to-end:
- B0 migration: `payout_accounts` extras + CHECK, `payouts` extras, `transactions` release columns, `refunds` table with proper indexes, `payment_webhook_logs` UNIQUE `(provider, event_type, provider_reference)`, system_settings seeds, all atomic SQL helpers (`release_payout_atomic`, `complete_payout_atomic`, `fail_payout_atomic`, `reverse_payout_atomic`, `start_refund_atomic`, `complete_refund_atomic`, `fail_refund_atomic`, `flag_for_release_review`, plus `retry_payout_atomic` from B5).
- `_shared`: `auth.ts`, `paystack.ts`, `money.ts`, `notify.ts`, `log-error.ts`, `pricing.ts`.
- B1 `update-payout-account`: Paystack-first ordering, masked-only persistence, fail-path logged. ✅
- B2 `release-funds`: admin-gated, atomic, stable reference, Paystack call, rollback on failure. ✅ (one gap, see below)
- B3 `paystack-webhook`: handles `transfer.success`, `transfer.failed`, `transfer.reversed`, `refund.processed`, `refund.failed`, with the UNIQUE event-key dedupe. ✅
- B4 `refund-buyer`: admin-gated, uses `start_refund_atomic`, hits Paystack `/refund`. ✅ (one tightening, see below)
- B5 `retry-payout`: shipped.
- B7 piece 1 `flag-for-release-review`: shipped.

What's missing or wrong:

## Gap 1 — `release-funds` is missing the idempotency short-circuit

Spec requires: if `payout.status IN ('processing','completed')` AND `provider_reference IS NOT NULL`, return current state without calling Paystack again. Today the function rejects with `409 payout_not_awaiting`, which forces the caller to treat a normal in-flight retry as an error.

**Fix:** before the "must be `awaiting_release`" guard, add an early return: if `status` is `processing` or `completed` and `provider_reference` is set, respond `200 { ok: true, idempotent: true, status, provider_reference }`. No state mutation, no Paystack call.

## Gap 2 — `payout_status` enum has no `reversed` label

`reverse_payout_atomic` currently writes `status = 'failed'` with `failure_reason = 'reversed: …'` because the enum lacks a `reversed` label. This loses the high-severity signal the spec calls for and conflates true Paystack failures with reversals.

**Fix (migration):**
1. `ALTER TYPE payout_status ADD VALUE 'reversed'` (must run outside a transaction — use a standalone migration with no `BEGIN`).
2. Follow-up migration that updates `reverse_payout_atomic` to write `status = 'reversed'` instead of `'failed'`, and updates the seller-payouts label map (Gap 5) to translate `reversed → "Reversed"`.

## Gap 3 — `refund-buyer` accepts partial amounts; spec is full-only for Phase B

Today the function accepts an optional `amount` and computes `isPartial`. Phase B is explicitly "full refund only".

**Fix:** drop the `amount` field from the zod schema; always use `payments.amount` (or `transactions.total_amount` if that's what `start_refund_atomic` expects today). Remove `isPartial` branch and the partial-amount kobo path. Add the spec's hard guard: reject if any payout exists with `status IN ('processing','completed')` → `409 payout_already_completed`.

## Gap 4 — B6 `resolve-release-review` function does not exist

The spec's resolution endpoint is missing. It's the operator's single entry point for closing a queued case.

**Fix:** create `supabase/functions/resolve-release-review/index.ts`:
- `requireAdmin`, CORS, zod input `{ transaction_id, resolution: 'release'|'refund'|'hold'|'dismiss'|'request_more_info', notes: string (≥10 chars) }`.
- Verify an open queue row exists for the tx; 409 if not.
- Branch:
  - `release` → call the same internals as `release-funds` by importing a shared `releasePayoutCore(supabase, tx_id, admin_id, notes)` helper extracted from `release-funds/index.ts`. No HTTP self-call.
  - `refund` → call extracted `refundBuyerCore(...)` from `refund-buyer`.
  - `hold` → set `transactions.needs_release_review = true`, `release_review_reason = 'manual_hold'`; `release_review_queue.status = 'held'`; do not transition money (money state machine doesn't permit free `* → funds_frozen`; this is a flag-only hold).
  - `dismiss` → block (409) if any blocker is still active: pricing missing, payout account unverified, open dispute, or `release_review_reason IN ('payout_account_missing','pricing_missing','silent_dispute','transfer_reversed')`. Otherwise clear `needs_release_review`, `release_review_reason = NULL`, queue → `dismissed`.
  - `request_more_info` → queue → `awaiting_info`, leave open, fan-out notification to the relevant party.
- Always insert `admin_actions(action_type='escalate_case' | 'release_funds' | 'refund_buyer')` and a `case_reviews` row with the notes.

This requires a tiny refactor of `release-funds/index.ts` and `refund-buyer/index.ts` to extract their core into reusable functions while keeping the existing HTTP handlers as thin wrappers. No behavior change to the existing endpoints.

## Gap 5 — B7 `seller-payouts` contract not updated

The function still returns raw enum strings (`status`, `payout_verified` boolean only) — none of the spec's seller-friendly fields.

**Fix to `supabase/functions/seller-payouts/index.ts`:**
- Add `payout_account` block: `{ verified, recipient_code_present, status }` derived from `payout_accounts.verification_status` and `provider_recipient_code IS NOT NULL`.
- Per payout row, attach:
  - `status_label` from the spec map: `awaiting_release → "Awaiting Release"`, `pending → "Release Approved"`, `processing → "Payment Processing"`, `completed → "Paid Out"`, `failed → "Release Failed"`, `reversed → "Reversed"`, `cancelled → "Cancelled"`, `blocked → "Action Required"`.
  - `block_reason_code` = `payout_blocked_reason` (already in DB).
  - `retry_eligible: false` always (sellers never retry; internal-only).
- Aggregates: `awaiting_release_count`, `processing_count`, `failed_count` (a couple of these already exist; align names).
- Mirror this in `src/services/seller-payouts.service.ts` types so the UI consumes the new shape. No UI changes in this phase — the service contract update is purely additive aside from the renames.

## Gap 6 — Webhook `transfer.failed` should not say "calm copy" only; ops severity for `reversed` must be `high`

Quick audit confirmed `transfer.reversed` handler runs but doesn't emit an ops `security_alert` with `severity: 'high'`. Spec requires paging ops immediately.

**Fix:** in `paystack-webhook/index.ts` `transfer.reversed` branch, after `reverse_payout_atomic` succeeds, call `notifyOpsTeam` (already in `_shared/notify.ts`) with `severity: 'high'`, message including the tx code and Paystack reason. Same pattern already used in `release-funds` failure path.

---

## Out of scope (deferred, as per Phase B spec)
- `release-payout-exception` (override seller confirmation) — future phase.
- Partial refunds — dispute resolution phase.
- Refund-after-payout — ops runbook phase.
- Cron stuck-tx watchdog — Phase E.
- Seller UI changes consuming the new contract — Phase D.
- Admin queue UI shell — separate plan.

## Implementation order
1. Migration: add `reversed` to `payout_status` (standalone, no-tx).
2. Migration: rewrite `reverse_payout_atomic` to use `'reversed'`.
3. Edit `release-funds` for idempotency short-circuit + extract `releasePayoutCore`.
4. Edit `refund-buyer` to drop partial amounts + add post-payout guard + extract `refundBuyerCore`.
5. Add `resolve-release-review` function.
6. Patch `paystack-webhook` `transfer.reversed` to page ops with `severity: 'high'`.
7. Update `seller-payouts` function + service types with the new contract.

After this lands, Phase B is 100% per the approved spec.
