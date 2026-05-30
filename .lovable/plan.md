# Case Timeline & Internal Notes — Corrective Rebuild

Scope: presentation + frontend humanizer only. Single file: `src/pages/AdminDisputeDetail.tsx`. No schema, edge function, or other section changes.

## A. Case Timeline — Visual

- Card: keep `Card` + `CardHeader` with title `Case Timeline`. **Remove** the "Dispute-relevant events" subtitle.
- Container: `pl-5 border-l border-border space-y-5` (no per-item dot circles).
- First row (current status pill): colored dot + status label only, no description, no date.
  - `escalated` → orange, `under_review` → orange, `open` → red, `resolved` → green, `closed` → muted.
- Subsequent rows: bold `text-sm` title, `text-xs text-muted-foreground` description, `text-[11px] text-muted-foreground` date (`MMM d, yyyy HH:mm`), optional `by {actor}` suffix.

## B. Case Timeline — Content Cleanup

1. **Title normalization** to one voice:
   - `dispute_opened` → `Dispute opened`
   - `dispute_status_changed` → `Dispute: under review` / `Dispute: seller response pending` / `Dispute: resolved`
   - `admin_action: escalate_case` → `Case escalated`
   - `admin_action: update_investigation` → `Investigation updated`
   - `admin_action: add_internal_note` → `Internal note added`
   - `admin_action: freeze_transaction` / `unfreeze_transaction` → `Funds frozen by admin` / `Funds released by admin`
   - `money_status` → `Money: <human label>` only when not collapsed (see #2)
   - `escrow_ledger` → `Escrow adjustment` only when not collapsed
   - `seller_response_submitted` → `Seller response submitted`
   - `buyer_evidence_uploaded` / `dispute_evidence_uploaded` → `Evidence uploaded by {buyer|seller}`

2. **Collapse triplets**: group rows where `admin_action` (freeze/unfreeze) + `money_status` + `escrow_ledger` share `at` within ±5s. Keep the `admin_action` row; fold money/escrow detail into its description (`Funds released by admin · Escrow adjustment recorded`).

3. **Parse raw tokens** in descriptions:
   - `[target=funds_held_in_escrow] Dispute resolved` → `Target: Funds held in escrow · Reason: Dispute resolved`
   - `[manual_admin_review/medium] testing Flow` → `Source: Manual admin review · Priority: Medium · Note: testing flow`
   - `follow_up:urgent Can you review...` → `Follow-up (urgent): Can you review...`
   - `resolved/medium` → `Status: Resolved · Priority: Medium`

4. **Inject missing lifecycle rows** from `dispute_status_history`:
   - Add `Dispute: seller response pending` at its `changed_at`.
   - Add `Dispute: resolved` at `disputes.resolved_at` (or status_history row), with green dot.
   - Pull `Dispute: under review` timestamp from `dispute_status_history.changed_at WHERE new_status='under_review'`, not from seller response submission time.

5. **Severity / color map**:
   - green: `dispute_resolved`, money release on resolution
   - red: `dispute_opened`, `freeze_transaction`, `escalate_case`
   - blue: `under_review`, `investigation_updated`, `internal_note_added`, `seller_response_submitted`, evidence uploads, `payment_captured`, `money_held`
   - muted: `Transaction created`

6. **Actor attribution**: render `by {actorName}` on `admin_action` rows; fall back to `SafeDeal Admin` when null.

7. **Suppress noise**: drop the now-redundant `money_status: not_secured — Transaction created` row when a real `transaction_created` row exists at the same minute.

## C. Internal Notes & Investigation — Visual

- Header row: `Internal Notes & Investigation` title left, `+ Add Note` solid blue button right (Plus icon).
- Each note card (`rounded-lg border bg-card p-4 space-y-2`):
  - Row 1: avatar circle (initials) + bold author + `· {noteTypeLabel} · {fmtDate(at)}` muted.
  - Row 2: uppercase colored pill — `ESCALATION` red, `INVESTIGATION` purple, `AGENT NOTE` slate, `FOLLOW-UP` amber.
  - Row 3: note body, with the bracket prefix stripped when promoted to the pill.

## D. Technical Notes

New local helpers in `AdminDisputeDetail.tsx`:

- `humanizeTimelineEntry(row)` → `{ title, description, color, actor }`
- `collapseAdminTriplets(rows)` → merges freeze/unfreeze + money + escrow within ±5s
- `parseInternalNoteTag(body)` → `{ pill, cleanBody }`
- `injectLifecycleRows(rows, statusHistory, dispute)` → adds `under_review`, `seller_response_pending`, `resolved`
- `pickStatusColor(status)` for the header status dot

Render order:
```
sortedRows = sortDesc(
  injectLifecycleRows(
    collapseAdminTriplets(
      humanizeAll(rawTimelineRows)
    )
  )
)
```

## E. Out of Scope

No changes to schema, edge functions, `CaseCommunicationSection`, sidebar, dialogs, or other cards. Buyer/seller evidence grouping (prior work) stays as-is.
