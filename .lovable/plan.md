## Goal

Make the User Directory page match `User_Directory.html` 100%: align every KPI card's icon, color, label, value, delta, and hint copy; drop the duplicate filter section; and align the User Records table action buttons to the reference set.

## Reference card spec (lines 185–256 of `User_Directory.html`)

| # | Label | Icon wrap / icon | Delta tone | Hint text |
|---|---|---|---|---|
| 1 | Total Users | blue-500/10 wrap, `users` | emerald-400 | "+{N} this month" |
| 2 | Verified Users | emerald-500/10 wrap, `user-check` | emerald-400 | "{rate}% verification rate" |
| 3 | Flagged Users | red-500/10 wrap, `flag` | red-400 | "Requires review" |
| 4 | New This Week | orange-500/10 wrap, `user-plus` | orange-400 | "{avg}/day average" |
| 5 | ID Verified | purple-500/10 wrap, `id-card` | purple-400 | "{pct}% of total" |
| 6 | Email Verified | slate-500/10 wrap, `envelope` | slate-400 | "{compact} verified" |

All icon wraps stay `w-12 h-12 rounded-lg border` with matching `/30` border. Delta sits top-right as `text-xs font-semibold`. Label `text-slate-400 text-sm font-medium mb-1`. Value `text-white text-2xl font-bold`. Hint `text-slate-500 text-xs mt-1`. Card shell `bg-slate-900 border border-slate-800 rounded-xl p-6`. Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6`. All of this already matches — only hint copy diverges today.

## Changes

### 1. `supabase/functions/_shared/users-directory-engine.ts` — extend summary
Add three computed fields to `UserDirectorySummary` so the cards can render real-data versions of the reference hints:

- `new_this_month: number` — users created in the trailing 30 days
- `new_per_day_avg: number` — `Math.round(new_this_week / 7)`
- `id_verified_pct: number` — `Math.round((id_verified / total_users) * 1000) / 10`

(`verification_rate` and `email_verified` are already present; `email_verified` compact format is done client-side.)

### 2. `src/services/admin-users-directory.service.ts` — type sync
Add the three new fields to the `UserDirectorySummary` interface.

### 3. `src/components/admin/users/UsersSummaryCards.tsx` — hint copy alignment
Rewrite each card's hint string to match the reference exactly, using real summary data:

1. Total Users — `+{summary.new_this_month.toLocaleString()} this month`
2. Verified Users — `{summary.verification_rate}% verification rate` (unchanged)
3. Flagged Users — `Requires review` (unchanged)
4. New This Week — `{summary.new_per_day_avg}/day average`
5. ID Verified — `{summary.id_verified_pct}% of total`
6. Email Verified — `{formatCompact(summary.email_verified)} verified` (e.g. "189.2K verified")

Keep icons, wraps, deltas, labels, values, grid — they already match.

### 4. `src/pages/AdminUsers.tsx` — remove duplicate filters
Delete the second `<UsersFilters … mobile />` render (lines 152–160). Keep the single instance.

### 5. `src/components/admin/users/UsersFilters.tsx` — always visible
Remove `mobile` prop and the `hidden lg:block` wrapper class so the single instance renders at every breakpoint. No other changes.

### 6. `src/components/admin/users/UsersTable.tsx` — action column parity
Reference HTML row actions (left → right, exactly 7 buttons, each `px-2.5 py-1.5 rounded text-xs` with `h-3.5 w-3.5` icons):

1. View profile — `bg-blue-600`, lucide `User` → opens drawer
2. Transactions — `bg-emerald-600`, lucide `ArrowLeftRight` (matches `fa-money-bill-transfer`) → `/admin/transactions?user=…`
3. Disputes — `bg-orange-600`, lucide `Scale`, red count badge when active → `/admin/disputes?user=…`
4. Investigation — `bg-red-600`, lucide `FileSearch` (matches `fa-magnifying-glass-chart`) → `/admin/flagged-users?u=…`
5. Impersonate — `bg-purple-600`, lucide `UserCog` (matches `fa-user-secret`) → "Impersonation coming soon" toast
6. Flag / Unflag — `bg-yellow-600` (`Flag`) when not flagged, `bg-slate-700` (`FlagOff`) when flagged → existing `onFlagToggle`
7. Export row — `bg-slate-700`, lucide `FileDown` (matches `fa-file-export`) → "Per-user export coming soon" toast

Drop the row-level Suspend button (reference has none; Suspend remains in the drawer).

## Verification

- Each KPI card hint reads exactly as in the spec table with live data.
- Only one filter bar renders at 875px and at desktop.
- Action column shows 7 buttons in the exact order, colors, and icon set above.
- No TS errors; existing handlers still fire.

## Out of scope

Edge functions other than the summary additions, drawer, mobile feed, header bar, sidebar, routing.
