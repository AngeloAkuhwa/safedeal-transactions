## Goal
Make the row-action dropdown for `status === "completed"` rows in `src/components/admin/payouts/PayoutsTable.tsx` match the reference (`Payout_Management-17.html`, lines 646–668) pixel-for-pixel.

## Reference spec (Completed)
- Container: `w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-2`
- Items (all identical styling): `w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-700 transition-all flex items-center gap-3 text-sm`, icons sized `w-4` and inheriting `text-slate-300` (NOT colored)
- Order, with one separator (`border-t border-slate-700 my-2`) after the third item:
  1. `fa-circle-check` — View Completion Details
  2. `fa-user` — View Seller Profile
  3. `fa-receipt` — View Transaction
  4. — separator —
  5. `fa-download` — Download Receipt
  6. `fa-note-sticky` — Add Internal Note

## Current build mismatches (completed branch, lines 264–279)
- Icons are tinted (emerald, blue, yellow) — should be neutral slate
- Items use default shadcn padding/typography — needs explicit `px-4 py-2 text-sm text-slate-300 hover:bg-slate-700` and `gap-3` to match reference
- Icon sizing is inconsistent — needs `w-4` fixed slot

## Changes (single file: `src/components/admin/payouts/PayoutsTable.tsx`)

1. **Add a shared item class for completed-style rows** (keep other statuses unchanged):
   ```ts
   const completedItemCls =
     "px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 focus:bg-slate-700 focus:text-slate-300 flex items-center gap-3 cursor-pointer";
   const completedIconCls = "w-4 text-center text-slate-300";
   ```

2. **Replace the `if (row.status === "completed")` block in `RowMenu`** so the dropdown renders exactly the 5 items + 1 separator listed above, all using `completedItemCls` and `completedIconCls`, with the container sized `w-56` (already correct) and `bg-slate-800 border-slate-700` (matches shadcn defaults; only add if needed to lock background to reference). Replace per-item colored icon classes with `completedIconCls`. Keep handlers: View Completion Details → `onOpen`, View Seller Profile → `comingSoon`, View Transaction → `onOpenTransaction`, Download Receipt → `comingSoon`, Add Internal Note → `comingSoon`.

3. **Force background to slate-800** on the completed `DropdownMenuContent` by adding `className="w-56 bg-slate-800 border-slate-700 p-2"` to override any popover background drift, matching reference exactly.

## Out of scope
- Dropdowns for failed/processing/pending/blocked/awaiting_release/default — not part of this request.
- Trigger button, table cells, columns, pagination, header — unchanged.
- Service / backend code — none.

## Files touched
- `src/components/admin/payouts/PayoutsTable.tsx` (only)
- `.lovable/plan.md` (refresh to reflect this turn)
