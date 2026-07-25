# Fix plan: blank screen after support agent login

## Confirmed current state
- The invited user is recognized as an internal teammate: `has_any_internal_role` returned `true` for the logged-in user.
- The blank screen is happening while loading `/admin/dashboard`.
- The `admin-me` permissions call fails with `Failed to fetch`, so the frontend permissions provider never receives role/permission data.
- `ProtectedRoute` still wraps admin routes with `requireRole="admin"`; for internal users without the legacy consumer `admin` role, it redirects them back to `/admin/dashboard`, which can create a same-route loop/blank state.

## What I will fix

### 1. Stop the admin route redirect loop
Update `ProtectedRoute` so internal teammates are accepted when they are already trying to access an `/admin/*` route.

Behavior after fix:
- Internal user on `/admin/dashboard` → allowed through.
- Internal user on buyer/seller-only routes → redirected to `/admin/dashboard`.
- Consumer buyer/seller users remain blocked from admin routes.
- Legacy platform admin still works as before.

### 2. Make admin permission loading resilient
Update `AdminPermissionsProvider` so a failed `admin-me` call does not leave the page looking blank.

Behavior after fix:
- If permissions load successfully, route-level RBAC works normally.
- If `admin-me` fails, the user sees a clear access/loading error screen instead of a blank page.
- Add a retry path so the user can refresh permissions without logging out.

### 3. Fix the `admin-me` edge function fetch failure path
Inspect/deploy the `admin-me` function behavior so it always returns a valid CORS response for:
- OPTIONS preflight
- unauthenticated session
- internal user without consumer admin role
- permission/RPC failures

If the function is not deployed or has a runtime/import issue, redeploy it with the corrected shared auth imports.

### 4. Verify dashboard permission for support agents
Check that the support-agent role actually has `dashboard.view` or the intended dashboard-level permission.

If missing, update the role-permission seed/data so support agents can land on the admin dashboard while still only seeing the screens their role can access.

### 5. Validate the actual login flow
Test the invited support-agent path end-to-end:
- Login/accept invite as the support agent.
- Land directly on `/admin/dashboard`.
- Confirm no blank screen.
- Confirm sidebar only shows permitted admin screens.
- Confirm restricted routes show Access Denied instead of blank content.

## Expected result
After implementation, `angeloakuhwa@gmail.com` and other invited internal users will load the admin dashboard normally, with RBAC still enforced per role across the admin portal.