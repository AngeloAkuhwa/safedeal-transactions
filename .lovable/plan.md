# Access Control port — remaining gaps

Status: ~85% done. The main screen, service layer, multi-role permissions foundation, drawers, table, filters, and summary cards are wired at `/admin/access-control` under a new "Administration" sidebar group with "Users & Access" + "Audit Logs".

## What's missing vs. the brief

1. **Route alias `/admin/users-access`** — brief allowed reusing existing, but alias should redirect to `/admin/access-control` so any incoming links resolve.
2. **"Permission Matrix" nav item** — brief says keep it under Administration alongside Users & Access and Audit Logs. Currently absent from `AdminSidebar.tsx`.
3. **Named reusable components not yet extracted** (logic exists inline; brief asks for these as dedicated components):
   - `SuspendUserDialog` — today we reuse `ActionConfirmDialog` inline in `AdminAccessControl.tsx`. Extract a thin wrapper.
   - `AccessHistoryTimeline` — timeline inside `UserDetailsDrawer` is inline; extract.
   - `EmptyState`, `ErrorState`, `LoadingSkeleton` for the access-control surface — currently ad-hoc skeleton in page; no empty/error components.
   - `RoleBadge`, `AccessLevelBadge`, `UserStatusBadge` — exist in `badges.tsx` as `RoleBadge` / `AccessLevelPill` / `StatusBadge`; rename/export aliases so names match the brief.
4. **Admin footer** (from earlier turn's screenshot request) — `AdminFooter` component with © + Privacy/Terms/Support links, mounted in `AdminLayout`. Not yet created.
5. **Permission Matrix page stub** — minimal read-only matrix view at `/admin/permission-matrix` driven by `permission-catalog.ts` (roles × modules/actions), so the nav item resolves instead of showing "Coming soon".

## Plan

1. Add route `/admin/users-access` → `<Navigate to="/admin/access-control" replace />` in `src/App.tsx`.
2. Add "Permission Matrix" entry to the Administration group in `AdminSidebar.tsx`; whitelist `/admin/permission-matrix` in `useAdminNav.ts`.
3. Create `src/pages/AdminPermissionMatrix.tsx` — table of roles × permissions from `permission-catalog.ts` with check/dot cells; register route in `App.tsx`.
4. Extract components under `src/components/admin/access-control/`:
   - `SuspendUserDialog.tsx` (wraps `ActionConfirmDialog`)
   - `AccessHistoryTimeline.tsx` (moved from `UserDetailsDrawer`)
   - `EmptyState.tsx`, `ErrorState.tsx`, `LoadingSkeleton.tsx`
   - Re-export `RoleBadge`, `AccessLevelBadge` (alias of `AccessLevelPill`), `UserStatusBadge` (alias of `StatusBadge`) from `badges.tsx`.
5. Update `AdminAccessControl.tsx` to use the new `SuspendUserDialog`, `LoadingSkeleton`, and to render `EmptyState` when `rows.length === 0` and `ErrorState` when the query errors.
6. Create `src/components/admin/AdminFooter.tsx` (© 2024 SafeDeal Admin Portal · Privacy Policy · Terms of Service · Support) and mount it inside `AdminLayout` beneath `<main>`.
7. Typecheck.

## Technical notes

- The Permission Matrix page is read-only; editing role→permission mappings can come later — the brief only requires the nav slot exists under Administration.
- No database changes in this pass; the role/permission foundation from the prior turn is sufficient.
- All new components stay within the existing dark semantic tokens (no hardcoded colors).
