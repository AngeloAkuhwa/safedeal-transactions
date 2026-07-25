## Goal

Enforce role-based access control (RBAC) on every admin screen so a signed-in teammate only sees — and can only reach — the routes their role permissions allow. Users without a permission should not see the sidebar entry, cannot deep-link to the URL, and cannot call the backing edge function.

## Current state (verified)

- `src/services/permission-catalog.ts` already defines 14 permission modules and 10 internal roles. `permissionsForRoles()` derives the effective permission set from `role_permissions` (DB truth).
- DB functions `internal_effective_permissions()` and `internal_effective_access_level()` return the effective set server-side.
- `src/components/admin/useAdminNav.ts` gates nav on `BUILT_ROUTES` (existence only) — no permission check.
- `src/components/admin/AdminSidebar.tsx` renders every group unconditionally; no per-item permission filter.
- `src/components/auth/ProtectedRoute.tsx` gates `/admin/*` by the coarse `admin` role (plus the just-added internal fallback) — no per-route permission check.
- Edge functions use `requireAdmin` (accepts any internal role) but do not check per-permission.

So today: once a teammate is inside the admin workspace, every menu item and every route is visible/reachable regardless of role.

## Design

### 1. Route → required-permission map (single source of truth)

Add `src/services/admin-route-permissions.ts` mapping each admin route to the permission that unlocks it:

```
/admin/dashboard             → dashboard.view
/admin/transactions          → transactions.view
/admin/transactions/:id      → transactions.view
/admin/disputes              → disputes.view
/admin/disputes/:id          → disputes.view
/admin/offers                → transactions.view      (offers live under txn ops)
/admin/payouts               → financial_controls.view
/admin/escrow                → escrow.view
/admin/reconciliation        → financial_controls.view
/admin/flagged-users         → flagged_users.view
/admin/users                 → users_and_access.view
/admin/users/:id             → users_and_access.view
/admin/notifications         → platform_configuration.view
/admin/settings              → platform_configuration.configure
/admin/audit-logs            → audit_logs.view
/admin/access-control        → users_and_access.manage_permissions
/admin/permission-matrix     → permissions.view
/admin/access-approvals      → users_and_access.manage_permissions
/admin/task-orchestration    → task_orchestration.view
/admin/agent-performance     → agent_performance.view
```

`super_admin` bypasses all checks (short-circuit).

### 2. Permission context (client-side, server-derived)

Add `src/context/AdminPermissionsContext.tsx`:
- On mount inside `AdminLayout`, call new edge function `admin-me` which returns `{ roles: string[], permissions: string[], access_level }` sourced from `internal_effective_permissions(auth.uid())` — never trust the client.
- Expose `useAdminPermissions()` with `has(key)`, `hasAny(keys[])`, `canVisit(pathname)`, `roles`, `accessLevel`, `loading`.
- Cache per session; refresh on `visibilitychange` after 5 min.

### 3. Sidebar filtering

Update `AdminSidebar.tsx` to filter items via `canVisit(item.href)`. Hide a group entirely if all its items are filtered out. Keep icons/badges unchanged. `useAdminNav.go()` also checks `canVisit` and shows an "Access restricted" toast instead of "Coming soon" when the route exists but the user lacks permission.

### 4. Route-level guard

Introduce `<PermissionRoute permission="…" />` wrapping every admin route in `src/App.tsx`. Behavior:
- `loading` → `<BrandedAuthSplash />`.
- Missing permission → render `<AdminAccessDenied />` (new page: shield icon, "You don't have access to this screen", role name, "Request access" CTA → prefilled `AccessRequestDialog`, "Back to dashboard" link).
- Never redirect to a screen they can't see either — if they lack `dashboard.view`, pick the first `canVisit` route from their sidebar.

### 5. Server-side enforcement (defense in depth)

Extend `supabase/functions/_shared/auth.ts` with `requirePermission(req, key)`:
- Calls `internal_effective_permissions(auth.uid())`.
- Returns 403 `{ error: "permission_denied", required: key }` when missing.
- `super_admin` bypasses.

Wire the required permission into each admin edge function (one-line change per function):
- `admin-dashboard` → `dashboard.view`
- `admin-transactions*` → `transactions.view` (writes → `transactions.update`)
- `admin-disputes*` → `disputes.view` / `disputes.resolve` / `disputes.assign`
- `admin-payouts*`, `admin-escrow*`, `admin-reconciliation*` → `financial_controls.view` / `.approve` / `.configure`
- `admin-flagged-users*` → `flagged_users.view` / `.suspend`
- `admin-user-detail*`, `admin-invite-internal-user`, `admin-delete-internal-user`, `admin-access-control` → `users_and_access.view` / `.manage_permissions`
- `admin-audit-logs*` → `audit_logs.view`
- `admin-settings*` → `platform_configuration.view` / `.configure`
- `admin-notifications*` → `platform_configuration.view`
- `admin-reveal-user-field` → `users_and_access.view` (already gates by role)
- Every `*-export` function → the module's `.export`

Client `.service.ts` files translate a 403 `permission_denied` into a toast + no navigation.

### 6. Access-denied UX

- Deep link to a hidden page → `<AdminAccessDenied>` page (not a redirect loop).
- "Request access" opens the existing `access-change-request` flow with the required permission pre-filled.
- Header quick actions and dashboard KPI cards use `has()` to hide/disable CTAs (Suspend, Freeze, Reveal, Export) — matching existing gating in the drawers.

### 7. Tests

Add `src/__tests__/rbac-route-map.contract.test.ts`:
- Every admin route in `App.tsx` has an entry in the route→permission map.
- Every permission referenced exists in `ALL_PERMISSION_KEYS`.
- `super_admin` seed grants every permission.
- `support_agent` seed does **not** grant `platform_configuration.configure`, `financial_controls.approve`, or `users_and_access.manage_permissions`.

Add `src/__tests__/admin-permission.contract.test.ts` — every admin edge function called without the mapped permission returns 403 `permission_denied`.

## Files touched

New:
- `src/services/admin-route-permissions.ts`
- `src/context/AdminPermissionsContext.tsx`
- `src/components/auth/PermissionRoute.tsx`
- `src/pages/AdminAccessDenied.tsx`
- `supabase/functions/admin-me/index.ts`
- `src/__tests__/rbac-route-map.contract.test.ts`
- `src/__tests__/admin-permission.contract.test.ts`

Modified:
- `supabase/functions/_shared/auth.ts` (`requirePermission`)
- Every `supabase/functions/admin-*/index.ts` (add one `requirePermission` call)
- `src/App.tsx` (wrap each admin route in `PermissionRoute`)
- `src/components/admin/AdminLayout.tsx` (mount provider)
- `src/components/admin/AdminSidebar.tsx` (filter items/groups)
- `src/components/admin/useAdminNav.ts` (permission-aware `go`)
- Admin header/action buttons: use `has()` to hide privileged CTAs.

## Rollout order

1. Add catalog map + context + `admin-me` edge function.
2. Wrap routes with `PermissionRoute`; add `AdminAccessDenied`.
3. Filter sidebar + nav toasts.
4. Add `requirePermission` to `_shared/auth.ts`; wire each admin edge function.
5. Gate in-screen CTAs.
6. Ship contract tests.

## Verification

- Log in as `support_agent`: sidebar shows only Dashboard, Transactions (read), Disputes (read), Users (read), Audit Logs; visiting `/admin/settings` shows Access Denied; `admin-settings` edge function returns 403.
- Log in as `finance_approver`: sees Escrow/Payouts/Reconciliation with approve CTAs; does not see Users & Access or Permission Matrix.
- Log in as `auditor`: sees only read-only screens; every "Export" button hidden if `.export` missing.
- Log in as `super_admin`: sees everything (unchanged from today).
- Legacy consumer `admin` role: treated as `super_admin`-equivalent to avoid breaking the existing owner account.
