## Goal

The sidebar already links `Escrow → /admin/escrow`, but no route is registered (it currently 404s — `AdminReconciliation` lives at `/admin/reconciliation`). Build a new **Admin Escrow Overview** page at `/admin/escrow` that matches the attached `Escrow Overview.html` 1:1 in layout, structure, and visual styling, ported to our React + Tailwind + shadcn stack and our design tokens.

## Scope

Frontend + a small read-only backend aggregator. No business-logic changes, no edits to existing escrow/payout flows.

## What the HTML contains (and how we'll map it)

```text
1. Page header           → "Escrow Overview" + Live indicator + Export / Audit Report buttons
2. KPI strip (6 cards)   → Total Held · Total Frozen · Pending Release · Total Refunded · Released Today · Released This Week
3. Charts row            → Balance Trend (30d line) · State Distribution (donut) · Held vs Released vs Refunded (14d bars)
4. Escrow Alerts panel   → Frozen Too Long · Mismatch w/ Provider · High-Value Held · Dispute Stalled
5. Filters & Search      → State / Date Range / Amount Range / Special Flags + search input
6. Escrow Records table  → Transaction · Buyer · Seller · Total Held · Frozen · Releasable · State · Last Changed · Actions
```

## Architecture

### New files

- `src/pages/AdminEscrow.tsx` — page shell (uses `AdminLayout`)
- `src/components/admin/escrow/EscrowKpiCards.tsx`
- `src/components/admin/escrow/EscrowCharts.tsx` (uses existing `recharts` instead of Plotly — already a project dep)
- `src/components/admin/escrow/EscrowAlertsPanel.tsx`
- `src/components/admin/escrow/EscrowFilters.tsx`
- `src/components/admin/escrow/EscrowRecordsTable.tsx`
- `src/components/admin/escrow/EscrowMobileCards.tsx` (mobile counterpart of the table)
- `src/services/admin-escrow.service.ts` — typed client for the new edge function
- `supabase/functions/admin-escrow-overview/index.ts` — admin-only aggregator

### Backend aggregator (`admin-escrow-overview`)

Read-only edge function (verifies caller via `has_role(uid,'admin')`). Returns one JSON payload:

```ts
{
  kpis: {
    total_held: number, total_held_count: number, total_held_delta_pct: number,
    total_frozen: number, total_frozen_count: number, total_frozen_delta_pct: number,
    pending_release: number, pending_release_count: number, pending_release_delta_pct: number,
    total_refunded: number, total_refunded_count: number, total_refunded_delta_pct: number,
    released_today: number, released_today_count: number, released_today_delta_pct: number,
    released_week: number, released_week_count: number, released_week_delta_pct: number,
  },
  trends: {
    balance_30d: { date: string; balance: number }[],
    state_distribution: { state: string; value: number }[],
    flow_14d: { date: string; held: number; released: number; refunded: number }[],
  },
  alerts: {
    frozen_too_long: { tx_id, code, amount, days_frozen }[],
    provider_mismatch: { tx_id, code, delta }[],          // from escrow_reconciliation_results
    high_value_held: { tx_id, code, amount, held_for }[],
    dispute_stalled: { tx_id, code, amount, stalled_for }[],
    counts: { critical: number, warning: number },
  },
  records: {
    total: number,
    page: number,
    page_size: number,
    rows: {
      transaction_id, transaction_code, created_at, money_status,
      buyer: { name, email, avatar_url },
      seller: { name, email, avatar_url },
      total_held, frozen, releasable, state, last_changed_at,
      flagged: boolean,
    }[],
  }
}
```

Data sources (existing tables only — no schema changes):
- `escrow_ledger_entries` for balances (sum by `entry_type`, scoped by tx `money_status`)
- `transactions` + `transaction_pricing` for state + amount + timestamps
- `escrow_reconciliation_results` for provider mismatch alerts
- `disputes` for stalled-dispute alerts
- `profiles` for buyer/seller display

Filters supported as query params: `state`, `date_range` (`today|7d|30d|custom` + `from/to`), `amount_bucket`, `flag` (`disputed|flagged|high_value`), `q`, `page`, `page_size`.

### Routing

- Register `/admin/escrow` → `AdminEscrow` in `src/App.tsx` (the page is gated by `ProtectedRoute` + admin check, matching siblings like `AdminPayouts`).
- Leave `/admin/reconciliation` untouched (it stays the deep drift/snapshot tool linked from the alerts panel).

## Visual fidelity

- Use the exact slate-950/slate-900/slate-800 surface palette, emerald/red/orange/purple/cyan accent set, rounded-xl cards, 6-up KPI grid, and section spacing from the HTML.
- Replace Font Awesome icons with the equivalent `lucide-react` icons (`Lock`, `HourglassIcon`/`Hourglass`, `RotateCcw`, `CheckCircle2`, `CalendarDays`, `Wallet`, `TriangleAlert`, `Flag`, `Search`, `Filter`, `Download`).
- Replace Plotly charts with `recharts` (`LineChart`, `PieChart`, `BarChart`) sized to match (h-[300px] / h-[350px]).
- All copy, headings, badge labels, button labels, and section ordering match the HTML verbatim. Numbers/avatars come from the real API payload.

## Responsive behavior

- Desktop (`lg+`): full layout per HTML (6-col KPI, 2-col chart row + full-width flow chart, 2-col alerts, full table).
- Tablet (`md`): KPIs 3-col, charts stack, alerts 1-col, table scrolls horizontally.
- Mobile (`<md`): KPIs 2-col compact, charts single column with shorter heights, alerts list, records render via `EscrowMobileCards` (mirrors the styling we already use for `PayoutMobileCards`).

## Loading / empty / error

- Skeleton blocks per section while the aggregator query is `loading`.
- Empty states ("No active alerts", "No escrow records match these filters") use the same muted-slate style as the rest of the admin surface.
- React Query `staleTime: 30s`, `refetchOnWindowFocus: true` (consistent with `AdminDashboard`).

## Out of scope

- Editing `AdminReconciliation`, payouts, or any existing service.
- Real-time websockets (the "Live" pill is a visual indicator; data refreshes via polling/focus).
- Configurable alert thresholds (the "Configure Alerts" button renders disabled with a tooltip "Coming soon").
- Bulk actions on records.
