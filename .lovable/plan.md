
# Phase B Audit & Closeout Plan

## Verdict

Phase B is **~85% complete**, not 100%. Backend is wired end-to-end (release-funds, refund-buyer, retry-payout, flag-for-release-review, resolve-release-review, paystack-webhook events for transfer.success/failed/reversed/refund.processed/refund.failed, payout-account verification with Paystack, money helpers, queue + RLS), **but seven concrete gaps will break the pipeline at runtime or violate the approved spec.** All are small.

---

## What's already done (verified against DB + code)

- Migration 019 equivalents shipped: payout_accounts has provider/recipient/error/response cols + verification_status CHECK; payouts has retry_allowed / failed_attempt_count / last_release_error / last_release_attempt_at / release_blocked / payout_blocked_reason / release_approved_by_user_id / released_at / notes; transactions has release_approved_at / release_approved_by / release_completed_at / release_review_reason / needs_release_review.
- payout_status enum extended with awaiting_release, blocked, reversed.
- refunds table exists with refund_status enum, partial unique index on provider_reference, one-open-per-tx unique, and RLS for buyer + admin.
- payment_webhook_logs has UNIQUE(provider, event_type, provider_reference) WHERE provider_reference IS NOT NULL — exactly the spec's idempotency key.
- release_review_queue with rrq_unique_open_per_type and full status set (pending/claimed/processing/failed/released/refunded/held/dismissed/awaiting_info/resolved/cancelled).
- _shared/auth.ts (requireAdmin), paystack.ts, money.ts (nairaToKobo/koboToNaira), notify.ts, release-core.ts.
- Edge functions: update-payout-account (calls Paystack first, persists only on 2xx, masks to last4, auto-unblocks payouts), release-funds, refund-buyer, retry-payout, flag-for-release-review, resolve-release-review, seller-confirm-completion.
- paystack-webhook handles charge.success, transfer.success, transfer.failed, transfer.reversed, refund.processed, refund.failed.
- SQL helpers present: release_payout_atomic, complete_payout_atomic, fail_payout_atomic, reverse_payout_atomic, start_refund_atomic, complete_refund_atomic, fail_refund_atomic, flag_for_release_review.
- system_settings seeded: payout_max_retry_attempts, release_review_severity_threshold, release_review_target_hours.

---

## Gaps (the only remaining work)

### Gap 1 — `start_refund_atomic` references columns that don't exist on `refunds` (BLOCKER)

The function inserts into `refund_amount`, `notes`, `initiated_by_user_id`, `provider`, but the actual `refunds` columns are `amount`, `reason`, `failure_reason` only — no `notes`, no `initiated_by_user_id`, no `provider`, no `failed_attempt_count`. Every `refund-buyer` call will currently throw `column "refund_amount" of relation "refunds" does not exist`.

Fix options (pick one in implementation):
- A. Migration: add the missing columns to `refunds` (`notes text`, `initiated_by_user_id uuid`, `provider text default 'paystack'`, `provider_response jsonb`, `failed_attempt_count int default 0`) and rename `amount` → `refund_amount` (or keep `amount` and update the function). Spec calls for these fields — go this route.
- B. Rewrite `start_refund_atomic` to use only existing columns (`amount`, `reason`).

Recommendation: A — bring schema to spec, since notes + initiated_by + provider tracking are real ops needs.

### Gap 2 — `retry_payout_atomic` SQL function never landed in DB (BLOCKER)

Migration file `20260502000000_b5_retry_payout_atomic.sql` exists in the repo but `pg_proc` shows no `retry_payout_atomic`. The migration must have failed silently or been superseded. The `retry-payout` edge function calls `supabase.rpc('retry_payout_atomic', …)` and will 500.

Fix: re-run / re-author the migration so the function is actually installed. Verify with `SELECT proname FROM pg_proc WHERE proname='retry_payout_atomic'`.

### Gap 3 — `transfer.reversed` after a successful release can't move money out of `funds_released` (SPEC VIOLATION)

`validate_money_transition` marks `funds_released` as terminal (returns false). The spec requires: on reversal after success, post a reversal ledger entry and move money to `funds_frozen`. Today the reverse handler will fail the transition.

Fix: relax `validate_money_transition` to allow exactly `funds_released → funds_frozen` (and only that — keep the rest of the terminal guard). Add `reason='transfer_reversed'` to history.

### Gap 4 — Edge function naming doesn't match the approved spec (NAMING)

Spec: `release-payout`, `refund-transaction`. Shipped: `release-funds`, `refund-buyer`. These are server-internal names but the plan explicitly approved the rename. Either:
- A. Rename folders to `release-payout` and `refund-transaction` (and update any client/server callers — currently none in `src/`).
- B. Document that we're keeping `release-funds`/`refund-buyer` and update the spec.

Recommendation: A — they're admin-only, no public callers, so the rename is cheap and keeps spec/code in lockstep.

### Gap 5 — Buyer notification copy on `transfer.success` (SPEC NIT)

The reviewer specifically called out: buyer notification should say "Funds released to seller", not anything implying the transaction just completed. Audit the webhook's `transfer.success` branch and `releasePayoutCore`'s buyer notification text and align.

### Gap 6 — `seller-payouts` B7 contract incomplete (CONTRACT)

Today the response exposes `payout_account.{verified, verification_status, masked_account_number, ...}` but is missing the spec's B7 fields:
- `payout_account.recipient_code_present: boolean` (derived from `provider_recipient_code IS NOT NULL`)
- per-row `status_label` (server-rendered seller-friendly string per the spec's mapping table)
- per-row `block_reason_code`
- per-row `retry_eligible: false` (always false for sellers)
- aggregates: `awaiting_release_count`, `processing_count`, `failed_count`

Fix: extend the JSON shape and the matching TS types in `src/services/seller-payouts.service.ts`. No UI change — UI work is deferred.

### Gap 7 — `update-payout-account` doesn't flip a previously-verified account to `requires_update` on edit (SPEC)

Spec line: "Editing a previously-verified account flips status back to `requires_update` until Paystack re-verifies." Today every edit goes straight through Paystack. If Paystack succeeds, this is moot — but if the seller submits a change and Paystack returns 5xx (we early-return 502 without persisting), the previously-verified row still shows `verified` even though the seller intent has changed.

Fix: before calling Paystack on an UPDATE (not INSERT) when the account_number/bank_code differs from the stored masked last4 + bank_code, set `verification_status='requires_update'` first. Then proceed with the Paystack call as today.

---

## Implementation order (one go)

1. Migration `020_phase_b_closeout.sql`:
   - Add missing `refunds` columns + rename `amount → refund_amount` (Gap 1).
   - Re-create `retry_payout_atomic` (Gap 2).
   - Update `validate_money_transition` to permit `funds_released → funds_frozen` only (Gap 3).
   - Update `start_refund_atomic` body to match the new `refunds` columns.
2. Rename edge function folders `release-funds → release-payout`, `refund-buyer → refund-transaction` (Gap 4). Update internal references.
3. Patch buyer notification copy in webhook + release-core (Gap 5).
4. Extend `seller-payouts/index.ts` response shape and `seller-payouts.service.ts` types (Gap 6).
5. Patch `update-payout-account` to set `requires_update` before Paystack call on edits (Gap 7).
6. Verify with `supabase--read_query` that all helpers exist; run `supabase--curl_edge_functions` smoke tests on `release-payout` (no-op idempotency path) and `refund-transaction` (guard rejection path).

---

## Out of scope (per approved Phase B plan)

- Override seller confirmation (deferred to Exception phase)
- Partial refunds and refund-after-payout (dispute phase)
- Cron stuck-tx watchdog (Phase E)
- Admin queue UI (separate UI plan)
- Seller-side payouts UI changes — only the JSON contract is in B7

---

## Risk if we ship as-is

- Any refund attempt **will throw at SQL level** (Gap 1).
- Any failed-payout retry attempt **will throw "function does not exist"** (Gap 2).
- A Paystack reversal after a successful release **will silently fail to flip money state** and leave funds marked released while actually clawed back (Gap 3 — financial-integrity bug).

Closing these seven gaps gets Phase B to genuine 100%.
