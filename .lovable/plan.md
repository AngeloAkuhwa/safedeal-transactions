
# Corrective Plan — Current vs Historical State + Unified Timeline

## Goal

1. Every "current state" surface (badges, flags, banners, sidebar, SLA pill, queue counts) reads from **live derived state** only.
2. The **Case Timeline** on the Transaction Detail page renders the **same dispute-aware event stream** as the Dispute Detail timeline — so freeze/unfreeze, dispute opened/escalated/resolved, investigation opened/resolved, and outcome events appear in the transaction timeline too.
3. No payout screen, no Paystack work in this pass.

---

## 1. Single source of truth: `deriveActiveState` helper

**File:** `src/lib/admin-active-state.ts` (new)

```ts
deriveActiveState({ dispute, investigations, moneyStatus, escrow, risk, payout }) => {
  isDisputeActive,      // status in (open, seller_response_pending, under_review, escalated)
  isDisputeResolved,    // status === 'resolved' || resolved_at != null
  isFrozen,             // moneyStatus === 'funds_frozen' || escrow.frozenAmount > 0
  isInvestigationActive,
  isEscalated,          // current state only — never derived from history
  isOverdue,            // isDisputeActive && seller_response_due_at < now
  needsReleaseReview,
  activeBlockers,
  needsAdminReview,
}
```

All flags below derive from this. Components stop reading `transactions.needs_admin_review` directly.

---

## 2. AdminDisputeDetail.tsx

- Replace local `overdue` with `active.isOverdue`. SLA pill renders only when `active.isDisputeActive`; on resolved cases switches to neutral "Resolved · <date>".
- Frozen banner gated on `active.isFrozen`.
- When `active.isDisputeResolved`, sidebar swaps to a **Resolution Summary panel**:
  - Status: Resolved · Outcome · Decision summary · Resolved by · Resolved at
  - Next action: "Pending release review" / "Pending refund processing" / "Pending split settlement" / "No money movement required"
- Disable: Refund Buyer, Release Funds, Partial Refund, Partial Release, Close Without Resolution, Move to Under Review, Request More Evidence, Escalate, Mark High Risk, Mark Fraud Watch.
- Keep enabled: Add Internal Note, View Linked Transaction, Print.
- Header status pill never shows "Awaiting Seller / Overdue" when resolved.

## 3. AdminTransactionDetail.tsx

- All risk/flag computation routes through `deriveActiveState`:
  - "Dispute response overdue" only when `active.isOverdue`.
  - "Funds frozen" flag only when `active.isFrozen`.
  - "Escalated" pill only when `active.isEscalated`.
  - "High Risk — Escalated" copy gated on current risk level, not history.
- Red frozen banner: renders only if `active.isFrozen`. Vanishes after unfreeze.
- Freeze/Unfreeze visibility:
  - Show **Freeze** when `!active.isFrozen` and money in `funds_held_in_escrow | funds_pending_release`.
  - Show **Unfreeze** only when `active.isFrozen`.
- Escrow card cyan "frozen" theme branch gated on `active.isFrozen`.
- "Admin review in progress" banner hides when `active.isDisputeResolved && !active.isInvestigationActive`.
- Header status: "In Dispute" only when `active.isDisputeActive`; once resolved, fall back to the underlying transaction state (Completed / Delivered / Pending Release / Resolved).

## 4. **Unified Case Timeline (new)**

Today the Transaction Detail timeline only renders `status_history` + `money_history`. It misses the dispute and investigation lifecycle that the Dispute Detail timeline shows.

**Build a single timeline composer used by both pages:**

**File:** `src/lib/admin-timeline.ts` (new)

```ts
buildAdminTimeline({
  statusHistory,         // transaction_status_history
  moneyHistory,          // money_status_history (includes freeze/unfreeze)
  disputeStatusHistory,  // dispute_status_history
  disputeOutcomes,       // dispute_outcomes (resolution event)
  investigationEvents,   // open / resolved / dismissed
  adminActions,          // freeze, unfreeze, escalate, flag, note (admin_actions table)
}) => TimelineEntry[]
```

Each `TimelineEntry`:
```
{ id, occurredAt, source: 'transaction'|'money'|'dispute'|'investigation'|'admin_action',
  kind: 'dispute_opened'|'dispute_escalated'|'dispute_resolved'|
        'funds_frozen'|'funds_unfrozen'|'escrow_adjustment'|
        'investigation_opened'|'investigation_resolved'|'investigation_dismissed'|
        'status_change'|'admin_note'|'high_risk_flag'|...,
  label, description, actorName?, badgeTone, relatedId? }
```

Composer rules:
- Merge all sources, sort by `occurredAt` descending (Dispute Detail's current order).
- Collapse near-duplicate rows (e.g. `status_history → disputed` paired with `dispute_status_history → open` within 2s collapse into one "Dispute opened" entry, mirroring `DisputeTimeline.tsx` enrichment).
- Group repeated admin notes the same way the Dispute Timeline already does.
- **History only** — never feeds active flags.

**Wire-up:**
- `src/components/admin/transactions/AdminTransactionTimeline.tsx` (or wherever the Transaction Detail "Case Timeline" card lives) consumes `buildAdminTimeline` output and reuses the same visual row component as `src/components/disputes/DisputeTimeline.tsx` (lift its row markup into `src/components/admin/timeline/TimelineRow.tsx` to keep parity).
- `AdminDisputeDetail.tsx`'s timeline also switches to the shared `TimelineRow` so both pages render identically.

**Backend surface:**
- Extend `getAdminTransactionDetailFull` (`services/admin-transaction-detail.service.ts`) to return `disputeStatusHistory`, `disputeOutcomes`, `investigationEvents`, and `adminActions` for the transaction. The edge function `admin-transaction-detail` already has admin RLS — just add the joins.
- Dispute Detail already loads the bundle; reuse the same fields.

## 5. AdminTransactions.tsx (list)

- `buildFlags` per row uses `deriveActiveState`. Resolved disputes drop `in_dispute`, `overdue`, `escalated`. Unfrozen rows drop `frozen`/`admin_frozen`.
- Filter chips use the same predicates so counts match visible flags.

## 6. AdminDisputes.tsx (queue)

- In `admin-disputes.service.ts`, exclude `status = 'resolved'` (or `resolved_at IS NOT NULL`) from Open / Under Review / Escalated / Overdue buckets at the service layer so KPI counts and rows agree.
- Resolved disputes appear only under the Resolved filter.
- SLA overdue text suppressed when row is resolved.

## 7. Backend recompute for `needs_admin_review`

New SQL helper:
```sql
recompute_needs_admin_review(tx_id uuid)
-- sets transactions.needs_admin_review = EXISTS(active blocker)
-- where blocker = active dispute | active investigation
--                | escrow.frozen_amount > 0 | release_review_queue pending
--                | unresolved high-risk/fraud flag
```
Called at the end of `resolve_dispute_atomic`, `freeze_funds_atomic`, `unfreeze_funds_atomic`, investigation resolve/dismiss RPCs. No schema changes.

## 8. Refresh after every admin action

In both detail pages, after `resolveDispute`, `freezeFunds`, `unfreezeFunds`, `resolveInvestigation`, `dismissInvestigation`, `addInternalNote`, `requestMoreEvidence`, `escalateDispute`:
- Invalidate keys `["admin-dispute", id]`, `["admin-tx", id]`, `["admin-disputes-list"]`, `["admin-transactions-list"]` and `await refetch()` before re-enabling buttons / closing dialogs.
- Drop local optimistic flag state.

---

## What's NOT in this pass

- No payout screen, no Paystack transfer wiring.
- Seller-favor outcomes show a disabled "Pending release review" pill only.
- No redesign of unrelated sections.

---

## Acceptance checks

1. Resolve dispute → no "In Dispute / Overdue / Escalated" anywhere; sidebar shows Resolution Summary; SLA pill gone; queue drops the row from active buckets.
2. Unfreeze → no red banner, no Frozen flag, escrow card normal, Unfreeze hidden, Freeze visible; timeline still shows both freeze + unfreeze.
3. Resolve all investigations → `needs_admin_review` recomputes; banner disappears; timeline preserves entries.
4. Old overdue case now resolved → no "77 days overdue" anywhere.
5. **Transaction Detail "Case Timeline" now shows dispute opened, escalated, frozen, investigation opened/resolved, unfrozen, dispute resolved — same entries and same look as the Dispute Detail timeline.**
6. List, transaction detail, dispute list, dispute detail show the same flags for the same record.
7. No Paystack call originates from this page.

---

## Files touched

- New: `src/lib/admin-active-state.ts`, `src/lib/admin-timeline.ts`, `src/components/admin/timeline/TimelineRow.tsx`
- Edit: `src/pages/AdminDisputeDetail.tsx`, `src/pages/AdminTransactionDetail.tsx`, `src/pages/AdminTransactions.tsx`, `src/pages/AdminDisputes.tsx`
- Edit: `src/components/disputes/DisputeTimeline.tsx` (switch to shared `TimelineRow`)
- Edit: `src/services/admin-disputes.service.ts` (exclude resolved from active buckets)
- Edit: `src/services/admin-transaction-detail.service.ts` + edge function `admin-transaction-detail` (return `disputeStatusHistory`, `disputeOutcomes`, `investigationEvents`, `adminActions`)
- New migration: `recompute_needs_admin_review(uuid)` + calls inside existing admin RPCs.

Approve to implement.
