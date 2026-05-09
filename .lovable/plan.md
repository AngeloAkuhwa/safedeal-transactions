## Fix: Freeze Funds doesn't update escrow_states

**Problem:** `freeze_funds_atomic` only flips `transactions.money_status` to `funds_frozen`. It never touches `escrow_states`, so the UI keeps showing `state=held`, `held_amount` unchanged, `frozen_amount=0`, and no ledger row is written. This is asymmetric with the new `unfreeze_funds_atomic`.

**Fix:** Make freeze the mirror of unfreeze. Single DB migration, no edge function or UI changes.

### Migration: replace `public.freeze_funds_atomic`

1. Lock `transactions` row. Validate current `money_status ∈ {funds_held_in_escrow, funds_pending_release}`. Call `validate_money_transition(old, 'funds_frozen')`.
2. Lock `escrow_states` row. Read `v_held := held_amount`, `v_currency := currency_code`.
3. Move buckets atomically:
   - `frozen_amount := frozen_amount + v_held`
   - `held_amount := 0`
   - `state := 'frozen'`
   - `last_changed_at := now()`
4. Update `transactions`:
   - `money_status := 'funds_frozen'`
   - `needs_release_review := true`
   - `release_review_reason := COALESCE(p_reason, 'manual_hold')`
5. Insert `money_status_history` row (preserve current behavior).
6. Insert `escrow_ledger_entries` row:
   - `entry_type = 'freeze_hold'`
   - `amount = v_held` (actual moved amount, not zero)
   - `currency_code = v_currency`
   - `reference_type = 'admin_freeze'`
   - `reference_id = p_admin_user_id`
   - `metadata = { from_bucket: 'held', to_bucket: 'frozen', moved_amount, balance_after_held: 0, balance_after_frozen, target_money_status: 'funds_frozen', reason }`
7. Return `'funds_frozen'`.

No changes to `admin-transaction-actions` edge function (already calls this RPC) or `AdminTransactionDetail.tsx` (already re-fetches after success).

### Acceptance

Given tx with `money_status=funds_held_in_escrow`, `held_amount=5000`, `frozen_amount=0`:
- After freeze: `escrow_states.state='frozen'`, `held_amount=0`, `frozen_amount=5000`, ledger row with `amount=5000`.
- Roundtrip unfreeze → `state='held'`, `held_amount=5000`, `frozen_amount=0`, second ledger row with `amount=5000`.
- No Paystack/payout/refund calls.
