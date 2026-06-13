## Problem
1. **All tab shows 4, screen shows 1** — Tab count chips come from `admin-payouts-summary` (unfiltered, all-time), but the list is filtered by the default `Last 7 days` date range. Only 1 payout falls inside the window, so counts and list disagree.
2. **Processing tab shows 2 but loads nothing** — same root cause: the 2 processing payouts are older than 7 days, so the date filter excludes them.
3. **No "All time" option** — `Date Range` select has `last_7d / last_30d / last_3m / custom` only.

## Fix

### 1. Add "All time" date option and make it the default
File: `src/components/admin/payouts/PayoutAdvancedFilters.tsx`
- Add `"all_time"` to `DateRangePreset` type.
- Insert `<option value="all_time">All time</option>` at the top of the Date Range select.
- Change `DEFAULT_PAYOUT_FILTERS.dateRange` from `"last_7d"` to `"all_time"`.
- In `filtersToQuery`, when `dateRange === "all_time"` emit no `date_from`/`date_to` (returns all dates).

### 2. Align URL hydration default
File: `src/pages/AdminPayouts.tsx`
- Change the `searchParams.get("range") || "last_7d"` fallback to `"all_time"` so deep-links without `range=` show everything.

### 3. Keep tab counts and list consistent
Server already paginates the list (`page`, `limit: 50`), so removing the implicit date window is safe. The chip counts from the summary (unfiltered) will then match the table for the default view.

No backend changes needed — `admin-payouts-list` already treats missing `date_from`/`date_to` as "no date filter".

## Out of scope
- Summary KPI cards (Pending Payouts, Processing, Failed, Paid Today/Week) stay unfiltered/all-time as they are.
- No schema or RLS changes.
