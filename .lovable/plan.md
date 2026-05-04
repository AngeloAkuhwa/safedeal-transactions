
# Admin Row/Card Actions — SafeDeal Transaction Monitor

## Goals
Add safe, state-aware admin actions per row (desktop) and per card (mobile). All state-changing actions go through dedicated admin edge functions with confirmation + reason + audit. No money movement, payout, or refund from this screen.

## 1. Database changes (one migration)

Schema additions only — no data writes via migration:

1. **`admin_transaction_notes`** (new) — internal admin notes (the existing `transaction_notes` table is seller-scoped, single-row, and not suitable):
   - `id uuid pk`, `transaction_id uuid fk -> transactions(id) on delete restrict`
   - `admin_user_id uuid fk -> profiles(id) on delete restrict`
   - `note text not null check(length(trim(note)) > 0)`
   - `is_pinned boolean default false`, `created_at timestamptz default now()`
   - RLS: admins-only SELECT/INSERT (`has_role(auth.uid(),'admin')`); no UPDATE/DELETE.
   - Index on `(transaction_id, created_at desc)`.

2. **Extend `admin_action_type` enum** with: `add_internal_note`, `flag_for_review`, `unfreeze_transaction`. (`freeze_transaction`, `escalate_case` already exist.)

3. **`audit_action_type` enum** — add `admin_freeze`, `admin_unfreeze`, `admin_flag_review`, `admin_escalate_dispute`, `admin_internal_note`. (Used by `audit_logs.action`.)

No CHECK constraints on time-based values; no triggers added to reserved schemas.

## 2. New edge function: `admin-transaction-actions`

Single function, action-dispatched via `{ action, transactionId, payload }` body. Strict admin gate (JWT → `getClaims` → `has_role rpc`). Service role used only after gate passes. Per-action validation with Zod-style guards.

Supported actions and rules:

- `add_internal_note` — `{ note: string<=2000 }`. Insert into `admin_transaction_notes`; `admin_actions(action_type='add_internal_note', action_notes)`; `audit_logs(action='admin_internal_note')`.

- `freeze` — Allowed only when `escrow_states.held_amount > 0` AND `money_status = 'funds_held_in_escrow'` AND no active completed/refunded state. Requires `{ reason: string(min 8) }`.
  - Update `transactions.money_status='funds_frozen'`
  - Insert `money_status_history(old_status, new_status='funds_frozen', changed_by_user_id=admin, reason)`
  - Update `escrow_states`: move `held_amount` → `frozen_amount` (atomic update by id, conditional on current values to avoid races)
  - `admin_actions(action_type='freeze_transaction')` + `audit_logs(action='admin_freeze')`.

- `unfreeze` — Inverse of freeze; only when `money_status='funds_frozen'` AND `frozen_amount > 0`. Reverse the amounts; insert history; log.

- `flag_for_review` — Allowed when txn is not in terminal state (`completed`/`cancelled`). Requires `{ reason: string(min 8) }`.
  - `transactions.needs_release_review = true`, `release_review_reason = reason`
  - Upsert `release_review_queue` with `queue_type='manual_hold'` (uses existing partial unique index `rrq_unique_open_per_type`); set `seller_id` from txn, `notes = reason`, `status='pending'`.
  - `admin_actions(action_type='flag_for_review')` + `audit_logs(action='admin_flag_review')`.

- `escalate_dispute` — Allowed only when an active dispute exists (`disputes.status in ('open','seller_response_pending','under_review')`) OR `riskLevel in ('high_risk','fraud_watch')`. Requires `{ reason: string }`.
  - If dispute active: update `disputes.status='under_review'` (if not already) and write `dispute_status_history`.
  - If no dispute but high risk: skip dispute update, only audit.
  - `admin_actions(action_type='escalate_case', dispute_id?)` + `audit_logs(action='admin_escalate_dispute')`.

All write paths return the updated availability flags and a fresh `lastActivityAt` so the UI can refresh the row in place.

Forbidden by design (returns 400 with explanatory error if invoked): `release_funds`, `refund_buyer`. The handler refuses these with the message: "Refund must be handled from dispute or payout review."

## 3. New read-only edge function: `admin-transaction-detail`

Aggregates everything needed for the side panels/modals so the UI never queries Supabase directly. Admin-gated. Body: `{ transactionId, sections?: string[] }`. Sections:

- `summary` — header info (code, amounts, statuses, parties masked)
- `timeline` — merged + sorted events from `transaction_status_history`, `money_status_history`, `transaction_events`, `delivery_updates`, `dispute_status_history`, `admin_actions` (limit 200)
- `ledger` — `escrow_ledger_entries` rows (read-only)
- `messages` — last 100 `transaction_messages` (read-only on monitor screen)
- `notes` — `admin_transaction_notes` newest first

## 4. Service layer

`src/services/admin-transaction-actions.service.ts`:
- `addInternalNote`, `freezeTransaction`, `unfreezeTransaction`, `flagForReview`, `escalateDispute`, `getTransactionDetail(id, sections)`
- All call edge functions via `supabase.functions.invoke` with the user JWT; surface `AdminAccessRequiredError` on 403.

Extend `admin-transactions-monitor` row response `actionAvailability` to include new flags consumed by the menu:
`canFreeze`, `canUnfreeze`, `canFlagForReview`, `canEscalateDispute`, `canAddNote` (always true), with parallel `*_reason` strings used as tooltip copy when disabled.

## 5. UI changes — `src/pages/AdminTransactions.tsx`

### Desktop row (Actions column)
Inline icon buttons (left-aligned, already styled):
1. **View Details** (Eye) — `navigate('/admin/transactions/:id')`
2. **More Actions** (MoreVertical) — opens `DropdownMenu` with the rest:
   - Add Internal Note
   - Open Messages
   - View Timeline
   - View Ledger
   - separator
   - Freeze Transaction (or Unfreeze when frozen)
   - Flag for Review
   - Escalate Dispute

Disabled items render with `aria-disabled`, muted styling, and a `Tooltip` showing the `*_reason` returned from the backend (e.g. "Funds already released", "No active dispute", "Transaction is not eligible for freeze").

### Mobile card
Show only:
- **View** icon (top-right)
- **More** menu (kebab) — same dropdown content as desktop, full-width items, larger tap targets

### Modals (new components in `src/components/admin/transactions/`)
- `InternalNoteDialog` — textarea (8–2000 chars), Save / Cancel.
- `FreezeTransactionDialog` — required reason textarea, "Type FREEZE to confirm" guard, summarises affected `held_amount` from row data, Save / Cancel.
- `UnfreezeTransactionDialog` — required reason, similar.
- `FlagForReviewDialog` — reason textarea, queue-type fixed to `manual_hold`.
- `EscalateDisputeDialog` — reason textarea, shows dispute status if any.
- `MessagesDrawer`, `TimelineDrawer`, `LedgerDrawer` — read-only side `Sheet`s sourced from `admin-transaction-detail`.

All dialogs:
- Optimistically disable submit while pending; show toast on success ("Transaction frozen", etc.) and on failure (error message from server).
- On success, trigger `fetchData()` to refresh the table and close.
- Realtime subscription already in place will also pick up the change on other clients.

### Detail route stub
Add minimal `src/pages/AdminTransactionDetail.tsx` at `/admin/transactions/:transactionId` that renders summary + tabbed Timeline/Ledger/Messages/Notes by reusing `admin-transaction-detail`. Out-of-scope: full edit screens. Wire route in `src/App.tsx`.

## 6. Safety rails (enforced server-side)

- Admin gate on every action (JWT + `has_role`).
- Per-action state preconditions checked again server-side immediately before the write — UI flags are advisory only.
- All writes use the service role client, in a sequence ordered to fail safely (history insert before state mutation where possible; conditional `update ... where money_status=...` to prevent races).
- Every action writes both `admin_actions` and `audit_logs`.
- Money movement actions (`release_funds`, `refund_buyer`) are explicitly rejected by this function with a guidance message.
- Confirmation modal mandatory for: Freeze, Unfreeze, Flag for Review, Escalate Dispute.

## 7. File map

```text
supabase/migrations/<ts>_admin_actions_schema.sql      (new)
supabase/functions/admin-transaction-actions/index.ts  (new)
supabase/functions/admin-transaction-detail/index.ts   (new)
supabase/functions/admin-transactions-monitor/index.ts (extend actionAvailability + reasons)
src/services/admin-transaction-actions.service.ts      (new)
src/services/admin-transactions-monitor.service.ts     (extend types)
src/components/admin/transactions/InternalNoteDialog.tsx
src/components/admin/transactions/FreezeTransactionDialog.tsx
src/components/admin/transactions/UnfreezeTransactionDialog.tsx
src/components/admin/transactions/FlagForReviewDialog.tsx
src/components/admin/transactions/EscalateDisputeDialog.tsx
src/components/admin/transactions/MessagesDrawer.tsx
src/components/admin/transactions/TimelineDrawer.tsx
src/components/admin/transactions/LedgerDrawer.tsx
src/components/admin/transactions/RowActionsMenu.tsx     (shared dropdown)
src/pages/AdminTransactions.tsx                        (wire menu + modals)
src/pages/AdminTransactionDetail.tsx                   (new minimal route)
src/App.tsx                                            (add route)
```

## 8. Acceptance criteria mapping

- **State-aware actions** → server-computed `actionAvailability` + `*_reason`; menu items disabled with tooltip.
- **Confirmation + reason for dangerous actions** → Freeze/Unfreeze/Flag/Escalate dialogs each require a reason.
- **All admin actions audited** → every action writes `admin_actions` and `audit_logs`.
- **No casual money movement** → `release_funds` / `refund_buyer` not exposed; rejected server-side if attempted.
- **Mobile actions clean** → only View + More on the card; full menu inside dropdown.
