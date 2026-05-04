
## Goal

Bring the Admin Transaction Detail page to 100% visual parity with the uploaded desktop + mobile designs, and wire a complete suite of **state-aware, safely-audited admin actions** with confirmation modals. No money-movement actions are introduced.

---

## Part A — UI alignment (vs. mockups)

Audit of current page vs. the two reference designs revealed these gaps:

### 1. Desktop summary card — bottom action row
The mockup shows, inside the summary card and below the stat grid:
- **Left:** pill `🚩 Escalated Dispute` and pill `🕒 Overdue: 2 days past resolution deadline`
- **Right:** four buttons: `Export Data`, `Open Investigation`, `Freeze Funds`, `Manage Dispute`

Currently those buttons live only in the page header. **Add this row inside the summary card**, conditionally:
- Pills shown only when escalated / overdue (driven by `risk.level` and `dispute.overdue`).
- Buttons only when corresponding `adminActionsAvailable.*` flag is true.

### 2. Header action set
Header keeps `Export` and `View Dispute` (matches mockup) but adds a **More Actions** dropdown (desktop only) for less-used items: `Add Internal Note`, `Flag for Review`, `View Buyer`, `View Seller`, `View Payment`, `View Escrow`, `View Payout`.

### 3. Risk & Investigation card — two-column layout
Mockup splits this card into:
- **Left:** "Risk Assessment" with the big red banner `⚠ High Risk Transaction — ESCALATED` and the flag bullet list.
- **Right:** "Investigation Log" with timestamped admin notes (each row showing `Jan 20, 10:15 - Admin Sarah` + tag like `ESCALATION` / `NOTE` and the note text).
- **Below both:** "Escalation History" timeline with colored dots.

Refactor the Risk card into a 2-column responsive grid and surface the existing `risk.investigationNotes` as the Investigation Log (with type tag derived from note content / pinned status).

### 4. Mobile sticky action bar
Mockup shows a bottom blue button **Take Action** + 3-dot menu. We currently render the top quick-action grid only.
- Add a **sticky bottom action bar** (mobile only, `lg:hidden`): primary blue `Take Action` button + a `⋮` button.
- `Take Action` opens the existing action sheet (already wired). `⋮` opens the same sheet (kept for the "More" affordance shown in the design).
- Keep the top mobile Quick Actions grid (Investigate / Freeze / Export / Manage) — that matches the mockup too.
- Remove the mini header's redundant "Take Action" placeholder if any; ensure page bottom padding (`pb-28`) keeps content above the sticky bar.

### 5. High-risk banner on mobile
Reference shows a prominent red bordered card with an icon and 3 bullet flag lines (`Buyer account flagged…`, `High-value transaction…`, `Dispute opened within 24hrs…`).
- Replace the small red banner with a fuller card on mobile (icon + title + bullet list of flags from `risk.flags`), still gated on `risk.level === high|escalated`.

### 6. Polish
- Ensure each pill / icon color matches mockup exactly: status colors already mapped — no change beyond adding `escalated_dispute` orange pill and `overdue` red icon pill.
- Linked Records cards already render the buyer/seller/payment/escrow/payout/dispute — keep, but ensure the external arrow icon appears in the corner.

---

## Part B — Safe admin actions

Single source of truth: `adminActionsAvailable` returned from the edge function. The frontend renders actions only when its flag is `true`.

### Action catalog (state-aware visibility)

| Action | Visibility (server-derived flag) | UI placement | Confirm? | Backend |
|---|---|---|---|---|
| Export Data | always (`canExport`) | Header + summary row + sheet | no | client-only JSON dump (current behavior, expanded payload) |
| Open Investigation | `canOpenInvestigation` (new flag: `risk.level !== clean` OR `dispute` exists OR `needs_admin_review`) | Summary row + More menu + sheet | no (creates record + audit) | new action `open_investigation` |
| Freeze Funds | `canFreeze` (`money_status = funds_held_in_escrow` AND not released/refunded) | Summary row + More menu + sheet | **yes** — reason + type `FREEZE` | existing `freeze` |
| Manage Dispute | `canManageDispute` (dispute exists & not closed) | Summary row + Header + sheet | no (navigates) | navigate `/admin/disputes/:disputeId` |
| Add Internal Note | `canAddNote` (always true) | More menu + sheet | modal | existing `add_internal_note` (extend payload to include `note_type`) |
| Flag for Review | `canFlagForReview` (true when `needs_admin_review !== true`) | More menu + sheet | **yes** — reason | existing `flag_for_review` |
| Unfreeze | `canUnfreeze` (`money_status = funds_frozen`) | More menu + sheet | **yes** — reason | existing `unfreeze` |
| View Buyer | `canViewBuyer` | More menu | no | navigate `/admin/users/:buyerId` (fallback: open Linked Record) |
| View Seller | `canViewSeller` | More menu | no | same |
| View Payment | `canViewPayment` (payment present) | More menu | no | scroll-to / linked record |
| View Escrow Ledger | `canViewEscrow` (escrow present) | More menu | no | scroll-to ledger card |
| View Payout | `canViewPayout` (payout present) | More menu | no | scroll-to payout card |

**Explicitly excluded** (per spec): release funds, refund buyer. Backend already refuses these actions.

### Confirmation modal rules (Freeze Funds, Flag for Review, Unfreeze)
- Show transaction code, current money status, warning text.
- Reason textarea (min 8 chars). Confirm disabled until reason valid.
- For Freeze: also require typing `FREEZE`.
- Loading spinner while invoking. Success/error toast. On success: refetch detail (`reloadKey++`).

### Open Investigation — minimum behavior (no dedicated investigation table yet)
Server: writes `admin_actions { action_type: 'open_investigation', action_notes: reason || 'opened from tx detail' }`, writes `audit_logs`, and writes a transaction event. Frontend: success toast and reload.

### Add Internal Note — note types
Extend dialog with a small select: `note | escalation | risk | payment | dispute | payout`. Stored as a JSON `metadata` on `admin_actions` and prefixed in `admin_transaction_notes.note` (e.g. `[escalation] …`) since the table has no `note_type` column today.

---

## Part C — Backend changes

### `supabase/functions/admin-transaction-detail/index.ts`
Extend `adminActionsAvailable` with new derived flags:
- `canOpenInvestigation`
- `canFlagForReview`
- `canViewPayment`, `canViewEscrow`, `canViewPayout`

(Keep existing `canFreeze`, `canUnfreeze`, `canManageDispute`, `canExport`, `canAddNote`, `canViewBuyer`, `canViewSeller`, `canRetryPayout`, `canApproveRelease`.)

### `supabase/functions/admin-transaction-actions/index.ts`
Add one new case:
- `open_investigation` — verifies admin, inserts into `admin_actions`, `audit_logs`, optionally an entry into `admin_transaction_notes` tagged `[investigation]`. Returns `{ ok: true }`.

Extend `add_internal_note` to accept optional `note_type` and store it as a prefix in `note` and as `metadata` on the matching `admin_actions` row.

Continue rejecting `release_funds` / `refund_buyer` (already enforced).

### `src/services/admin-transaction-actions.service.ts`
Add:
```ts
export const openInvestigation = (txId: string, reason?: string) =>
  invokeAction("open_investigation", txId, { reason });
export const addInternalNoteTyped = (txId: string, note: string, note_type?: string) =>
  invokeAction("add_internal_note", txId, { note, note_type });
```

---

## Part D — Frontend wiring summary

Files touched:
1. `src/pages/AdminTransactionDetail.tsx`
   - Summary card: add bottom action row + pills.
   - Header: add `More Actions` `DropdownMenu` (desktop).
   - Mobile: full High-Risk card; sticky bottom `Take Action` bar; expanded action sheet (all available actions).
   - Risk & Investigation: 2-column layout; Investigation Log surfaced from `risk.investigationNotes`.
   - New dialogs: `flagForReview` confirm, `unfreeze` confirm, `openInvestigation` confirm-light (no type-to-confirm), `addInternalNoteTyped` (extended note dialog with type select).
2. `src/components/admin/transactions/InternalNoteDialog.tsx` — add optional `noteType` select.
3. `src/components/admin/transactions/ActionConfirmDialog.tsx` — no breaking change; allow `reasonMin = 8` default override per call.

---

## Acceptance criteria checklist
- ✅ Visual parity with desktop + mobile mockups (summary action row, two-column risk card, mobile sticky bar, full red high-risk card).
- ✅ All 11 listed actions present and gated by server-derived flags.
- ✅ Freeze / Flag / Unfreeze require reason + confirmation; loading state + toast + refetch on success.
- ✅ Mobile sticky action bar with Take Action + More menu; sheet shows only allowed actions.
- ✅ All admin actions write to `admin_actions` + `audit_logs` (and `money_status_history` for freeze/unfreeze via existing RPC paths).
- ✅ No release/refund actions rendered or accepted.
- ✅ All currency in NGN with 2 decimals; no hardcoded values remain.
