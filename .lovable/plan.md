# User Directory header + KPIs — match reference 100%

The current page diverges from the reference in two places. Image 1 (current) shows: an emerald users icon glued to the "User Directory" title, an extra refresh button in the action cluster, and KPI cards rendered in a horizontally scrolling carousel where the delta percentages are clipped ("No chan", "Cle", "0/day a", "0% of to", "100% of tota"). Image 2 (reference) shows a clean title with no leading icon, only Export Users + Add User buttons, and KPI cards in a responsive 6-column grid that wraps cleanly with full deltas visible.

The fix is purely presentational — no service, query, route, or data changes.

## Changes

### 1. `src/components/admin/users/UsersHeaderBar.tsx`
Rebuild markup to mirror the reference exactly:
- Remove the `UsersIcon` from inside the `<h2>`. Title becomes plain `User Directory` with subtitle `Search and manage all platform users`.
- Keep the Live pill (`bg-emerald-500/10` + pulsing dot) and total-users pill (`bg-slate-800` with `Users` icon + `{n.toLocaleString()} total users`).
- Remove the standalone refresh button. The action cluster becomes only:
  - Export Users — `bg-slate-800 hover:bg-slate-700`, `Download` icon.
  - Add User — `bg-emerald-600 hover:bg-emerald-700`, `UserPlus` icon.
- Drop the `onRefresh` / `isFetching` props from the component signature.
- Keep `sticky top-0 z-30 hidden lg:block` so it remains the desktop header inside `AdminLayout`'s `headerSlot`.

### 2. `src/components/admin/users/UsersSummaryCards.tsx`
Replace the dual desktop-grid + mobile-carousel implementation with a single responsive grid that matches the reference:
- Container: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6`.
- Each card: `bg-slate-900 border border-slate-800 rounded-xl p-6`, header row with the colored 12x12 icon tile on the left and the delta text on the right, then `h3` label, `p` value (`text-white text-2xl font-bold`), and small slate-500 hint.
- Drop the `min-w-[240px]` and the horizontal scroll wrapper — that was causing the clipped deltas in image 1.
- Remove the `mobile` prop entirely. Same grid works on all sizes thanks to the responsive cols.
- Card configuration (label, icon, tones, hint) stays bound to `summary` / `summary.deltas`, so live data still drives values; only structure/styling changes.

### 3. `src/pages/AdminUsers.tsx`
- Remove the second `<UsersSummaryCards … mobile />` call — only one render now.
- Remove `isFetching` and `onRefresh` props from `<UsersHeaderBar />` (refresh button no longer exists). `refetch` stays wired for query invalidations elsewhere.
- Loading skeleton grid already uses `lg:grid-cols-6`, keep as-is.

## Out of scope
- Data shape, edge functions, service layer, filters, table, drawer, routes — untouched.
- "Add User" button keeps the existing "Coming soon" toast; the reference has no behavior for it either.

## Verification
- Visual: at 875px viewport (current screenshot width) cards wrap to 2-up / 3-up grid with full deltas visible; at xl they sit in a single row of 6 like the reference image.
- Header: title has no icon, only Export + Add User actions on the right, Live + total-users pills next to the title.
- No TypeScript errors from removed props.
