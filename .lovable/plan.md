## Goal
Make the Payouts page top section (header → KPIs → tabs/filters) match the first screenshot 1:1. Visual/structural changes only — no business logic.

## Gaps vs design
1. **Paystack Balance strip** — design shows none above the KPI tiles. Currently rendered.
2. **KPI tiles**:
   - Design shows colored "+N" delta badges on the first three tiles (Pending `+3` orange, Processing `+12` blue, Failed `+5` red). Currently none.
   - Design tiles show only the big number; **no money sub-line** under Pending/Processing/Failed. Currently `₦0.00` sub is shown.
   - Paid Today / Paid This Week tiles in design show only the large money value, no sub line. Match.
3. **Tabs row** — design has exactly 6 tabs in this order: `All, Pending, Processing, Failed, Completed, Blocked`. Currently 8 (`All, Pending Release, Blocked, Processing, Completed, Failed, Reversed, Disputed / On Hold`) causing horizontal scroll.
4. **Filters button icon** — design uses a funnel (`Filter`) icon. Currently `SlidersHorizontal`.

## Changes

### `src/pages/AdminPayouts.tsx`
- Remove the Paystack Balance info strip block entirely (keep the `bal`/`balanceShort` calc only if still needed elsewhere; otherwise drop).
- No other logic changes.

### `src/components/admin/payouts/PayoutTabs.tsx`
- Reduce `TABS` to: `all`, `pending_release` (label "Pending"), `processing`, `failed`, `completed`, `blocked`. Drop `reversed` and `on_hold`. Order to match design.
- Remove `overflow-x-auto` (no longer needed).

### `src/components/admin/payouts/PayoutSummaryCards.tsx`
- Remove the `sub` line from all six tiles (drop the `sub` prop usage).
- Add `badge` to the first three tiles using deltas from `summary.summary.*.delta_24h` if present, otherwise omit. Format as `+N` with matching tone (orange/blue/red). Render with the same chip style already used for Today/Week/Avg.
  - If the API doesn't expose a delta field, render the badge only when a numeric delta is available; otherwise hide. (No backend change.)

### `src/components/admin/payouts/PayoutFilters.tsx`
- Swap `SlidersHorizontal` for `Filter` (lucide) icon to match the funnel in the design.

## Out of scope
- Table, mobile cards, drawer, batch bar, backend, RLS, services.
- No changes to status pill or pagination (already aligned in prior pass).
