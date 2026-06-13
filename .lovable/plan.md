## Goal
Port the two attached HTML mocks (desktop `Flagged Users.html` + `Mobilematic - Flagged Users.html`) into a real React route at `/admin/flagged-users`, matching the same architectural pattern used for `/admin/escrow` (page + components + service + edge function). Visuals stay 1:1 with the HTML; data comes from the live backend, no mocks.

## Data source (no new tables)
There is no `flagged_users` table. A "flagged user" is derived = any user that has at least one active `admin_actions` row of type `flag_user` / `freeze_transaction` / `escalate_case`, OR who owns a transaction with `needs_release_review = true` / `needs_admin_review = true`, OR who has 2+ disputes opened against them in 30d, OR has chargebacks/refunds, OR identity submission rejected.

Per-user roll-up (computed in the edge function):
- Risk level: `critical | high | medium | low` — derived from count of distinct fraud signals + amount at risk + recency.
- Flag reasons (tags): Multiple Disputes, Chargeback Pattern, Identity Issues, Suspicious Activity, Fraud Detection, Stuck/Frozen Escrow, Admin Flag.
- Related context: latest tx code + escrow amount frozen/held, # disputes 30d.
- Flagged by: most recent `admin_actions.acting_admin_id` → admin profile name, or `"System / Auto-detection"` when no admin action.
- Flagged at: most recent signal timestamp.
- Status: `active | under_review | suspended | resolved` — `suspended` if any admin_actions of type `suspend_user` or profile.is_suspended; `under_review` if open `case_reviews`; `resolved` if latest admin_action is `clear_flag`/closed; else `active`.

## New files

### Edge function
`supabase/functions/admin-flagged-users/index.ts`
- Auth: require admin (reuse the same `requireAdmin` helper as `admin-escrow-overview`).
- GET query params: `risk`, `reason`, `range` (`today|7d|30d|custom`), `status`, `search`, `limit`, `offset`, `sort` (`risk|recent`).
- Aggregates and returns:
  ```ts
  {
    summary: { total_flagged, high_risk, suspended, cleared_this_week, auto_detected, delta_today: {flagged, suspended, cleared} },
    rows: FlaggedUserRow[],
    total: number,
  }
  ```
- Uses service-role client. Joins `admin_actions` + `profiles` + `transactions` + `disputes` + `identity_submissions` + `escrow_states`. Re-uses the same money formatter contract (`NGN`) as escrow.

`supabase/functions/admin-flagged-users-export/index.ts`
- Same filters; streams CSV (mirror `admin-escrow-export`).

Update `supabase/config.toml` to register both functions.

### Service
`src/services/admin-flagged-users.service.ts`
- `getFlaggedUsersOverview(filters)` and `exportFlaggedUsers(filters)`.
- Reuses `AdminAccessRequiredError` from `admin-dashboard.service`. UI never touches `supabase` directly (per project rule).

### Page
`src/pages/AdminFlaggedUsers.tsx`
- Wrapped in `<AdminLayout title="Flagged Users" subtitle="…" badges={…}>`.
- Reads URL search params for filters (so closing a drawer preserves them).
- `useQuery(['admin-flagged-users', filters])`.
- Renders desktop vs mobile via `useIsMobile()` — desktop tree from `Flagged Users.html`, mobile tree from `Mobilematic - Flagged Users.html`. Sidebar/header are intentionally NOT copied — `AdminLayout` already supplies them. We port the content area only.

### Components (`src/components/admin/flagged-users/`)
- `FlaggedHeaderBar.tsx` — header chips (`67 Active Flags`, `12 Critical`), Export + Fraud Detection buttons. Slotted into `AdminLayout headerSlot`.
- `FlaggedMobileHeader.tsx` — mobile sticky header (title + Active count + shield button). Slotted into `mobileHeaderSlot`.
- `FlaggedSummaryCards.tsx` — desktop 5-card grid (Total Flagged, High Risk, Suspended, Cleared, Auto-Detection) with deltas.
- `FlaggedMobileStatsScroll.tsx` — horizontal-snap 3-stat scroller (Total/Critical/Suspended).
- `FlaggedFilters.tsx` — desktop filter card (Risk Level, Flag Reason, Date Range, Status + search + Search/Clear buttons).
- `FlaggedMobileSearchBar.tsx` — mobile search + "Advanced Filters" sheet trigger.
- `FlaggedAdvancedFiltersSheet.tsx` — `<Sheet>` containing the same filter controls for mobile.
- `FlaggedUsersTable.tsx` — desktop table (checkbox, user avatar + name/email/ID, reason chips, risk pill, related context cell with tx code + amount + dispute count, flagged-by avatar, date relative, actions: Review / Investigate / More menu). Left border colour per risk.
- `FlaggedUserCard.tsx` — mobile card with `<details>` "Fraud Context & Details" disclosure, action grid (Review Case, Investigate, Profile, Suspend, Clear Flag).
- `FlaggedUserDrawer.tsx` — opens from row → calls a `admin-flagged-user-detail` GET (one user id) returning full timeline + recent tx + disputes + identity status. (Not in initial scope if backend too heavy — can defer; row actions navigate to `/admin/users/:id` if drawer is off.) For v1, drawer is included and shows the same data already in the row plus the audit-trail list from `admin_actions` for that user.
- `FlaggedBulkActionsBar.tsx` — appears when ≥1 row checked: Suspend All / Clear Flags / Escalate. Each calls existing `admin-transaction-actions`-style endpoint (`admin-flagged-users-bulk` — small new function).
- `FlaggedExportButton.tsx` — calls `exportFlaggedUsers(filters)` and triggers download.
- `FlaggedEmptyState.tsx`, `FlaggedErrorState.tsx`, skeletons.

### Routing
Add to `src/App.tsx`:
```tsx
import AdminFlaggedUsers from "./pages/AdminFlaggedUsers";
<Route path="/admin/flagged-users" element={<AdminFlaggedUsers />} />
```
Sidebar entry already exists.

## Visual fidelity rules
- Colours, spacing, rounded radii, border-l-4 risk strips, chip styles, dark slate palette → copied verbatim from HTML using Tailwind. No design changes.
- Icons: swap FontAwesome → lucide-react equivalents already used in the project (`Flag, AlertTriangle, Ban, CheckCircle2, Bot, Search, Filter, Shield, Bolt, FolderOpen, UserSearch, MoreHorizontal, Download`). Keep colour classes (`text-red-400`, `text-orange-400`, etc.) identical.
- Desktop: `hidden lg:block`. Mobile: `lg:hidden`. Both rendered; `useIsMobile` only used for any data variant differences.
- Floating bulk-action FAB on mobile per HTML (only visible when selection non-empty).

## Acceptance
- Page loads at `/admin/flagged-users` with admin auth enforced server-side.
- Visuals match attached HTMLs at desktop ≥1024px and mobile <768px breakpoints.
- All numbers (summary cards, counts, deltas, "Showing 1-N of M") come from edge function.
- No hardcoded users, amounts, or counts anywhere.
- Filters & search update URL params and refetch.
- Empty / loading / error / 403 states implemented.
- Export downloads CSV reflecting current filters.
- Money/amount fields use the project formatter; missing values show `—`.
- Drawer opens from row, closes preserving filters.