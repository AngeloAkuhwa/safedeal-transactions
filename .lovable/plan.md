## Goal
Apply the same panel/typography styling we used for the Completed dropdown to the Processing / Pending dropdown so it matches the reference 100%.

## Changes (only `src/components/admin/payouts/PayoutsTable.tsx`, Processing branch ~lines 244-262)

1. **Panel**: switch `DropdownMenuContent` to `align="end" className="w-56 !bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-2 px-0"` (matches Completed and eye-button grey).
2. **Items**: drop the shared `itemCls`; use the same per-item class as Completed — `px-4 py-2.5 text-xs text-slate-300 hover:bg-slate-700 focus:bg-slate-700 focus:text-slate-300 flex items-center gap-3 cursor-pointer rounded-none`. Icons wrapped in `<span className="w-4 flex justify-center">{icon}</span>` so colored icons sit in a fixed slot.
3. **Order & colors (from reference)**:
   - `FaCircleInfo` blue-400 — View Processing Status → `onOpen`
   - `FaUser` pink-400 — View Seller Profile → `comingSoon`
   - `FaReceipt` blue-400 — View Transaction Details → `onOpenTransaction`
   - separator (`border-t border-slate-700 my-2`)
   - `FaNoteSticky` yellow-400 — Add Internal Note → `comingSoon`
   - `FaPause` orange-400 with `text-orange-400` label — Pause Payout → `comingSoon`
   - `FaBan` red-400 with `text-red-400` label — Block Payout → `comingSoon`
4. No other branches, columns, or services change.

## Files touched
- `src/components/admin/payouts/PayoutsTable.tsx`
- `.lovable/plan.md`
