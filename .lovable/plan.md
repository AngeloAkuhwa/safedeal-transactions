
## Goal
The admin area (`/admin/*`) is currently hardcoded to a dark slate palette (`bg-slate-950`, `text-slate-100`, `border-slate-800`, etc.). Make it fully theme-aware so it follows the same light/dark toggle used by the buyer/seller areas via `next-themes`.

## Approach
Replace hardcoded `slate-*` / `white` colors with semantic Tailwind tokens already defined in `src/index.css` (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`, `bg-popover`, etc.). These tokens flip automatically when the `.dark` class is applied to `<html>`. Then add the existing `<ThemeToggle />` component into the admin headers.

Accent colors (blue/red/orange/yellow/cyan/purple/green) used for KPIs, badges, and chart strokes stay as-is — they read well on both backgrounds — but their soft fill (`bg-X-500/15`) and border (`border-X-500/30`) opacities will be lightly tuned where contrast is poor on white.

## Files to change

### Layout & chrome
- `src/components/admin/AdminLayout.tsx` — change `bg-slate-950 text-slate-100` → `bg-background text-foreground`; sidebar wrapper border → `border-border`.
- `src/components/admin/AdminSidebar.tsx` — `bg-slate-900` → `bg-card`; section headers and item text → `text-muted-foreground` / `text-foreground`; active state → `bg-primary/10 text-primary border-primary/30`; hover → `hover:bg-muted`; profile footer + logo divider → `border-border`; tooltip → use default token classes.
- `src/components/admin/AdminHeader.tsx` — sticky bar → `bg-background/85 border-border`; title → `text-foreground`; subtitle → `text-muted-foreground`; "Filters" button → `border-border bg-muted/60 text-foreground hover:bg-muted`; insert `<ThemeToggle />` next to the reading-mode control.
- `src/components/admin/AdminMobileHeader.tsx` — `bg-card/95 border-border`; menu/export buttons → `bg-muted text-muted-foreground hover:bg-muted/70`; insert `<ThemeToggle />`.
- `src/components/admin/AdminReadingModeControl.tsx` — swap any `slate-*` references for tokens (popover/menu surfaces).

### Dashboard cards (all under `src/components/admin/dashboard/`)
Apply the same token mapping across:
- `KpiCards.tsx`
- `AdminActionRequired.tsx`
- `TrendCharts.tsx` (chart container, axis text color via CSS var `hsl(var(--muted-foreground))`, grid lines via `hsl(var(--border))`)
- `OperationalHotspots.tsx`
- `RiskAndPaymentHealth.tsx`
- `IdentityAndPayoutHealth.tsx`
- `AuditComplianceSignal.tsx`
- `CriticalAlerts.tsx`
- `RecentActivity.tsx`
- `PerformanceMetrics.tsx`

Mapping reference:
```text
bg-slate-950           → bg-background
bg-slate-900           → bg-card
bg-slate-900/60        → bg-card/60
bg-slate-800/60        → bg-muted/60
text-white             → text-foreground
text-slate-100/200/300 → text-foreground
text-slate-400/500     → text-muted-foreground
border-slate-700/800   → border-border
hover:bg-slate-800     → hover:bg-muted
```

### Page shell
- `src/pages/AdminDashboard.tsx` — skeletons `bg-slate-900` → `bg-muted`; error/empty cards → `bg-card border-border text-foreground`, helper text → `text-muted-foreground`.

## Theme toggle wiring
`next-themes` `ThemeProvider` is already mounted globally (it powers buyer/seller toggles), and `ThemeToggle` already exists at `src/components/ThemeToggle.tsx`. We simply render it:
- in `AdminHeader` (desktop, beside Filters)
- in `AdminMobileHeader` (mobile, beside the menu/export icons)

No new dependencies, no new context, no localStorage code — `next-themes` persists the choice automatically and matches the rest of the app.

## Out of scope
- Other admin pages (`AdminOffers`, `AdminOfferDetail`) — same token swap can follow if requested; this plan focuses on `/admin/dashboard` chrome + cards as that is what the user is viewing.
- Chart color palette redesign — strokes stay the same hues; only background/grid/axis adapt.

## Acceptance
- Toggling theme in the admin header instantly switches the entire admin dashboard between light and dark.
- All text remains WCAG-AA legible in both modes.
- No hardcoded `slate-*` / raw `white` / `black` colors remain in the touched files (accent hues like `blue-500`, `red-400` for status remain).
- Sidebar badges, KPI deltas, alerts, and chart series remain visually distinct in both themes.
