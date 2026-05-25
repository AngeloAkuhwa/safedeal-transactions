## Problem

On `/admin/disputes`:

1. **Resolved chip shows `(0)` but clicking it returns items.** The chip uses `kpis.resolved_today` (disputes resolved since Lagos midnight), while the `quick=resolved` server filter returns **every** resolved dispute regardless of age. The two numbers come from different sources, so they don't match.
2. **Other chips can drift too**, because:
   - `Overdue` count uses active disputes with `seller_response_due_at < now`, but the chip's filter also keys off the same definition — this one is consistent.
   - `Open`, `Awaiting Seller`, `Under Review` chip counts come from `kpis.*` which are global, while the filter view shows the same set — consistent.
   - `Escalated` chip uses `kpis.escalated` (hardcoded to `0`) and the filter returns an empty set — consistent but always 0.
   - The mismatch is essentially the `Resolved` chip only.
3. **No "All" chip** — user wants to see every dispute in one view.

## Fix

### 1. Edge function `supabase/functions/admin-disputes-queue/index.ts`

Add two new KPI counts so chip numbers match the filter results exactly:

- `resolved_total` — `count` of `disputes` where `status = 'resolved'` (all time).
- `all_total` — `count` of `disputes` (no filter).

Return them in the existing `kpis` object alongside `resolved_today`. Leave `resolved_today` untouched so the "Resolved Today" KPI card keeps its meaning.

### 2. Service types `src/services/admin-disputes.service.ts`

Extend `DisputeQueueKpis` with `resolved_total: number` and `all_total: number`.

### 3. Page `src/pages/AdminDisputes.tsx`

- Restore `{ id: "all", label: "All" }` as the first item in `QUICK_FILTERS`.
- In the chip count switch, map:
  - `all` → `data?.kpis.all_total`
  - `resolved` → `data?.kpis.resolved_total` (not `resolved_today`)
- Leave the KPI strip alone — "Resolved Today" card still uses `resolved_today`.

### 4. Default filter

Keep current default `quick = "open"`. Clicking the new **All** chip switches `quick=all`, which the edge function already handles (no extra status filter).

## Files touched

- `supabase/functions/admin-disputes-queue/index.ts` — add two counts.
- `src/services/admin-disputes.service.ts` — extend type.
- `src/pages/AdminDisputes.tsx` — restore "All" chip, point Resolved chip to new count.

No DB migrations, no UI redesign, no behavior change to KPI cards.
