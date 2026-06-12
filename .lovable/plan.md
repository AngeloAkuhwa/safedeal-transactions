## Goal
Match the filter card section (tabs + search + Filters + dropdowns) to the screenshot exactly.

## Differences vs current UI
1. **Tabs container** — screenshot has flat tabs (no muted pill background around the whole row). Only the active tab is a filled chip.
2. **Active tab color** — emerald green (`bg-emerald-500`), not blue.
3. **No count badges** on tabs in the screenshot.
4. **Inactive tabs** — plain muted text, no background, larger horizontal spacing.
5. **Search + Filters** alignment already close; keep `w-72` search and outline Filters button.
6. **Dropdowns row** — already matches (Status, Date Range, Amount Range, Bank Verification, Quick Filters). Confirm `xl:grid-cols-5` and label styling.

## Changes (UI only)

### `src/components/admin/payouts/PayoutTabs.tsx`
- Drop the outer `bg-muted/40 rounded-lg p-1` wrapper styling; use a flat row with `gap-1`.
- Change active tab from `bg-blue-600 text-white` → `bg-emerald-500 text-white`.
- Remove the count badge span entirely.
- Keep all 8 tab values (Reversed, Disputed/On Hold stay — business logic), they just render in the same flat style.

### `src/components/admin/payouts/PayoutAdvancedFilters.tsx`
- Change focus ring from `focus:border-emerald-500` → keep emerald (matches screenshot).
- Confirm label uses `text-xs text-muted-foreground` — already matches.
- No structural change needed.

### `src/components/admin/payouts/PayoutFilters.tsx`
- No change (already matches: search + outline Filters button).

### `src/pages/AdminPayouts.tsx`
- No change to the wrapping card — `bg-card border rounded-xl p-4 sm:p-6 space-y-4` already matches the screenshot's outlined card.

## Out of scope
- No table changes, no header changes, no business logic, no removal of Reversed / Disputed tabs.
