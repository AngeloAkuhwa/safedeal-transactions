# Payout Management — Visual Parity Pass

Scope: header buttons, KPI cards, tabs/search/filter card, advanced filter dropdown row. No table, sidebar, or business-logic changes.

## 1. `src/components/admin/payouts/PayoutAdvancedFilters.tsx`
- Change Date Range default option order so **"Last 7 days"** is first (currently first already, but selected value renders as `Custom Range` in screenshot 1 — verify the `<select>` first `<option>` is `"Last 7 days"` so it becomes the default selected). Reorder if needed: `["Last 7 days","Last 30 days","Last 3 months","Custom Range"]` (already correct — confirm rendering).
- Remove always-on green border on Status dropdown: keep `focus:border-emerald-500` but ensure idle state uses `border-border` only (already the case — verify no `border-emerald-500` is applied at rest).
- No structural change otherwise.

## 2. `src/components/admin/payouts/PayoutFilters.tsx`
- Update placeholder text to exactly: `Search seller, transaction, payout ID...` (add trailing ellipsis).
- Keep `h-10`, filled dark slate Filters button, funnel icon — already aligned.

## 3. `src/components/admin/payouts/PayoutTabs.tsx`
- No changes — segmented dark container with emerald active pill already implemented and `All` is default via `AdminPayouts.tsx`.

## 4. `src/components/admin/payouts/PayoutSummaryCards.tsx`
- No code changes. Delta badges (`+3`, `+12`, `+5`) and populated NGN values already wired to backend; they render when backend supplies non-zero data. The reason screenshot 1 shows `0` / `₦0.00` / `—` is that the database has no payout activity yet — this is correct behavior, not a UI bug. Will note this in closing message.

## 5. `src/pages/AdminPayouts.tsx`
- Default tab already `"all"`; Process Batch already always-active emerald; Export Report already filled slate. No change.

## Out of scope (unchanged)
- Table, mobile cards, batch bar, drawer, sidebar
- Backend / edge functions / currency formatter (stays NGN)
- No seed data; empty values reflect real DB state

## Acceptance
- Placeholder reads `Search seller, transaction, payout ID...`
- Date Range select shows `Last 7 days` as the default selected option
- Status dropdown has no green border at idle, only on focus
- Default tab is `All` (already true)
- KPI delta badges + populated values appear automatically once backend returns data
