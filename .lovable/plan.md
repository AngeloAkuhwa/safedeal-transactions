# Filter/Tabs Section — Exact HTML Parity

Match `#filters-section` in the reference HTML 1:1 — colors, backgrounds, icons, spacing.

## 1. `src/components/admin/payouts/PayoutTabs.tsx`
- Container: `flex bg-slate-800 rounded-lg p-1 min-w-max` (drop border + slate-900/60)
- Active tab: `px-4 py-2 bg-emerald-500 text-white rounded text-sm font-medium whitespace-nowrap`
- Inactive: `px-4 py-2 text-slate-400 hover:text-white transition-all rounded text-sm font-medium whitespace-nowrap`
- Remove `h-8`, `rounded-md`, `shadow-sm`

## 2. `src/components/admin/payouts/PayoutFilters.tsx`
- Outer: `flex items-center gap-3 w-full lg:w-auto`
- Search input: `pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-full lg:w-80` (drop h-10, bg-muted/40)
- Search icon: `text-slate-400 text-sm`, `left-3`
- Filters button: `px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-all flex items-center gap-2 text-sm font-medium whitespace-nowrap` (drop border slate-700, h-10)

## 3. `src/components/admin/payouts/PayoutAdvancedFilters.tsx`
- Grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4` (drop `pt-2`)
- Label: `text-slate-400 text-xs font-medium mb-2 block`
- Select: `w-full p-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500`

## 4. `src/pages/AdminPayouts.tsx` (filter card wrapper)
- Card wrapper: `bg-slate-900 border border-slate-800 rounded-xl p-6`
- Inner row above advanced filters: `flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4`
- Drop `space-y-6 mt-2 pb-7`

## Out of scope
KPI cards, header buttons, table, drawer, business logic, currency.
