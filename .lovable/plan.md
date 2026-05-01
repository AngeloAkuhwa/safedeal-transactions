
# Phase A Audit Report & Gap-Fix Plan

## Verdict: 95% complete. The architecture is correct. Four small but important gaps remain.

## What was audited (and is verified correct)

**Database (migration 018) — fully applied:**
- Enums present: `money_status.funds_pending_release`, `payout_status.awaiting_release`, `payout_status.blocked`, `escrow_ledger_entry_type.payout_awaiting_release`.
- `validate_money_transition` rewritten — the dangerous `funds_held_in_escrow → funds_releasing` shortcut is removed. Funds can only flow `held_in_escrow → pending_release → releasing → released`.
- `transactions` has `buyer_confirmed_at`, `seller_confirmed_at`, `release_approved_at`, `release_approved_by`, `needs_release_review`, `release_review_reason`.
- `payouts` has `release_approved_by_user_id`, `released_at`, `payout_blocked_reason`, `release_blocked`, `failed_attempt_count`, `notes`.
- `transaction_completion_confirmations` table exists with `UNIQUE(transaction_id, confirmed_by_role)` idempotency, RLS, and `prevent_delete` trigger.
- `release_review_queue` exists with the 8 expected `queue_type` values, partial unique index preventing duplicate open queue rows per type/transaction, RLS for admins only.

**Edge functions — wired correctly:**
- `transaction-verify` (buyer confirm receipt): status flips to `completed` and writes `buyer_confirmed_at`. Money status is explicitly held at `funds_held_in_escrow`. No payout created. No escrow released. Audit row + seller notification fire.
- `seller-confirm-completion` (new): seller-role-gated, validates buyer has confirmed, validates dispute_status = none, validates money_status = funds_held_in_escrow, atomically flips money_status to `funds_pending_release` with optimistic lock on `(money_status, seller_confirmed_at IS NULL)`, writes confirmation audit, money_status_history, transaction_event, and then handles three branches: pricing_missing → blocks + queues; payout_account_missing → creates `blocked` payout + queues; happy path → creates `awaiting_release` payout + ledger entry + `ready_for_release` queue row + notifications to both parties.

**UI — wired correctly:**
- `SellerConfirmCompletionCard` shows on `SellerTransactionDetail` only when `status=completed && buyer_confirmed_at && !seller_confirmed_at && dispute_status=none`. Calls the new edge function via `sellerConfirmCompletion()` service.
- `TransactionConfirmationProgress` renders the composite handshake state.
- `MoneyStatusBadge` includes the `funds_pending_release → "Awaiting Release"` label.
- `ConfirmReceiptDialog` copy reflects "awaiting seller confirmation + SafeDeal review".
- `seller-transaction-detail` edge function returns `buyer_confirmed_at` and `seller_confirmed_at` so the card can gate properly.

## Gaps to fix (Phase A polish)

### Gap 1 — Seller dashboard metric `funds_pending_release_amount` is wrong
File: `supabase/functions/seller-dashboard/index.ts` (lines 138–165, 218–229).
The bucketing loop only checks `funds_held_in_escrow` and `funds_releasing`. Transactions with the new `funds_pending_release` status fall through both buckets, so the `funds_pending_release_amount` metric is mislabeled (it's currently summing `funds_releasing` only, which under the new model is the rare in-flight transfer state).

**Fix:**
- Add a new bucket array `fundsPendingReleaseTxIds`.
- Push tx to it when `tx.money_status === 'funds_pending_release'`.
- Sum its `seller_net_amount` into `fundsPendingReleaseAmount`.
- Rename the existing `fundsReleasingTxIds` accumulator to a separate `fundsReleasingAmount` and surface either a new metric `funds_releasing_amount` or fold both into the same KPI label intentionally.
- Update the "Payout releasing soon" alert wording to "Awaiting release review" when the amount comes from `funds_pending_release`.

### Gap 2 — Seller payouts page does not surface `funds_pending_release`
File: `supabase/functions/seller-payouts/index.ts` (lines 117–134, 80–109).
- The `for (const tx of allTx)` loop only buckets `funds_held_in_escrow`. Transactions in `funds_pending_release` are invisible in the payouts view.
- The payout summary loop only counts `pending` / `processing` / `failed` payout statuses. New `awaiting_release` and `blocked` payouts are silently ignored — they should drive a "Pending release review" KPI and a "Blocked" KPI respectively.

**Fix:**
- Add an `awaitingReleaseAmount` accumulator: sum payouts where status = `awaiting_release`.
- Add a `blockedAmount` accumulator: sum payouts where status = `blocked`, and include `payout_blocked_reason` in the row payload.
- Bucket `funds_pending_release` transactions into the existing held / pending KPI as appropriate (these are not in escrow anymore but are not yet released — they belong in a "Pending release" tile).
- Select `status, payout_blocked_reason, release_blocked` in the payouts query so the UI can render badges.

### Gap 3 — Idempotency edge case in `seller-confirm-completion`
File: `supabase/functions/seller-confirm-completion/index.ts` (lines 84–86, 126–129).
If the seller clicks twice quickly, the second call hits the early `if (tx.seller_confirmed_at)` branch and returns `already_confirmed: true`. Good. But if the first call is still mid-flight when the second arrives, both can pass the early guard, and only the optimistic-locked UPDATE protects us. The losing call then returns `already_confirmed: true` without verifying that the *first* call actually succeeded in queuing the payout — meaning the user gets a success toast even if the payout/queue insert failed mid-flight.

**Fix:**
- After the "losing race" branch (`if (!updated)`), re-read the transaction and verify `release_review_queue` has a row for this transaction (or `transactions.needs_release_review = true`). If none exists, retry the side-effect block. This is cheap insurance and matches the agreed "every confirmation attempt provably leaves a queue/payout/audit record" rule.
- Wrap the payout / queue / ledger / notification block in a small helper that is safe to re-run (it already uses `upsert` with `ignoreDuplicates` for the confirmation row; need the same protection for `release_review_queue` — which is already protected by the partial unique index `rrq_unique_open_per_type`). Add `.onConflict('transaction_id, queue_type')` semantics by switching the `INSERT` to `UPSERT` ignoring conflicts.

### Gap 4 — `seller-transaction-detail` does not expose new release fields
File: `supabase/functions/seller-transaction-detail/index.ts` (line 56, line 331-332).
The query selects `buyer_confirmed_at, seller_confirmed_at, needs_release_review, release_review_reason` (good), but the response payload only forwards the two confirmed_at fields. The seller has no UI signal that their transaction is in the `needs_release_review` state (e.g. payout account missing), so they keep wondering why funds are stuck.

**Fix:**
- Forward `needs_release_review` and `release_review_reason` in the response payload.
- Update the type in `src/services/seller-transaction-detail.service.ts` to include these fields.
- In `SellerTransactionDetail.tsx`, when `needs_release_review === true`, render a small inline banner under `TransactionConfirmationProgress`:
  - `release_review_reason === 'payout_account_missing'` → "Add a payout account to receive your funds" with deep-link to `/seller/profile`.
  - `release_review_reason === 'pricing_missing'` → "SafeDeal is reviewing this transaction" (no action needed).
  - other → generic "SafeDeal is reviewing this transaction".

## Out of scope for this fix-up (correctly deferred to Phase B)

- Admin UI for `release_review_queue` — intentionally not built; the queue is populated and ready for the future admin dashboard.
- Actual Paystack transfer (`funds_pending_release → funds_releasing → funds_released`) — Phase B.
- `stuck_confirmation` cron job that flips long-pending one-sided confirmations into the `stuck_confirmation` queue — Phase B.

## Test plan after fixes land

End-to-end smoke (manual + curl on edge functions):

1. **Buyer confirms only** → tx becomes `completed`, `buyer_confirmed_at` set, `money_status` still `funds_held_in_escrow`, no payout row, no queue row, `transaction_completion_confirmations` has one buyer row, seller gets notification.
2. **Seller then confirms (happy path)** → `money_status = funds_pending_release`, payout row inserted as `awaiting_release`, ledger entry `payout_awaiting_release`, `release_review_queue` has one `ready_for_release` row, both parties get notified, seller dashboard "Funds pending release" KPI now reflects the amount.
3. **Seller confirms with no verified payout account** → payout inserted as `blocked` with `payout_blocked_reason='payout_account_missing'`, `transactions.needs_release_review = true`, `release_review_queue` has `payout_account_missing` row, seller transaction detail shows the "Add payout account" banner.
4. **Seller confirms with missing pricing** → no payout, `release_review_queue` has `pricing_missing` row, seller sees "SafeDeal reviewing" banner.
5. **Double-click confirm** → second call returns `already_confirmed: true`, no duplicate payout, no duplicate queue row (partial unique index enforces).
6. **DB-level guard** → manually attempt `UPDATE transactions SET money_status='funds_releasing' WHERE money_status='funds_held_in_escrow'` via SQL → must fail with "Invalid money status transition".
7. **Buyer confirm during dispute** → returns 409, no state change.
8. **Seller confirm before buyer** → returns 409 `buyer_not_confirmed`.

## Files to change (estimate)

- `supabase/functions/seller-dashboard/index.ts` — bucket new state, surface metric.
- `supabase/functions/seller-payouts/index.ts` — surface `awaiting_release` + `blocked` payouts and `funds_pending_release` transactions.
- `supabase/functions/seller-confirm-completion/index.ts` — harden idempotency on the side-effect block; switch queue insert to upsert.
- `supabase/functions/seller-transaction-detail/index.ts` — forward `needs_release_review` + `release_review_reason`.
- `src/services/seller-transaction-detail.service.ts` — extend response type.
- `src/pages/SellerTransactionDetail.tsx` — render the review-reason banner.
- `src/components/seller/dashboard/*` (whichever component renders the metric tiles) — adjust label / add tile if needed.
- `src/pages/SellerPayouts.tsx` (or service) — render the new KPIs.

No new tables, no new enums, no new edge functions. Strictly closing gaps in Phase A.

After approval I'll switch to build mode and implement these four fixes in one pass, then deploy and run the smoke tests.
