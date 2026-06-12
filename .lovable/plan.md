## Goal
Make the Failed-row ⋮ dropdown in `PayoutsTable.tsx` look identical to the Completed/Processing branches (which match the HTML reference + the grey eye-icon background), with slightly smaller text for better breathing space.

## Scope
File: `src/components/admin/payouts/PayoutsTable.tsx`, only the `if (row.status === "failed")` branch (lines 226–242). No logic, no service, no data change.

## Changes
1. Panel container: replace `className="w-56"` with `w-56 !bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-2 px-0` (same slate-800 grey as the eye button + Completed/Processing panels).
2. Items: stop using the old `itemCls`. Reuse the shared row pattern from the Processing branch:
   - `rowCls = "px-4 py-2.5 text-xs text-slate-300 hover:bg-slate-700 focus:bg-slate-700 focus:text-slate-300 flex items-center gap-3 cursor-pointer rounded-none"`
   - `iconSlot = "w-4 flex justify-center"`
   - Wrap each icon in `<span className={iconSlot}>...</span>` and put the label in its own `<span>`.
3. Separator: replace `<DropdownMenuSeparator />` with `<div className="border-t border-slate-700 my-2" />` (matches reference).
4. Items rendered (preserving current handlers and ordering from the reference Failed menu):
   - View Failure Details — `FaCircleInfo` blue-400 → `onOpen`
   - Update Bank Account — `FaPenToSquare` pink-400 → `comingSoon("Update Bank Account")`
   - View Seller Profile — `FaUser` pink-400 → `comingSoon("View Seller Profile")` (icon color aligned with Processing branch for consistency)
   - View Transaction — `FaReceipt` blue-400 → `onOpenTransaction`
   - separator
   - Add Internal Note — `FaNoteSticky` yellow-400 → `comingSoon("Add Internal Note")`
   - Block Payout — `FaBan` red-400, row text red-400 → `comingSoon("Block Payout")`

Text size goes from default (`text-sm`) to `text-xs`, matching the breathing space achieved on the Completed/Processing menus.

## Verification
Open Admin → Payouts → Failed row → click ⋮. Confirm: slate-800 background matching the eye-button grey, smaller text, blue/pink/yellow icon accents, red Block Payout, divider before the note/block group.

## Out of scope
- Failed-row cell styling (icon, caption, Retry/Details buttons) — already implemented.
- Wiring "View Failure Details" / "Update Bank Account" to real flows.
