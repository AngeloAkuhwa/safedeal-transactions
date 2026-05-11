
## Resolve Dispute — Corrected Plan

Aligns with SafeDeal's rule: **resolving a dispute never moves money into `funds_releasing`**. Seller-favor outcomes only make funds **eligible for release review**; the central admin release workflow performs the actual payout.

---

### 1. Schema migration

**Extend `public.dispute_outcome_type` enum** (add values, keep existing):
- `partial_refund_release`
- `dismissed_seller_favor`
- `dismissed_buyer_favor`

`refund_buyer`, `release_funds_to_seller`, `close_case_without_resolution` already exist.

**Extend `public.escrow_ledger_entry_type` enum**:
- `dispute_refund_reserved`
- `dispute_release_approved_pending_admin_release`
- `dispute_no_action` (audit-only, amount 0)

**Extend `public.validate_money_transition`** to permit:
- `funds_frozen → funds_pending_release` (already allowed — keep)
- `funds_frozen → refund_pending` (already allowed — keep)
- `funds_held_in_escrow → refund_pending` (new — required for buyer-favor without bridging)

`release_review_queue.queue_type` accepts free-text reasons today, so `dispute_resolved_seller_favor` and `dispute_resolved_dismissed_seller_favor` need no enum change.

---

### 2. Atomic RPC: `public.resolve_dispute_atomic(p_dispute_id, p_actor, p_outcome, p_refund_amount, p_release_amount, p_decision_summary, p_also_close_investigation)`

`SECURITY DEFINER`. Single transaction, all-or-nothing.

**Pre-checks**
1. Lock `disputes` row. If `status = 'resolved'` → return `{ ok:false, code:'already_resolved' }` (caller maps to HTTP 409).
2. Validate `outcome ∈ {refund_buyer, release_funds_to_seller, partial_refund_release, dismissed_seller_favor, dismissed_buyer_favor, close_case_without_resolution}`. (`request_more_information` is handled by a separate non-resolving path — see §6.)
3. Load `transactions` + `escrow_states` rows `FOR UPDATE`.
4. Compute `escrow_available = held_amount + frozen_amount`. For split outcomes require `refund_amount + release_amount ≤ escrow_available` and both `> 0`. For single-bucket outcomes require the relevant amount equals `escrow_available` (no leftover).
5. `money_status` must be in `{funds_held_in_escrow, funds_pending_release, funds_frozen}`. Reject otherwise.

**Outcome branches** (see table below). For every branch:
- Insert `dispute_status_history (old, 'resolved', actor, "Outcome: {outcome}")`.
- Update `disputes`: `status='resolved'`, `resolved_at=now()`, `updated_at=now()`.
- Insert immutable `dispute_outcomes` row (UNIQUE on `dispute_id` enforces idempotency at DB level too).
- Update `transactions.status` `disputed → resolved`, set `dispute_status='resolved'`, recompute `needs_admin_review` (true only if investigation remains open and not co-closed).
- Insert `transaction_events`, `admin_actions`, `audit_logs`.
- If `p_also_close_investigation`: update open `admin_investigations` rows to `status='resolved', resolved_at=now()` and append `admin_action`.

**Money/escrow/ledger/queue per outcome**

```text
outcome                      money_status target          escrow_states delta                         ledger entry                                    release_review_queue
---------------------------- ------------------------------ -------------------------------------------- ------------------------------------------------- ---------------------------------
refund_buyer                 refund_pending                 held -= refund; frozen -= remaining_frozen   dispute_refund_reserved   amount = -refund     n/a (refund worker path)
                                                              (whichever bucket held the money)
release_funds_to_seller      funds_pending_release          frozen -> held (if frozen);                  dispute_release_approved_pending_admin_release  INSERT pending,
                                                              state='held'                                amount = +release                              queue_type='dispute_resolved_seller_favor'
partial_refund_release       refund_pending (primary)       held -= refund; remaining stays held;        TWO entries:                                    INSERT pending for release portion,
                             (release portion waits for     state='held' with remaining = release_amt    dispute_refund_reserved   amount = -refund     queue_type='dispute_resolved_partial'
                             refund completion, then         (frozen unwound first if any)               dispute_release_approved_pending_admin_release  notes include both amounts
                             refund worker / cron rolls                                                   amount = +release
                             money_status to
                             funds_pending_release)
dismissed_seller_favor       funds_pending_release          same as release_funds_to_seller              dispute_release_approved_pending_admin_release  INSERT pending,
                                                                                                          amount = +escrow_available                    queue_type='dispute_resolved_dismissed_seller'
dismissed_buyer_favor        refund_pending                 same as refund_buyer (full amount)           dispute_refund_reserved   amount = -available  n/a
close_case_without_resolution UNCHANGED                     UNCHANGED                                    dispute_no_action          amount = 0          n/a
```

Notes:
- For any outcome that needs to act on frozen funds, the RPC unwinds `frozen_amount → held_amount` in the **same transaction** before performing the bucket math, and writes a synthetic `adjustment` ledger row with `reference_type='dispute_unfreeze'` so the audit trail is explicit. No separate unfreeze is required.
- `money_status_history` is written for every status change (including the implicit frozen→held bridge when applicable, using reason `dispute_resolve_unfreeze_bridge`).
- `partial_refund_release` keeps `money_status='refund_pending'` so the refund worker runs first; when `complete_refund_atomic` flips to `refund_issued`, a small follow-up step (extend `complete_refund_atomic` to read `dispute_outcomes.release_amount > 0`) transitions to `funds_pending_release` and leaves the existing release queue row in place. This keeps the central release workflow as the sole payout authority.
- All amounts `NUMERIC(18,2)`, currency forced to NGN.

**Return**: `jsonb { ok:true, outcome, money_status, refund_id?, release_queue_id? }`.

---

### 3. Edge function: `supabase/functions/admin-transaction-actions/index.ts`

Add `case "resolve_dispute"`:
- Zod validate payload: `outcome_type`, `decision_summary` (min 10 chars), `refund_amount` (≥0), `release_amount` (≥0), `internal_note?`, `notify_parties?`, `also_close_investigation?`.
- Call `resolve_dispute_atomic`. Map `already_resolved` → 409; validation errors → 400.
- Post-RPC (best-effort, non-fatal):
  - If `notify_parties`: insert two `notifications` rows with outcome-specific neutral copy (see §9 of spec — never "Admin released funds").
  - If `internal_note`: insert `admin_transaction_notes` with category `dispute`.
- Audit row already written inside RPC; edge fn returns `{ ok, outcome, money_status }`.

Add separate `case "dispute_request_more_info"` (for outcome `request_more_information`):
- Does **not** call resolve RPC.
- Updates `disputes.status='seller_response_pending'`, sets new `seller_response_due_at = now() + interval`, inserts `dispute_status_history`, `admin_actions`, optional notification to seller.

CORS already permits POST + OPTIONS; no change.

---

### 4. Service layer

`src/services/admin-transaction-actions.service.ts`:
```ts
export type DisputeOutcome =
  | "refund_buyer" | "release_funds_to_seller" | "partial_refund_release"
  | "dismissed_seller_favor" | "dismissed_buyer_favor"
  | "close_case_without_resolution";

export const resolveDispute = (transactionId, payload: {
  outcome_type: DisputeOutcome;
  decision_summary: string;
  refund_amount: number;
  release_amount: number;
  internal_note?: string;
  notify_parties?: boolean;
  also_close_investigation?: boolean;
}) => invokeAction("resolve_dispute", transactionId, payload);

export const disputeRequestMoreInfo = (transactionId, payload: {
  message: string; new_due_at: string; notify_seller?: boolean;
}) => invokeAction("dispute_request_more_info", transactionId, payload);
```

---

### 5. UI: `ResolveDisputeDialog`

New `src/components/admin/transactions/ResolveDisputeDialog.tsx` opened from the dispute card in `/admin/transactions/:id`. Visible when `dispute.status ∈ {open, seller_response_pending, under_review}` and `money_status ∈ {funds_held_in_escrow, funds_pending_release, funds_frozen}`.

Fields:
- **Outcome** (radio): the 6 final outcomes + `request_more_information`.
- **Decision summary** (textarea, required ≥10 chars, hidden for `request_more_information`).
- **Refund amount** / **Release amount** numeric inputs (NGN, 2dp): visible per outcome. Auto-fill `escrow_available` for single-bucket outcomes; both editable for `partial_refund_release` with live validation `refund + release ≤ available`.
- **Internal note** (optional).
- **Notify parties** checkbox (default on).
- **Investigation co-close** checkbox — shown only when an open investigation exists, with the spec warning text.
- **Frozen-funds banner** when `money_status='funds_frozen'`: "Frozen funds will be routed into the selected outcome bucket. No separate unfreeze needed."
- For `request_more_information`: shows message + new due-date pickers instead, calls `disputeRequestMoreInfo`.

Submit → service call → toast → `setReloadKey` refetch.

---

### 6. Display logic after resolution

`AdminTransactionDetail.tsx`: stop showing "In Dispute" once `disputes.status='resolved'`. Drive display from `(transaction.status, money_status, dispute_outcomes)`:

```text
dispute_outcomes.outcome_type             primary banner
-----------------------------------------  ------------------------------------------------------
release_funds_to_seller / dismissed_seller Dispute resolved. Funds are awaiting SafeDeal release review.
refund_buyer / dismissed_buyer            Dispute resolved. Refund is pending processing.
partial_refund_release                    Dispute resolved. Refund and release actions are pending processing.
close_case_without_resolution             Dispute closed. Funds remain {held|frozen} — manual action may be required.
```

Update `DisputeResolutionSection`, money status badge, release-readiness panel, escrow card, timeline (new event types `dispute_resolved`, `dispute_more_info_requested`), linked records, action buttons, risk flags, investigation badge.

---

### 7. Notifications (neutral copy per outcome)

Insert into `notifications` with `type='dispute_update'`, in-app channel, for both buyer and seller:
- Seller-favor / dismissed_seller_favor: "The dispute has been resolved. The transaction is now awaiting release review."
- Buyer-favor / dismissed_buyer_favor: "The dispute has been resolved. A refund process has been started."
- Partial: "The dispute has been resolved with a partial refund/release decision."
- Close-no-action: "The dispute case has been closed. The transaction will continue based on its current state."

Never "Admin released funds".

---

### 8. Tests / acceptance

Deno tests for the edge function cover:
- Idempotency: second `resolve_dispute` → 409.
- Seller-favor sets `money_status='funds_pending_release'` (never `funds_releasing`) and inserts release-queue row.
- Buyer-favor sets `money_status='refund_pending'`.
- Partial: split sums validated; two ledger rows; queue row present; money stays `refund_pending` until refund completes.
- Frozen funds routed correctly without manual unfreeze.
- Close-no-action: no money_status change, ledger row with amount 0.
- Investigation co-close updates `admin_investigations` only when checked.
- All amounts NGN with 2dp; `transactions.status='resolved'`, UI stops showing In Dispute.

---

### Files to add / change

- `supabase/migrations/<ts>_resolve_dispute.sql` — enum extensions + `resolve_dispute_atomic` + `validate_money_transition` patch + (small) `complete_refund_atomic` follow-up for partial outcome.
- `supabase/functions/admin-transaction-actions/index.ts` — `resolve_dispute`, `dispute_request_more_info` cases.
- `src/services/admin-transaction-actions.service.ts` — new exports.
- `src/components/admin/transactions/ResolveDisputeDialog.tsx` (new).
- `src/pages/AdminTransactionDetail.tsx` — wire dialog + post-resolution display logic.
- `src/components/disputes/DisputeResolutionSection.tsx` — render new outcome types.
- Edge-function tests.

No Paystack call is made in this flow. The central admin release workflow remains the only payout authority.
