## Goal
Tweak the Completed-status row dropdown in `src/components/admin/payouts/PayoutsTable.tsx` so its panel background matches the slate-800 of the eye-icon button next to it, and text feels less cramped.

## Changes (single file)

1. **Force panel bg to match eye button (`bg-slate-800`)** — the shadcn `DropdownMenuContent` default `bg-popover` is rendering darker. Override on the Completed branch with explicit `!bg-slate-800 border-slate-700`.

2. **Reduce item text size** from `text-sm` → `text-xs`, bump vertical padding `py-2` → `py-2.5`, and gap `gap-3` → `gap-3` (unchanged) so items breathe. Icon slot stays `w-4`.

3. **No other status branches change.** No service / column / trigger changes.

## Files touched
- `src/components/admin/payouts/PayoutsTable.tsx`
- `.lovable/plan.md`
