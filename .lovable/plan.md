## Goal
Make the Admin → Escrow Overview screen a 1:1 visual replica of the reference HTML (`Escrow_Overview-4.html`): exact KPI icons + percentage deltas, exact charts, and a header that stays pinned while the page scrolls underneath.

## What the reference numbers mean
The small `+2.4% / +0.8% / +5.2% / -1.2% / +8.7% / +12.4%` chips on each KPI are **period-over-period change** (current window vs. the previous equivalent window — e.g. last 7 days vs. the 7 days before). They are color-coded by metric:
- Held / Released Today / Released This Week → green tint (growth is good)
- Frozen → red (growth is bad)
- Pending Release → orange (warning)
- Total Refunded → purple (neutral/info, as in the ref)
- Released This Week → cyan

The current edge function already returns `*_delta_pct` fields but always sets them to `0`, which is why the cards render `—`. I will keep them as period-over-period deltas, computed from `escrow_ledger_entries` and `escrow_states` history for the current vs. previous window.

## Changes

### 1. `src/components/admin/escrow/EscrowKpiCards.tsx` (icons + delta colors 1:1 with ref)
- Icons (lucide equivalents of FA icons in the ref):
  - Total Held in Escrow → `Vault` (blue) ✓ already
  - Total Frozen → `Lock` (red) ✓
  - Pending Release → `Hourglass` (orange) ✓
  - Total Refunded → `RotateCcw` (purple) ✓
  - Released Today → `CheckCircle2` (emerald) ✓ (ref uses `fa-check-circle`)
  - Released This Week → `CalendarRange` (cyan) — swap from `CalendarDays` to match `fa-calendar-week`
- Delta chip color must mirror the ref exactly (not green/red by sign):
  - Held → emerald, Frozen → red, Pending Release → orange, Total Refunded → purple, Released Today → emerald, Released This Week → cyan
  - Show `+`/`-` with one decimal, e.g. `+2.4%`. When value is `0`, still show `0.0%` (not `—`) so the chip never looks empty like in the screenshot.
- Keep `fmtCompact` so values like `₦24.8M` don't truncate.

### 2. `supabase/functions/admin-escrow-overview/index.ts` (compute real deltas)
Add a small helper that, for each KPI, compares the current window vs. the previous window of the same length and writes the result into `*_delta_pct`:
- `total_held` / `total_frozen` / `pending_release` / `total_refunded`: compare today's running totals from `escrow_states` snapshot vs. the value 7 days ago, derived by replaying `escrow_ledger_entries`.
- `released_today`: vs. yesterday's completed payouts.
- `released_week`: vs. the previous 7-day window of completed payouts.
Falls back to `0.0` only when the prior window has zero baseline (avoids divide-by-zero), and is capped at ±999%.

### 3. `src/components/admin/escrow/EscrowCharts.tsx` (match the three reference charts exactly)
- **Escrow Balance Trend** — switch from line to **area** chart with stroke `#10b981` width 3, fill `rgba(16,185,129,0.1)`, axis color `#94a3b8`, grid `#1e293b`. Currency tick format `₦`.
- **Escrow State Distribution** — switch from donut to a **filled pie** (no inner radius), labels rendered as `label\npercent` in white directly on slices, colors mapped to the ref palette: Held `#3b82f6`, Frozen `#ef4444`, Pending Release `#f97316`, Released `#10b981`, Refunded `#a855f7`. Remove the bottom Legend (labels are on the slices).
- **Held vs Released vs Refunded Trend** — keep grouped bar chart but recolor to ref palette: Held `#3b82f6`, Released `#10b981`, Refunded `#a855f7`, legend text color `#94a3b8`.

### 4. `src/pages/AdminEscrow.tsx` (true sticky header)
Currently the `sticky top-0` header is rendered as a sibling of `<main>` inside the flex column. With the body as the scroll container it should stick, but in some layouts the flex column's intrinsic sizing breaks sticky. To guarantee the header stays pinned while content scrolls under it:
- Wrap the page in a column that owns its own scroll: render the desktop header as a `sticky top-0 z-30` block, then put KPI/charts/alerts/filters/table inside a sibling that scrolls. Use `AdminLayout` with `fullBleed` so `<main>` doesn't add its own padding/centering, and recreate the `mx-auto max-w-[1400px] px-4 lg:px-8 py-6 space-y-6` wrapper inside.
- Header background stays `bg-slate-900/95 backdrop-blur` with `border-b border-slate-800` so content visibly scrolls underneath.
- Mobile (`AdminMobileHeader`) also gets `sticky top-0 z-30` treatment via the `mobileHeaderSlot` wrapper.

## Out of scope
- No changes to the alerts panel, filters, records table, or routing.
- No new dependencies; charts stay on Recharts (matched visually to Plotly ref).

## Files touched
- `src/components/admin/escrow/EscrowKpiCards.tsx`
- `src/components/admin/escrow/EscrowCharts.tsx`
- `src/pages/AdminEscrow.tsx`
- `supabase/functions/admin-escrow-overview/index.ts`
