## Two follow-up fixes for Admin Dashboard

### 1. Hide empty Performance Metrics section
File: `src/components/admin/dashboard/PerformanceMetrics.tsx`
- Return `null` when `metrics.length === 0` so we don't render an empty header card.

(Page wrapper unchanged — `PerformanceMetrics` will simply render nothing until real metrics are wired.)

### 2. Pre-seed 7D Transactions-vs-Disputes trend in main payload
File: `supabase/functions/admin-dashboard/index.ts`
- Replace the `emptyTrend` placeholder with a real 7-day daily series built from `transactions.created_at` and `disputes.created_at`, zero-filled for missing days.
- Reuse the same shape returned by `admin-dashboard-trend` (`{ label: "MM-DD", primary, secondary }`) so `TrendCharts` first paint matches the switcher's 7D view exactly.
- Both queries run inside the existing `Promise.all` batch where possible; capped with `.limit(50000)` and date-windowed to last 7 days.
- Deploy `admin-dashboard` after edit.

### Acceptance
- Performance Metrics card no longer appears as an empty shell.
- On first render, the Transactions vs Disputes chart shows real 7-day data instead of an empty chart for one tick.
- No other behavior changes; KPIs, escrow trend, hotspots, alerts, badges, money formatting and auth gating remain identical.
