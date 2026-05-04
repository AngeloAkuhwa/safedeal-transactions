## Context: what is already in place (do NOT touch design)

After reading `src/pages/AdminTransactionDetail.tsx`, the action service `src/services/admin-transaction-actions.service.ts`, and the edge function `supabase/functions/admin-transaction-actions/index.ts`, most of the spec is already implemented. The page already renders the existing layout exactly as designed and we will keep it intact:

- Desktop summary action row already shows: Export Data, Open Investigation, Freeze Funds, Unfreeze Funds, Manage Dispute (when present).
- Desktop "More" dropdown already shows: Open Investigation, Freeze, Unfreeze, Add Internal Note, Flag for Review, View Buyer, View Seller, Copy Code.
- Mobile sticky bottom bar already exists with `Take Action` + `More` opening the same bottom sheet.
- `ActionConfirmDialog` already enforces reason min length, danger tone, type-to-confirm (FREEZE), loading state, and toast on success.
- `InternalNoteDialog` already supports the 6 note types (note, escalation, risk, payment, dispute, payout) and writes to `admin_transaction_notes` + `admin_actions` + `audit_logs` server-side.
- Edge function explicitly refuses `release_funds` / `refund_buyer` and validates state for freeze/unfreeze/flag.
- `adminActionsAvailable` is computed server-side and already gates the buttons.

## What is missing / partial vs the new spec

1. **No quick actions for "View Payment Record / View Escrow Ledger / View Payout Record"** in the More menu or mobile sheet. The data is already rendered on the page (Linked Records, Escrow Ledger, Payouts sections), so these actions should *jump to* those existing sections — no new design.
2. **Manage Dispute is hidden when no dispute exists.** Spec asks for "hide or disable with tooltip"; we currently just hide. Add a disabled entry in the More menu / sheet with a tooltip explaining why.
3. **Mobile bottom sheet does not respect ordering** described in the spec (primary state-aware actions first, secondary navigation last) and shows every enabled item in one undifferentiated grid. Spec wants "only actions allowed for the current state" — already true via `adminCan`, but we should re-order and group with a thin section divider (not a redesign — same Sheet, same buttons).
4. **Flag for Review confirmation modal** description does not show `transaction code + current money status + warning copy`. Spec is explicit. Same for Freeze.
5. **Export Data** currently produces a JSON of summary/timeline. Spec requires it to include payment/escrow summary, dispute evidence metadata, and admin audit trail. Need to widen the payload assembled in `exportData()` to include `data.linked`, `data.ledger`, `data.dispute?.evidence` (metadata only — file ids, names, types, hashes, no binary), `data.audit`, and `data.notes`.
6. **`canFlagForReview` rule** today is `!tx.needs_release_review`. Spec says "Available when not already flagged" — same intent, but we should also exclude terminal statuses on the client (already enforced server-side, but the client should not show the button for completed/refunded/cancelled). Mirror the server check in the computed flag returned from the detail edge function so the UI stays clean.
7. **Investigation rule** today fires when risk != clean OR dispute OR needs_release_review. Spec also says "admin wants manual review" — that's a permanent capability for admins, so we should let the action always be available unless an investigation already exists. Add a server-side check: if there is already an `[investigation]` note open, the button label flips to "Update Investigation" (still uses `open_investigation` action and appends a new note + audit).
8. **No success refetch** consistency — most actions call `setReloadKey`, but `addInternalNoteTyped` does too; verify all paths refetch the detail. Current code does. Just confirm the `View Payment Record` link doesn't accidentally trigger a refetch loop.

The screen design itself stays exactly as it is. Everything below is wiring + server gating + small text/copy changes inside existing dialogs.

## Implementation plan

### A. Edge function — `supabase/functions/admin-transaction-detail/index.ts`

Update the `adminActionsAvailable` block (around line 578) to:

```ts
const TERMINAL = ["completed", "cancelled", "refunded", "timed_out"];
const isTerminal = TERMINAL.includes(tx.status);
const hasOpenInvestigation = !!(notes ?? []).find(n => /^\[investigation\]/.test(n.note));

const adminActionsAvailable = {
  canExport: true,
  canAddNote: true,
  canFreeze: tx.money_status === "funds_held_in_escrow" && !isTerminal,
  canUnfreeze: tx.money_status === "funds_frozen",
  canFlagForReview: !tx.needs_release_review && !isTerminal,
  canManageDispute: !!disputeOut && disputeOut.status !== "closed",
  hasDispute: !!disputeOut,                 // NEW — drives disabled tooltip
  canOpenInvestigation: !isTerminal,        // always available for non-terminal
  investigationAlreadyOpen: hasOpenInvestigation, // NEW — flips label
  canViewBuyer: !!parties.buyer,
  canViewSeller: !!parties.seller,
  canViewPayment: !!linked?.payment,        // NEW
  canViewEscrowLedger: Array.isArray(ledger) && ledger.length > 0, // NEW
  canViewPayout: !!linked?.payout,          // NEW
};
```

No other server change is needed; the existing `admin-transaction-actions` edge function already accepts and audits all required actions.

### B. Page — `src/pages/AdminTransactionDetail.tsx`

All changes here are to existing controls — no layout, no new sections, no new cards, no design tokens.

1. **More menu (desktop) — extend the existing `<DropdownMenuContent>` only**

Add three navigation items after `View Seller`, before the final separator:

```tsx
{adminCan.canViewPayment && (
  <DropdownMenuItem onClick={() => scrollToId("linked-records")}>
    <CreditCard className="h-4 w-4 mr-2" /> View Payment Record
  </DropdownMenuItem>
)}
{adminCan.canViewEscrowLedger && (
  <DropdownMenuItem onClick={() => scrollToId("escrow-ledger")}>
    <Coins className="h-4 w-4 mr-2" /> View Escrow Ledger
  </DropdownMenuItem>
)}
{adminCan.canViewPayout && (
  <DropdownMenuItem onClick={() => scrollToId("payouts")}>
    <Banknote className="h-4 w-4 mr-2" /> View Payout Record
  </DropdownMenuItem>
)}
```

`scrollToId` is a tiny inline helper: `document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })`. The Linked Records, Escrow Ledger, and Payouts cards are already on the page; we just give each its existing wrapper an `id="linked-records"`, `id="escrow-ledger"`, `id="payouts"`. No visual change.

2. **Manage Dispute — disabled-with-tooltip variant**

Wrap the existing Manage Dispute item so it stays in the menu when there is no dispute, but is disabled with a tooltip:

```tsx
<DropdownMenuItem
  disabled={!adminCan.canManageDispute}
  onClick={() => dispute && navigate(`/admin/disputes/${dispute.id}`)}
  title={!adminCan.canManageDispute ? "No active dispute on this transaction" : undefined}
>
  <Scale className="h-4 w-4 mr-2" /> Manage Dispute
</DropdownMenuItem>
```

3. **Open Investigation label flip**

Use `adminCan.investigationAlreadyOpen` to switch the button label between "Open Investigation" and "Update Investigation" in both the summary action row and the More menu. The action handler is unchanged.

4. **Mobile bottom sheet — re-order existing buttons only**

Inside the existing `<Sheet>` `grid-cols-2`, render in this order, each gated by its `adminCan` flag (no new components):

- Row 1 (state-aware critical): Freeze / Unfreeze, Flag for Review
- Row 2 (case work): Manage Dispute (disabled when none), Open Investigation
- Row 3 (records — new wiring): View Payment Record, View Escrow Ledger, View Payout Record (each calls `scrollToId(...)` and closes the sheet)
- Row 4 (people + utility): View Buyer, View Seller, Add Note, Export, Copy Code

This is purely re-ordering; no styling changes.

5. **Confirmation modal copy — Freeze and Flag for Review**

Update the `description` props passed to `ActionConfirmDialog`:

```tsx
// Freeze
description={`Transaction #${code} — current money status: ${titleCase(tx.moneyStatus)}.
Freezing prevents any release or refund until you unfreeze. Type FREEZE to confirm.`}

// Flag for Review
description={`Transaction #${code} — current money status: ${titleCase(tx.moneyStatus)}.
This adds the transaction to the admin review queue and sets needs_release_review=true.`}
```

These are string changes inside the existing dialogs.

6. **Export Data payload widening — `exportData()` only**

Expand the existing JSON download to include the dispute evidence metadata, escrow ledger, linked records, audit trail, and admin notes:

```ts
const payload = {
  exportedAt: new Date().toISOString(),
  transaction: data.summary,
  parties: data.parties,
  agreement: data.agreement,
  delivery: data.delivery,
  timeline: data.timeline,
  linked: data.linked,                   // payment + payout summary
  ledger: data.ledger,                   // escrow ledger
  dispute: data.dispute && {
    ...data.dispute,
    evidence: (data.dispute.evidence ?? []).map(e => ({
      id: e.id, kind: e.kind, title: e.title, mimeType: e.mimeType,
      uploadedAt: e.uploadedAt, uploadedByRole: e.uploadedByRole, fileHash: e.fileHash,
    })), // metadata only — never raw URLs/binary
  },
  notes: data.notes,
  audit: data.audit,
};
```

The existing download logic (Blob → anchor click) is unchanged. Filename stays `transaction-${code}.json`.

7. **No money-movement actions added**

Continue to omit any "Release Funds" / "Refund Buyer" buttons. The edge function already refuses those actions. The Linked Records cards remain read-only.

### C. Acceptance check (manual)

- On `funds_held_in_escrow`: Freeze visible+enabled, Unfreeze hidden, Flag visible (if not already flagged).
- On `funds_frozen`: Unfreeze visible+enabled, Freeze hidden.
- On `completed/refunded/cancelled/timed_out`: Freeze, Unfreeze, Flag for Review hidden; Export, Add Note, View Buyer/Seller, View Payment/Escrow/Payout still available; Manage Dispute disabled with tooltip.
- Manage Dispute is always visible in More menu; disabled with tooltip when no dispute, navigates when dispute exists.
- Open Investigation always visible for non-terminal txns; label switches to "Update Investigation" when an investigation note already exists.
- View Payment/Escrow/Payout smooth-scroll to the existing cards on the same page; never opens any new screen and never mutates data.
- Freeze and Flag confirmation dialogs show transaction code + current money status + warning + reason field with min length; submit is disabled until reason is entered (and FREEZE typed for freeze).
- Every successful action toasts, increments `reloadKey`, and the detail re-fetches from the edge function.
- Export Data downloads a JSON containing summary, timeline, linked/payment/escrow/payout summaries, evidence metadata (no URLs/binaries), audit logs, and admin notes.
- Mobile sticky bar untouched visually; sheet shows the same buttons in the new order, each respecting `adminCan`.
- No design tokens, spacing, colors, sections, or cards changed anywhere on the page.

## Files touched

- `supabase/functions/admin-transaction-detail/index.ts` — extend `adminActionsAvailable` (new flags + label hint).
- `src/pages/AdminTransactionDetail.tsx` — add `scrollToId` helper, wire the three "View …" menu items + mobile sheet items, disabled Manage Dispute fallback, label flip for Open/Update Investigation, expand `exportData()` payload, update Freeze/Flag dialog descriptions, attach `id="linked-records" / "escrow-ledger" / "payouts"` to the three already-rendered card wrappers.
- `src/services/admin-transaction-actions.service.ts` — no change.
- `supabase/functions/admin-transaction-actions/index.ts` — no change (already audits and refuses money movement).

## Design changes I would need from you (none required, but flagging)

The spec does not require a new section, badge, or layout. Two optional questions worth raising before we ship:

- Do you want the three new "View Payment / Escrow / Payout" actions to *also* appear as small inline buttons on the existing Linked Records / Escrow Ledger / Payouts card headers? Today they only live in the More menu / sheet. (Default: no — keep design unchanged.)
- Do you want a small "Investigation open" pill added to the existing Risk & Investigation card header when `investigationAlreadyOpen` is true? (Default: no — keep design unchanged; the label flip on the Open/Update Investigation button is enough.)

If you want either of those, say the word and I'll add it; otherwise this plan is design-preserving.