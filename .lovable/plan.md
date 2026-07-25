## Goal

Port the supplied "Access Control Management" HTML into SafeDeal as a fully integrated admin screen at `/admin/access-control` (route already reserved in the sidebar), reusing the existing `AdminLayout`, sidebar and design tokens. No horizontal nav, no duplicated shell.

## Sidebar / navigation changes (`src/components/admin/AdminSidebar.tsx` + `useAdminNav.ts`)

- Add a new nav group **Administration** placed above the existing "Settings" group. It will contain:
  - **Users & Access** → `/admin/access-control` (icon: `KeyRound`) — the new screen.
  - **Permission Matrix** → `/admin/permission-matrix` (icon: `ShieldCheck`) — remains "Coming soon".
  - **Audit Logs** → `/admin/audit-logs` (icon: `ScrollText`) — moved out of "Settings".
- Remove the duplicate "Access Control" and "Audit Logs" entries from the current "Settings" group so nothing is listed twice.
- Add `/admin/access-control` to `BUILT_ROUTES` in `useAdminNav.ts` so the item is enabled.

## Route

- Register `/admin/access-control` in `src/App.tsx` as a protected admin route rendering the new page component. No new equivalent route exists, so this is the canonical path (the sidebar already links to it today as "Coming soon").

## New files

Page:
- `src/pages/AdminAccessControl.tsx` — wraps `AdminLayout` (title "Access & Role Management", subtitle "Internal user permissions and access control"), owns query state, orchestrates the drawers/dialogs. No hardcoded user rows in the page.

Feature components under `src/components/admin/access-control/`:
- `AccessSummaryCards.tsx` — the 4 KPI cards (Active Admins, Active Agents, Suspended Users, Full Access Users) with delta chips and the red "Critical" ring on Full Access, matching the reference. Reuses the dashboard `KpiCard` sizing tokens.
- `UserAccessFilters.tsx` — filter pill row (All Users / Admins / Agents / Suspended / Critical Access) + search input + primary "Add User" button. Emits typed filter changes.
- `InternalUsersTable.tsx` — desktop table (columns: User, Email, Role, Access Level, Status, Last Active, Actions) with left-border accent per access tier (critical/elevated/high/suspended shadows via semantic classes added to `index.css`). Row actions: change role, review permissions, suspend/reactivate, more-menu (view details, reset password, view history, remove).
- `InternalUsersMobileFeed.tsx` — card list for `< lg`, mirroring the row info stacked.
- `RoleBadge.tsx`, `AccessLevelBadge.tsx`, `UserStatusBadge.tsx` — badge primitives with variants (Super Admin, Admin, Senior Agent, Agent / Full, High, Standard, Limited / Active, Suspended, Pending). Colors via design tokens (blue/purple/emerald/amber/red).
- `UserDetailsDrawer.tsx` — right-side drawer showing profile, current role & access, recent actions, quick action buttons (Change Role, Review Permissions, Suspend, Reset MFA).
- `AddUserDrawer.tsx` — form drawer (name, email, role, access level, notes). Submit wired to a placeholder service call.
- `ChangeRoleDrawer.tsx` — role + reason form.
- `ReviewPermissionsDrawer.tsx` — grouped permission toggles (read from a static permissions catalog for now).
- `SuspendUserDialog.tsx` — confirmation dialog reusing `ActionConfirmDialog` pattern (reason required).
- `AccessHistoryTimeline.tsx` — vertical timeline used inside `UserDetailsDrawer`.
- `EmptyState.tsx`, `ErrorState.tsx`, `LoadingSkeleton.tsx` — screen-level states (table + KPI skeletons).

Service / data layer:
- `src/services/admin-access-control.service.ts` — typed models (`InternalUser`, `AccessLevel`, `InternalRole`, `AccessSummary`, `AccessHistoryEntry`, `AccessQuery`, `AccessResponse`) and functions:
  - `fetchAccessSummary()`
  - `fetchInternalUsers(query)`
  - `fetchInternalUserDetail(id)`
  - `createInternalUser(input)`
  - `changeInternalUserRole(id, input)`
  - `updateInternalUserPermissions(id, input)`
  - `suspendInternalUser(id, reason)` / `reactivateInternalUser(id, reason)`
  - `fetchAccessHistory(id)`
  Each function follows the existing pattern (edge-function `fetch` with `authHeaders()`, mirrors `admin-users-directory.service.ts`). Until a backend exists, functions call a stub `admin-access-control` endpoint; the UI is fully data-driven via TanStack Query and will light up when the edge function is added in a later step. No mock data lives inside components.

## Design system additions

- Add semantic access-ring utilities to `src/index.css` (`.access-ring-critical`, `.access-ring-elevated`, `.access-ring-high`, `.access-row-suspended`) that map to the reference shadows using HSL tokens — no raw hex in components.
- Use existing shadcn `Button`, `Input`, `Sheet`, `Dialog`, `Badge`, `Avatar`, `DropdownMenu` primitives.
- Icons come from `lucide-react` (no Font Awesome). Map: `ShieldAlert`, `Users`, `UserX`, `AlertTriangle`, `KeyRound`, `UserPlus`, `MoreHorizontal`, `RefreshCcw`, `ArrowLeftRight`.

## Responsive behavior

- `lg+`: sidebar + desktop table + horizontal KPI grid (4 cols).
- `md`: 2-col KPI grid, table becomes horizontally scrollable inside the card.
- `sm`: KPI horizontal scroll (reuse `UsersMobileStatsScroll` pattern), `InternalUsersMobileFeed` cards, filters collapse into a sheet-triggered advanced filter (reuse the pattern from `UsersAdvancedFiltersSheet`).

## Wiring — every CTA has a handler stub

- Filter pills → update `AccessQuery.segment` and refetch.
- Search → debounced update to `q`.
- Add User → opens `AddUserDrawer`; submit calls `createInternalUser` and invalidates queries.
- Row "change role" icon → opens `ChangeRoleDrawer`.
- Row "key" icon → opens `ReviewPermissionsDrawer`.
- Row "suspend/unsuspend" icon → opens `SuspendUserDialog`.
- Row overflow menu → View Details (drawer), Reset MFA, Copy Email, View Access History.
- Clicking row body → opens `UserDetailsDrawer`.
- All mutations show toasts and invalidate `["admin-access-control", ...]` queries.

## What is explicitly NOT in this batch

- No backend edge function implementation; the service layer is created with typed contracts and query keys but a follow-up will implement `admin-access-control` and RLS.
- No real permissions model migration.
- Impersonation stays a separate feature.

## Acceptance

- `/admin/access-control` renders inside the standard SafeDeal admin shell with the SafeDeal sidebar (no top nav).
- KPI cards, filter row, and table visually match the reference at desktop widths using semantic tokens.
- Sidebar shows a new **Administration** group with Users & Access (active), Permission Matrix, Audit Logs — no duplicates elsewhere.
- Every button/row action opens the correct drawer/dialog or calls the correct service function.
- No user records are hardcoded inside the page component.
