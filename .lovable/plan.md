# Plan: User Directory + Phase 5 (Fraud Hooks on User Surfaces)

## Overview
The admin sidebar already links to `/admin/users` but the route is not built. We will:
1. Port the attached `User Directory.html` into a real React page at `/admin/users` (the "Users" tab), backed by a new read-only edge function + service.
2. Wire **Phase 5**: add Flag User / Suspend / Clear Flag triggers from the user-directory row + a user-detail drawer, and from the existing AdminTransactionDetail / AdminDisputeDetail "View Buyer/Seller" links so admins can act on any user without leaving context.
3. No new schema. All data is derived from existing tables (`profiles`, `auth.users` via service-role, `user_roles`, `identity_submissions`, `transactions`, `disputes`, `admin_actions`).

After Phase 5 the original 5-phase roadmap is complete; this plan also adds a small **Phase 6 (Polish & Verify)** to close the loop.

---

## Phase 5a — User Directory page (port of HTML)

### Edge function (read-only aggregator)
`supabase/functions/admin-users-directory/index.ts`
- Auth: `requireAdmin` (same helper as `admin-flagged-users`).
- `GET` query params: `q`, `role` (`all|buyer|seller|business|admin`), `status` (`all|active|flagged|suspended|pending|under_investigation`), `verification` (`all|fully|id|phone|email|none`), `range` (`all|7d|30d|90d`), `sort` (`recent|name|transactions|disputes`), `page`, `page_size` (default 20).
- Returns:
  ```ts
  {
    summary: {
      total_users, verified_users, verification_rate,
      flagged_users, new_this_week, id_verified, email_verified,
      deltas: { total, verified, flagged, new_week, id, email }
    },
    rows: UserDirectoryRow[],   // user + contact + roles + verification + tx_count/volume + dispute_count + status + joined
    total, page, page_size
  }
  ```
- Aggregates from `profiles` + `auth.users` (service role, masked email/phone), `user_roles`, `identity_submissions` (latest per user), `transactions` (count + volume as buyer/seller), `disputes` (active count), `admin_actions` (latest flag/suspend), `profiles.is_suspended` and existing flagged-engine status mapping.
- Reuses helpers from `_shared/flagged-users-engine.ts` (status derivation, masking).

`supabase/functions/admin-users-directory-export/index.ts` — CSV mirror with same filters.

`supabase/functions/admin-user-detail/index.ts` — single-user lookup powering the drawer: profile, contact, roles, verification breakdown, transaction stats (last 5 tx codes), dispute summary, admin_actions timeline, current flag/suspension status.

Register all three in `supabase/config.toml`.

### Service layer
`src/services/admin-users-directory.service.ts`
- `fetchUsersDirectory(query)`, `exportUsersDirectory(query)`, `fetchUserDirectoryDetail(userId)`.
- Reuses `AdminAccessRequiredError`. UI never imports `supabase` directly (project rule).
- Exports `UserDirectoryRow`, `UserDirectoryQuery`, `UserDirectoryDetail`, `UserDirectorySummary` types.

### Page
`src/pages/AdminUsers.tsx`
- Wrapped in `<AdminLayout title="User Directory" subtitle="Search and manage all platform users" hideDefaultHeaders fullBleed>` matching the AdminFlaggedUsers pattern (slot-based header + mobile top bar).
- URL search params for `q`, `role`, `status`, `verification`, `range`, `sort`, `page`, `u` (drawer).
- `useQuery(['admin-users-directory', query])`, 30s stale, 60s refetch.
- Loading skeletons (6 stat cards + table), empty/error/403 states.

### Route
Add to `src/App.tsx`:
```tsx
import AdminUsers from "./pages/AdminUsers";
<Route path="/admin/users" element={<AdminUsers />} />
```
And add `/admin/users` to `BUILT_ROUTES` in `src/components/admin/useAdminNav.ts`.

### Components (`src/components/admin/users/`)
Visual fidelity is 1:1 with the HTML; only the sidebar/header chrome is dropped because `AdminLayout` already supplies it.
- `UsersHeaderBar.tsx` — Live chip, total-users chip, Export Users + Add User buttons. Slotted into `headerSlot`. ("Add User" stays present but opens a "Coming soon" toast since user creation is not in scope.)
- `UsersMobileTopBar.tsx` — mobile sticky header.
- `UsersSummaryCards.tsx` — desktop 6-card grid (Total, Verified, Flagged, New This Week, ID Verified, Email Verified) with deltas, exact colour mapping from HTML.
- `UsersMobileStatsScroll.tsx` — horizontal snap scroller of the same 6 stats.
- `UsersFilters.tsx` — desktop filter card (search + role + status + verification + range + sort + Apply/Reset).
- `UsersMobileSearchBar.tsx` + `UsersAdvancedFiltersSheet.tsx` — mobile.
- `UsersTable.tsx` — desktop table (User cell with avatar/name/badges/handle/sub-status; Contact; Roles chips; Verification badge + email/phone/id chiclets; Transactions cell with count + volume; Disputes cell with active count; Status pill; Joined date + relative; Actions row: Profile, Transactions, Disputes (badge), Investigation/Flag toggle, Impersonate (placeholder), Flag/Unflag, Export). Row-border tint mirrors HTML.
- `UsersCardsMobileFeed.tsx` — mobile cards mirroring desktop row.
- `UsersExportButton.tsx` — calls `exportUsersDirectory(query)`.
- `UserDetailDrawer.tsx` — opens from row (sets `?u=<id>`) and shows profile + roles + verification breakdown + tx/dispute summary + admin_action timeline + actions (Suspend, Clear Flag, Flag for Review, Open in Flagged Users, View Transactions, View Disputes). Reuses `performFlaggedAction` for Suspend/Clear/Flag so behaviour matches the fraud workspace.
- `UsersEmptyState.tsx`, `UsersErrorState.tsx`.

### Visual rules
- Tailwind colour classes preserved from HTML (`text-red-400`, `text-emerald-400`, etc.).
- FontAwesome → lucide-react (`Flag, AlertTriangle, Shield, ShieldCheck, IdCard, Mail, Phone, UserCheck, UserPlus, Star, Clock, Search, Download, UserSecret→UserCog, Scale, MoreHorizontal`).
- Desktop `hidden lg:block`, mobile `lg:hidden`.
- No mock numbers — every stat and row from the edge function. `347,892` placeholder is replaced by real `summary.total_users`.

---

## Phase 5b — Wire fraud-review hooks on user surfaces

### From the User Directory
Each row's action cluster wires to real handlers:
- **Profile** → opens `UserDetailDrawer` (`?u=<id>`).
- **Transactions** → `/admin/transactions?user=<id>` (uses existing user filter; add the param wiring if missing).
- **Disputes** → `/admin/disputes?user=<id>`.
- **Open in Flagged Users** → `/admin/flagged-users?u=<id>` (deep-link from Phase 3 already supported).
- **Flag / Unflag** → reuses `performFlaggedAction({ action: "flag_user" | "clear_flag", user_id, note })` via the existing `admin-flagged-users-action` function with mandatory note via `ActionConfirmDialog`.
- **Suspend** → same handler with `action: "suspend_user"`.
- **Export single user** → calls existing user export endpoint or shows "Coming soon" toast if not yet present.

### From AdminTransactionDetail / AdminDisputeDetail
The existing "View Buyer/Seller" `DropdownMenuItem`s already navigate to `/admin/users/:id`. Once the route exists, those start working. We additionally:
- Add `Open Buyer in User Directory` / `Open Seller in User Directory` items that deep-link `/admin/users?u=<id>` to open the drawer immediately. (The Phase 4 "Flag for Fraud" items stay as-is.)
- Confirm the drawer's `flag_user` / `suspend_user` invalidations also invalidate `['admin-flagged-users']` so the Flagged Users page reflects changes.

### Bulk actions (deferred, optional)
Bulk select + bulk suspend/flag is **out of scope for this phase** (the HTML only shows a per-row action set). If wanted later it would reuse `admin-flagged-users-bulk`.

---

## Phase 6 — Polish & Verification (closing checklist)
1. Run `supabase--curl_edge_functions` smoke tests against `admin-users-directory` (auth required, sample query), `admin-user-detail`, and `admin-users-directory-export`.
2. Verify `/admin/users` deep-link from a transaction and a dispute opens the drawer with the right user.
3. Confirm RLS / service-role separation: edge function only — no direct `supabase` client usage in components.
4. Confirm formatting helpers (`formatNGN`, relative dates) match the rest of admin pages.
5. Empty-state, error-state, 403-state, pagination, and URL-param round-trip checks at desktop ≥1024px and mobile <768px.
6. README/changelog entry not required by user.

---

## Files to be created
- `supabase/functions/admin-users-directory/index.ts`
- `supabase/functions/admin-users-directory-export/index.ts`
- `supabase/functions/admin-user-detail/index.ts`
- `src/services/admin-users-directory.service.ts`
- `src/pages/AdminUsers.tsx`
- `src/components/admin/users/UsersHeaderBar.tsx`
- `src/components/admin/users/UsersMobileTopBar.tsx`
- `src/components/admin/users/UsersSummaryCards.tsx`
- `src/components/admin/users/UsersMobileStatsScroll.tsx`
- `src/components/admin/users/UsersFilters.tsx`
- `src/components/admin/users/UsersMobileSearchBar.tsx`
- `src/components/admin/users/UsersAdvancedFiltersSheet.tsx`
- `src/components/admin/users/UsersTable.tsx`
- `src/components/admin/users/UsersCardsMobileFeed.tsx`
- `src/components/admin/users/UsersExportButton.tsx`
- `src/components/admin/users/UserDetailDrawer.tsx`
- `src/components/admin/users/UsersEmptyState.tsx`
- `src/components/admin/users/UsersErrorState.tsx`

## Files to be edited
- `src/App.tsx` — add `/admin/users` route.
- `src/components/admin/useAdminNav.ts` — add `/admin/users` to `BUILT_ROUTES`.
- `supabase/config.toml` — register 3 new functions.
- `src/pages/AdminTransactionDetail.tsx` — add "Open in User Directory" deep-link items.
- `src/pages/AdminDisputeDetail.tsx` — add "Open in User Directory" deep-link items.

## Acceptance
- `/admin/users` renders, admin-gated, visually matches the attached HTML on desktop and mobile.
- All counts, badges, statuses, transactions/disputes columns reflect live DB data.
- Drawer actions (Flag / Suspend / Clear) successfully mutate state and invalidate both `admin-users-directory` and `admin-flagged-users` queries.
- Deep-links from Transactions/Disputes pages open the user drawer or page.
- No UI component imports `supabase` directly.
- Phase 0–5 roadmap is complete after this plan ships.
