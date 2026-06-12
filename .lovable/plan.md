## Goal
Make the Payouts top section match the reference HTML 1:1: a darker, solid header band with a sharp border, then the body shade beneath it carrying the KPI tiles (with delta badges on the first three), then the filters card. No table/drawer changes.

## Remaining gaps vs design

1. **Header band** — design uses a solid darker shade (`bg-slate-900`) with a hard `border-b border-slate-800`, against the page body (`bg-slate-950`). Ours currently uses `bg-background/85 backdrop-blur` which produces no visible shade change against the body. Result: no demarcation line.
2. **KPI delta badges** — design shows `+3` (orange), `+12` (blue), `+5` (red) on Pending / Processing / Failed. Our summary API has no delta field, so the badges never render.
3. **Mobile header** — the default `AdminMobileHeader` (different look) renders on small screens for this page. Design has the same titled bar with actions. Low priority but worth aligning.
4. **Spacing** — design uses `p-8 space-y-6` for the body; ours uses the layout default `px-4 py-5 sm:px-6 lg:px-8 lg:py-6` + `space-y-5`. Already close. Keep.
5. Currency stays **NGN** (per project memory). The `$247K / $1.8M / 2.4h` in the reference are sample values only; we keep `formatMoney(..., "NGN")` and real DB values.

## Changes

### `src/pages/AdminPayouts.tsx`
- Replace the `headerSlot` outer classes:
  - from `sticky top-0 z-30 hidden border-b border-border bg-background/85 backdrop-blur lg:block`
  - to   `sticky top-0 z-30 hidden border-b border-border bg-card lg:block`
- This produces the visible shade step + sharp line shown in the design.
- No other logic changes here.

### `src/services/admin-payouts.service.ts`
- Extend `PayoutSummary.summary` to optionally include `delta_24h?: number` on `pending_release`, `processing`, and `failed`. Optional so the front renders gracefully if the backend doesn't return it yet.

### `supabase/functions/admin-payouts-summary/index.ts`
- For each of `pending_release`, `processing`, `failed`, compute `delta_24h` = count of payouts that entered that bucket in the last 24h (using `entered_queue_at` for pending, `initiated_at` for processing, and last failure timestamp / `updated_at` for failed — whichever already exists on `payouts`). Return as integer alongside `count`/`amount`.
- Read-only query. No schema change.

### `src/components/admin/payouts/PayoutSummaryCards.tsx`
- For the first three tiles, derive a `badge` from `s.pending_release.delta_24h`, `s.processing.delta_24h`, `s.failed.delta_24h`:
  - render only if value is a positive integer
  - format as `+N`
  - reuse existing tone chip styles (orange / blue / red)
- Keep `Today / Week / Avg` chips on tiles 4–6 unchanged.
- No `sub` line on any tile (already removed).

## Out of scope
- Table, mobile cards, batch bar, advanced filters dropdowns, drawer.
- Currency formatting (stays NGN).
- Sidebar, mobile header redesign.

## Verification
- Reload `/admin/payouts` at desktop width: header sits on a slightly lighter band with a crisp 1px border separating it from the KPI shade beneath; KPI grid renders 6 tiles; first three show `+N` chips when the backend returns deltas (otherwise hidden cleanly).
- Tabs row stays 6 items (`All, Pending, Processing, Failed, Completed, Blocked`); Filters button uses funnel icon (already done).
