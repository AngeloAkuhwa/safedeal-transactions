# Compact KPI + Queue Filters section on `/admin/disputes`

Scope: only the top section of `src/pages/AdminDisputes.tsx` — the `KpiStrip` component and the Queue Filters `<section>` (lines ~155–475). Do NOT touch the table, sidebar, header, routing, or filter logic.

## Problems

- KPI cards use `p-5`, `text-3xl`, `mt-4` label, `gap-4/5` — too tall and roomy versus approved.
- Quick filter chips use mismatched per-id border/bg colors even when inactive, making Overdue+Open look "always selected". Approved: only the selected chip is highlighted; others are neutral slate.
- Filter card uses `space-y-4` + `p-6`; the grid uses `gap-3` and selects use default `Input`/`select` heights producing inconsistent control heights and a bright focus border on selects.

## Changes

### 1. `KpiStrip` (lines ~167–205)

Container:
```tsx
<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
```
(remove `lg:gap-5`)

Card button:
- Padding: `p-4` (was `p-5`).
- Keep border style; remove hover translate (already gone).

Inside card:
- Icon tile: keep `h-10 w-10 rounded-lg`, icon `h-5 w-5`.
- Number: `text-2xl font-bold` (was `text-3xl font-semibold`).
- Label spacing: `mt-3 text-sm font-medium text-foreground/90` (was `mt-4`).
- Helper: `mt-0.5 text-[11px]` (was `mt-1`).

### 2. Queue Filters section (lines ~364–475)

Outer section:
```tsx
<section className="rounded-xl border border-border bg-card p-5 space-y-4">
```
(p-5 instead of p-6; keep space-y-4.)

Top row wrapper unchanged structure, but:
- Title: keep `text-base font-semibold`.
- Chips gap: `gap-2` (already), wrapper `gap-3` between title and chip group.

Chip button (replace inactive variants with single neutral style, keep colored active variants):
```tsx
const baseInactive = "border border-border bg-muted/40 text-foreground/80 hover:bg-muted hover:text-foreground";
// baseActive map stays as-is (red/orange/yellow/blue/purple/emerald/foreground per id)
className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${isActive ? baseActive : baseInactive}`}
```
Only the AlertTriangle icon stays on the Overdue chip.

Right side (Clear filters + Advanced Filters): unchanged.

### 3. Search / select row (lines ~433–474)

Grid gap stays `gap-3` but normalize control heights to `h-10` and unify focus styles. Replace all three `<select>` classNames with:
```
"appearance-none w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-0"
```
Search Input adds `h-10` and explicit ring overrides to kill the bright white default focus:
```
className="h-10 pl-9 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-0 focus-visible:border-blue-500/60"
```

### 4. Page vertical rhythm (line ~359)

Change `space-y-6` → `space-y-5` on the content wrapper so KPI → Filters → Table gaps feel like the approved 24–28px rhythm rather than 32px+.

## Out of scope

- Table column widths, rows, Actions/Agent cells, kebab menu, navigation.
- Sidebar, header bar, Live sync / Export / Open Investigation buttons.
- Filter logic, search submit behavior, auto-refresh, URL params.
- Mobile card list.

## Acceptance

- 6 KPI cards in one row on `lg+`, visibly shorter (~120px) with `text-2xl` numbers and tighter label spacing.
- Inactive chips render neutral slate; only the currently selected chip shows its colored highlight.
- Search input and all three selects share the same `h-10` height with a soft blue focus ring — no bright white border on focus.
- Filter card height is reduced; Queue Filters title, chips, and Advanced Filters stay on one row at desktop widths.
- Table, sidebar, header, and all filter functionality unchanged.

## File

- `src/pages/AdminDisputes.tsx` — `KpiStrip` (≈167–205), content wrapper line 359, Queue Filters section (≈364–475).
