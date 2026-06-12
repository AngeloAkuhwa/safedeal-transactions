## Goal
Match the Payouts header, KPI cards, and tabs/filter card to the reference screenshot. No table, sidebar, or business-logic changes.

## Changes

### `src/pages/AdminPayouts.tsx`
1. **Default tab → `all`** instead of `processing`. Adjust `initialTab` resolution so URL with `tab=processing` still works but the page defaults to `all` on first load (no `tab` param).
2. **Process Batch button — always active green** visually:
   - Drop the `disabled={batchDisabled}` styling-driven greying. Keep the click handler, but show the bright `bg-emerald-600 hover:bg-emerald-700 text-white` regardless of selection (the existing toast already no-ops when nothing is selected, so behavior is preserved). Remove the tooltip wrapper that was tied to disabled state, or keep it without disabling. Selection count chip stays.
3. **Export Report → filled dark slate**: change `variant="outline"` to a filled dark style (`bg-slate-800 hover:bg-slate-700 text-foreground border border-slate-700`) so it reads as a filled button matching the reference, same height as Process Batch.
4. Increase spacing between KPI row and filter card: wrap the page body content in `space-y-6` (or add `mt-2` to the filter card) — currently `space-y-5` from layout.

### `src/components/admin/payouts/PayoutSummaryCards.tsx`
- Already supports `+N` badges from `delta_24h`. No code change required, but confirm tile internal layout (icon top-left, badge top-right, label, large value) already matches — no changes needed.

### `src/components/admin/payouts/PayoutTabs.tsx`
- Wrap tab buttons in a **segmented-control container**: `bg-slate-900/60 border border-border rounded-lg p-1 inline-flex gap-1`. Keep active = `bg-emerald-500 text-white`, inactive = transparent muted text. Remove `flex-1 min-w-0` so the group hugs content like the reference.

### `src/components/admin/payouts/PayoutFilters.tsx`
- Add `...` to placeholder: `Search seller, transaction, payout ID...`.
- Change Filters button from `variant="outline"` to filled dark slate (`bg-slate-800 hover:bg-slate-700 border border-slate-700`) to match the reference.
- Bump input + button height to `h-10` so they align vertically with the segmented tabs row.

### `src/components/admin/payouts/PayoutAdvancedFilters.tsx`
- Increase top spacing: wrap in a div with `pt-2` (the parent `space-y-4` becomes `space-y-6` via the page card padding bump).
- Bump select height from `p-2.5` to `h-10 px-3` for consistent control height.

### `src/pages/AdminPayouts.tsx` — filter card padding
- Change the tabs/filters card from `p-4 sm:p-6 space-y-4` to `p-6 space-y-6 pb-7` for taller, more breathable card matching the reference.

## Out of scope
- Table, mobile cards, batch bar, drawer, sidebar.
- Backend / delta computation (already wired).
- Currency stays NGN with real values.

## Verification
- `/admin/payouts` first load shows `All` tab active inside a single dark segmented container.
- Export Report renders as filled dark slate; Process Batch renders bright emerald with white text/icon, same height.
- KPI tiles show `+3 / +12 / +5` chips when backend reports deltas; otherwise hidden.
- Filter card has clear top/bottom padding; dropdown row sits lower with comfortable gap from tabs row; dropdowns share height with search/Filters button.
