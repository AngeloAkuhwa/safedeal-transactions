Restore the reference design's natural cell widths and replace the cramped fixed layout with a silent (hidden-scrollbar) horizontal scroll, matching the reference HTML exactly. Also verify tabs — they already match (All / Pending / Processing / Failed / Completed / Blocked, no duplicates), so no changes needed there.

## Single file: `src/components/admin/payouts/PayoutsTable.tsx`

### 1. Drop fixed layout, restore reference sizing
- Remove `table-fixed` and the `<colgroup>` block.
- Restore `min-w-[1100px]` on the `<table>` so cells size to their content (matches reference, where IDs like "PAY-2024-001234" and "Bank account blocked" render in full).
- Wrap the `<table>` in a scroll container: `<div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">` — provides silent horizontal scroll exactly like reference (`::-webkit-scrollbar { display: none; }`).

### 2. Restore cell padding to match reference
- `<th>` and `<td>`: `px-3 py-3` → `p-4` (back to reference spec).

### 3. Loosen truncation so content is visible
- Payout ID text: `truncate` → no truncate (full ID slice + caption shown).
- Seller name/email: drop `truncate` (full name shown).
- Transaction code button: drop `truncate`.
- Transaction subtitle: drop `truncate` (let `whitespace-nowrap` shape it like reference).
- Payout account bank name: drop `truncate`, keep `whitespace-nowrap`.
- Drop the per-column `min-w-0` wrappers that were forcing shrink.

### 4. Actions column
- Revert Details button visibility back to `hidden md:inline-flex` (now that there's room via horizontal scroll, the secondary Details button should appear from md+).

## Tabs check
Already match reference 1:1 (`All`, `Pending`, `Processing`, `Failed`, `Completed`, `Blocked`) in `PayoutTabs.tsx`. Single render in `AdminPayouts.tsx`. No duplicates to remove.

## Out of scope
- Mobile cards.
- Any data/logic, status pill, or other components.
