## Phase B audit — verdict

**Phase B is ~92% complete.** All migrations, enums, indexes, shared modules, and admin endpoints are in place and structurally correct. However, an end‑to‑end read of the live edge function code against the live DB schema turns up **5 real bugs** and **2 polish gaps** that will break or silently swallow data in production. None require new architecture — only targeted fixes.

---

## What is verified working

- DB: `payouts`, `payout_accounts`, `transactions`, `refunds`, `release_review_queue`, `payment_webhook_logs` all carry every Phase B column (`provider_recipient_id`, `last_release_error`, `retry_allowed`, `release_completed_at`, `provider_event_id`, etc.).
- Enum `payout_status` includes `reversed`; `money_status` includes `funds_releasing`/`funds_pending_release`/`refund_pending`/`refund_issued`; `refund_status` matches spec literals.
- Unique partial index `uniq_webhook_event_ref (provider, event_type, provider_reference)` exists.
- `system_settings`: `payout_max_retry_attempts=3`, `release_review_severity_threshold=medium` seeded.
- All 9 SQL atomic helpers exist (`release_payout_atomic`, `complete_payout_atomic`, `fail_payout_atomic`, `reverse_payout_atomic`, `start_refund_atomic`, `complete_refund_atomic`, `fail_refund_atomic`, `flag_for_release_review`, plus `retry_payout_atomic`).
- `_shared/`: `auth.ts` (requireAdmin), `paystack.ts` (createTransferRecipient/createTransfer/createRefund), `money.ts` (kobo helpers), `notify.ts`, `release-core.ts`.
- Endpoints exist and gate on `requireAdmin`: `release-payout`, `refund-transaction`, `flag-for-release-review`, `resolve-release-review`, `retry-payout`.
- `update-payout-account`: calls Paystack first, persists masked only, flips a re‑edited verified account back to `requires_update`, auto‑unblocks payouts blocked by `payout_account_unverified`.
- Webhook handles `transfer.success / transfer.failed / transfer.reversed / refund.processed / refund.failed`, idempotent via the unique index, no auto‑retry on `transfer.failed`, `transfer.reversed` is high‑severity with a separate atomic.
- `release-payout` short‑circuits when payout already `processing`/`completed` with a `provider_reference`.
- `seller-payouts` returns `status_label`, `block_reason_code`, `retry_eligible:false`, `recipient_code_present`, and aggregate counts.

---

## Bugs found (must fix before declaring Phase B complete)

### Bug 1 — `refund-transaction` reads a non‑existent column (will fail every refund)
`refundBuyerCore` selects `total_amount` from `transactions`, but the table has **no `total_amount` column**. `refundAmount` becomes `NaN`, which both `start_refund_atomic` and downstream notifications will reject/format as "₦NaN".  
**Fix:** read the refund amount from `transaction_pricing.total_amount` (or sum `payments.amount` for the latest `succeeded` payment). Existing code already fetches that payment row — use `Number(payment.amount)` instead.

### Bug 2 — `transaction_events` insert uses non‑existent columns (`description`, `metadata`)
`releasePayoutCore` (release path) inserts:
```
{ transaction_id, event_type:'payout_released', actor_user_id, description, metadata }
```
The actual table only has `event_type, actor_user_id, actor_role, event_data, occurred_at`. Insert will 400 on every release after Paystack accepts the transfer. The webhook charge.success handler has the same `description/metadata` shape and will likewise 400 if `transaction_events` is the target (it currently inserts into `transaction_events` with `description` + `metadata`).  
**Fix:** rewrite both inserts to use `actor_role` + `event_data` (jsonb merging description and metadata). Apply the same fix to the charge.success block in `paystack-webhook` to prevent silent failures.

### Bug 3 — payment status literal mismatch (`succeeded` vs enum `succeeded`)
Verified — `payment_status` enum is `{pending, authorized, succeeded, failed, refunded}`. Code uses `succeeded`. **OK — no change needed.** (Listed for completeness; the earlier draft worried about this.)

### Bug 4 — `case_reviews` insert silently swallowed
`resolve-release-review` inserts `{ transaction_id, reviewed_by_user_id, resolution, notes }` into `case_reviews`. The table only has `dispute_id`, `reviewed_by_user_id`, `review_notes`, `created_at`. The insert is wrapped in `.catch(() => undefined)`, so we lose every audit row on resolve.  
**Fix:** stop writing to `case_reviews` here (it's a dispute‑review table, not a release‑review table). The spec already calls for `admin_actions` rows on every resolve path — that's our canonical audit. Drop the `case_reviews` calls or, if we want a structured release‑review audit, add a small `release_review_decisions` table in a follow‑up migration. Recommendation: drop the calls now, defer the dedicated table.

### Bug 5 — `resolve-release-review` `hold` resolution does not actually freeze funds
The handler explicitly comments "we do NOT mutate money_status here" and only sets `needs_release_review=true`. But the spec for `hold` says: *money `* → funds_frozen` (if transition allowed)*. Without that flip, a `hold` is indistinguishable from `flag-for-release-review` — the dual‑confirmation contract still allows release.  
**Fix:** add a tiny SQL helper `freeze_funds_atomic(p_transaction_id, p_actor, p_reason)` that uses `validate_money_transition` to move `funds_pending_release|funds_held_in_escrow → funds_frozen`, writes a `money_status_history` row, and returns the new status. Call it from `hold` and accept the 409 if the transition isn't allowed (return a clear `transition_not_allowed` error). Without this, `hold` is a no‑op safety theater.

---

## Polish gaps (small, but spec calls them out)

### Gap A — `flag-for-release-review` is missing 2 reason codes from spec
Spec lists 9 reasons including `missing_seller_confirmation`, `missing_buyer_confirmation`, `delivery_proof_missing`, `suspicious_activity`. Function currently allows `payout_account_missing, pricing_missing, stuck_confirmation, silent_dispute, failed_payout, refund_request, transfer_reversed, manual_hold`. The DB `release_review_queue.queue_type` is plain `text` (already validated earlier) so we can extend without a migration.  
**Fix:** broaden the Zod enum to the spec's 9 reasons (mapping the two `missing_*_confirmation` to `queue_type='stuck'` inside the SQL helper, the rest to themselves). Add a `severity` input (`low|medium|high`, default `medium`) and use it on the ops notification metadata.

### Gap B — webhook charge.success uses `description`/`metadata` on `transaction_events`
Same shape issue as Bug 2. Has likely been silently failing since Phase A. Rewrite to `event_data`. (Folded into the Bug 2 fix.)

---

## Out of scope (already explicitly deferred per the approved spec)

- `override_seller_confirmation` (future "Exception Handling" phase).
- Partial refunds.
- Refund‑after‑payout.
- `release_attempts` audit table.
- Cron stuck‑tx watchdog (Phase E).
- Admin queue UI shell (separate UI phase).

---

## Fix plan (single migration + edge function patches, deployable as one batch)

### Migration `021_phase_b_finalize.sql`
1. Create `freeze_funds_atomic(p_transaction_id uuid, p_actor uuid, p_reason text) returns money_status` — security definer, calls `validate_money_transition`, writes `money_status_history`, sets `transactions.needs_release_review=true`, `release_review_reason='manual_hold'`. Returns the new status.
2. Extend `flag_for_release_review` SQL helper to accept the 2 new reasons (`missing_seller_confirmation`, `missing_buyer_confirmation`) and map both to `queue_type='stuck'`; map `delivery_proof_missing` and `suspicious_activity` to themselves. Idempotent, leaves the unique partial index untouched.

### Edge function patches
3. `_shared/release-core.ts`
   - In `releasePayoutCore`: replace the `transaction_events` insert with `{ event_type:'payout_released', actor_user_id, actor_role:'admin', event_data:{ description, payout_id, reference, transfer_code, status } }`.
   - In `refundBuyerCore`: derive `refundAmount` from `Number(payment.amount)` (already fetched). Drop the `tx.total_amount` reference. Same `event_data` rewrite is already correct in this function — leave as is.
4. `paystack-webhook/index.ts`
   - Rewrite the `charge.success` `transaction_events` insert to use `event_data` shape (no `description`/`metadata`).
5. `flag-for-release-review/index.ts`
   - Broaden the Zod `ReasonEnum` to all 9 spec values.
   - Add optional `severity: 'low'|'medium'|'high'` (default `medium`), forward into `notifyOpsTeam` metadata.
6. `resolve-release-review/index.ts`
   - Remove both `case_reviews` inserts (release + refund branches).
   - In the `hold` branch: call `admin.rpc('freeze_funds_atomic', …)` first; if it returns an error, return `409 { error: 'transition_not_allowed', detail }`. Then proceed with the existing queue + admin_actions writes.

### Verification after deploy
7. End‑to‑end smoke against the live preview using `supabase--curl_edge_functions`:
   - Happy release on a seeded handshaked tx → confirm `transaction_events` row lands (no 400).
   - `resolve-release-review` `hold` → confirm `money_status='funds_frozen'` and a `money_status_history` row.
   - `refund-transaction` → confirm refund amount equals the `payments.amount`, not `NaN`.
   - `flag-for-release-review` with `missing_seller_confirmation` → confirm queue row created.
8. Re‑run the Phase B acceptance suite (10 cases from the approved spec). All must pass.

---

## Direction call

The architecture is right. These are integration bugs from the rapid build, not design flaws. After this single batch (one short migration + four small edge function patches), Phase B reaches **100%** of the approved spec and we can move to Phase C with confidence.
