## Goal

Refine the Admin Unfreeze Funds workflow so that selecting target = `funds_held_in_escrow` is production-safe: the ledger reflects the actual amount moved, release-review is cleared but other admin attention (dispute / investigation / risk) is preserved, the dialog warns about open disputes without blocking, optional neutral notifications are supported, the freeze ↔ unfreeze transition matrix is finalized, and the UI refreshes immediately.

The existing happy path for `funds_pending_release` is left intact.

## Schema changes (one migration)

`escrow_ledger_entries`
- Add `metadata jsonb NULL` (used for `from_bucket`, `to_bucket`, `balance_after_held`, `balance_after_frozen`, `reason`).

`transactions`
- Add `needs_admin_review boolean NOT NULL DEFAULT false`.
- Add `admin_review_reason text NULL` (free-form key like `dispute_open`, `investigation_open`, `risk_flag_active`, `dispute_response_overdue`).

(These are additive, nullable / defaulted, and don't break any existing reads.)

## DB function changes

Replace `public.unfreeze_funds_atomic(p_transaction_id, p_actor, p_target, p_reason)`:

1. Lock `transactions` row, ensure `money_status = 'funds_frozen'`.
2. Lock `escrow_states`, read `frozen_amount` (call it `v_frozen`) and current `held_amount`.
3. Move escrow buckets:
   - `held_amount = held_amount + v_frozen`
   - `frozen_amount = 0`
   - `state = 'held'`
4. Update `transactions`:
   - `money_status = p_target`
   - `needs_release_review = false`, `release_review_reason = NULL`
   - Recompute `needs_admin_review` / `admin_review_reason`:
     - `dispute_open` if any dispute in `('open','seller_response_pending','under_review')`
     - else `investigation_open` if any `admin_investigations` row with status in `('open','under_review','escalated')`
     - else `risk_flag_active` if `transaction_risk_flags` has an unresolved row (best-effort; skip clause if table absent)
     - else `dispute_response_overdue` if a dispute has `seller_response_deadline < now()` and no response
     - else clear (`false` / `NULL`)
5. Insert into `money_status_history` (old → target, reason).
6. Insert into `escrow_ledger_entries` with the **actual moved amount**, not zero:
   - `entry_type = 'adjustment'`
   - `amount = v_frozen`
   - `currency_code = COALESCE(transaction_pricing.currency_code, 'NGN')`
   - `reference_type = 'admin_unfreeze'`, `reference_id = p_transaction_id`
   - `notes = 'Funds unfrozen by admin to '||p_target||' escrow. Reason: '||p_reason`
   - `metadata = { admin_unfreeze: true, from_bucket: 'frozen', to_bucket: 'held', moved_amount: v_frozen, balance_after_held, balance_after_frozen: 0, reason: p_reason }`
7. Return `p_target`.

Update `public.validate_money_transition` so the freeze matrix is exactly:
- allow `funds_held_in_escrow → funds_frozen`
- allow `funds_pending_release → funds_frozen`
- disallow `funds_released → funds_frozen` and `refund_issued → funds_frozen`

(The current matrix already matches these rules; the migration re-asserts it for clarity and adds a comment.)

## Edge function changes — `supabase/functions/admin-transaction-actions/index.ts`

In the `unfreeze` case:

1. Validate body (`reason ≥ 8`, `target_money_status ∈ {funds_held_in_escrow, funds_pending_release}`, `tx.money_status === 'funds_frozen'`). No new acknowledgement is required for `funds_held_in_escrow`; the dialog handles user warning.
2. Pre-read pre-state: `escrow_states.frozen_amount`, `held_amount`, plus `transaction_pricing.currency_code` (for response).
3. Look up active dispute (`open|seller_response_pending|under_review`) — used in the response payload (`active_dispute: boolean`) so the UI can render the post-action banner. Keep the existing acknowledgement requirement only for `funds_pending_release`.
4. Call the updated `unfreeze_funds_atomic` RPC.
5. Insert into `admin_actions`, `audit_logs`, `transaction_events` (existing).
6. **Optional notifications**: if `payload.notify_parties === true`, send a single in-app notification to buyer and to seller via `notifyUser` (`supabase/functions/_shared/notify.ts`):
   - `type: 'transaction_update'`
   - `title: 'Transaction status updated'`
   - `message: 'The transaction review status has been updated. Funds remain protected while the transaction continues.'`
   - `metadata: { transaction_code, neutral: true }`
   - Best-effort; never throw.
7. Return `{ ok: true, target, moved_amount: v_frozen, active_dispute }` so the UI can show the right toast / banner.

The `freeze` case keeps its existing pre-checks; ensure the human-readable message for the disallowed transitions reads "Funds already released; cannot be frozen" / "Refunded; cannot be frozen".

## Service layer

`src/services/admin-transaction-actions.service.ts`
- Extend `unfreezeTransactionDetailed` payload type with `notify_parties?: boolean` and pass through.

## UI changes

`src/components/admin/transactions/UnfreezeFundsDialog.tsx`
- When `target === 'funds_held_in_escrow'` AND `hasActiveDispute`, show an inline (non-blocking) info card:
  > "This dispute is still open. Unfreezing to held escrow removes the manual freeze but keeps funds protected. The dispute remains open and must still be resolved separately."
- Add an unchecked "Notify buyer and seller with a neutral status update" checkbox; pass `notify_parties` to `onConfirm`.
- Keep the existing acknowledgement block for `funds_pending_release` + active dispute.
- Disable submit only on the existing rules (reason ≥ 8, confirmation, ack when needed).

`src/pages/AdminTransactionDetail.tsx`
- After `unfreezeTransactionDetailed` resolves, immediately re-fetch the detail (existing `loadDetail()` flow) so the page shows:
  - Money Status pill = "Held in Escrow"
  - Escrow tile values: held = previous frozen, frozen = ₦0.00, released / refunded unchanged
  - Risk / Investigation / Dispute sections unchanged if those entities are still active
  - Timeline gains the existing `admin_funds_unfrozen` event (label updated to read "Funds unfrozen to held escrow" / "Funds unfrozen to pending release" based on `event_data.target_money_status`)
- Toast text varies by target: held → "Funds returned to held escrow"; pending release → existing copy.

## Acceptance verification

1. Seed/fixture transaction with `money_status = funds_frozen`, `escrow_states.frozen_amount = 5000`, `held_amount = 0`, plus an open dispute. Call edge function with `target_money_status = funds_held_in_escrow`.
   - DB: `transactions.money_status = funds_held_in_escrow`, `needs_release_review = false`, `release_review_reason = NULL`, `needs_admin_review = true`, `admin_review_reason = 'dispute_open'`.
   - `escrow_states`: `held_amount = 5000`, `frozen_amount = 0`, `state = 'held'`.
   - `escrow_ledger_entries`: row with `amount = 5000`, `metadata.from_bucket = 'frozen'`, `metadata.to_bucket = 'held'`.
   - Dispute row untouched; investigation row untouched; no Paystack call; no payout/refund row.
2. Repeat without an open dispute → `needs_admin_review = false`, `admin_review_reason = NULL`.
3. Toggle `notify_parties = true` → exactly two `notifications` rows inserted, neutral copy, none mentioning unfreeze/release.
4. UI: detail page reloads showing held = ₦5,000.00, frozen = ₦0.00, no stale "Funds Frozen" badge.
5. Re-freeze attempt from `funds_held_in_escrow` succeeds; from `funds_released` returns "Funds already released; cannot be frozen".
