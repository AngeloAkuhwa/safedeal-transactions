## Plan: Fix Escrow page polish

### 1. Show ₦0.00 for known zeros (Frozen / Released)
The records table currently renders `—` for any falsy number, but `0` is a real, known value here — nothing has been frozen or released yet. Reserve `—` for true unknowns only.

- `src/components/admin/escrow/EscrowRecordsTable.tsx`
  - Desktop rows: render `formatMoney(r.frozen, "NGN")` and `formatMoney(r.released, "NGN")` unconditionally (no `r.x ? … : "—"`). Same for Total Held and Releasable to stay consistent.
  - Mobile cards: same change for the Held / Frozen / Releasable / Released tiles.
  - Keep colour cues (red for frozen, cyan for released) but dim zero amounts slightly (`text-slate-500` when value is `0`) so non-zero rows still pop.

### 2. "View all N alerts" expands the card inline
Each of the four alert cards (Frozen Too Long, Release Overdue, Stuck Escrow, State Mismatch) only previews 3 items; the "View all N alerts →" link is currently inert, so the user sees the chip count but can't reach the extra items.

- `src/components/admin/escrow/EscrowAlertsPanel.tsx`
  - Add `useState<Record<string, boolean>>` for per-card expand state, keyed by card id (`frozen`, `overdue`, `stuck`, `mismatch`).
  - Pass an `expanded` flag + `onToggle` into `AlertCard`. When expanded, show `items` (no slice) and switch the link label to "Show less ↑".
  - Hide the toggle link when `items.length <= 3` (already nothing extra to reveal).
  - Add a scroll cap (`max-h-72 overflow-y-auto`) on the expanded list so a large category doesn't push the rest of the page down.

### 3. No backend changes required
The aggregator already returns up to 10 items per category. The records table will keep using current data — only the render guards change.

### Acceptance
- Frozen / Released columns show `₦0.00` (muted) for the current transaction instead of `—`.
- Clicking "View all 4 stuck alerts →" expands the Stuck Escrow card to show the 4th item (currently hidden) and the link flips to "Show less ↑".
- Header chip totals (3 Critical / 5 Warnings) still match the sum of per-card counts.
