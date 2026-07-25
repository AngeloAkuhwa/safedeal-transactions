## Finish access-control workflows: Change Role, Review Permissions, Suspend User

Scope: rewrite the three drawers so they behave like the spec. Also add the two test files that were skipped in the earlier plan. No new DB columns are added for temporary access / session revoke / task reassignment — those write into existing tables (`user_permission_overrides`, `access_change_requests`, `user_sessions`, `disputes`) and audit into `audit_logs`.

### 1. Change Role drawer — full rewrite

File: `src/components/admin/access-control/ChangeRoleDrawer.tsx`

Layout (right-side `Sheet`, `sm:max-w-[900px]`, sticky header/footer, two-column body):

Left column — form
- **Current role** row: primary role name, all roles as small chips, derived access level pill (read-only).
- **New role** row: reuse `RolePicker` for multi-role selection + primary star.
- **New derived access level**: pill (`deriveAccessLevel(newBasePerms, newRoles)`) with delta hint `Standard → High` when it changes.
- **Effective date**: shadcn `Popover` + `Calendar` (defaults to today; not before today).
- **Optional expiry date**: same picker, cleared by default; must be after effective date. Populated expiry auto-creates a temporary role assignment.
- **Reason for change**: `Textarea` — required, min 12 chars.

Right column — permission-difference preview (sticky)
Compute `newBasePerms` via new helper `permissionsForRoles(roles: InternalRoleKey[])` in `permission-catalog.ts` (union of role→permission map already used server-side; if not in FE, add a static map mirroring the seed migration). Diff against `user.base_permissions`.
- **Permissions added** (green `Plus` icon, module-grouped, capped 8 + "+N more").
- **Permissions removed** (rose `Minus` icon, same treatment).
- **Privileged permissions introduced**: subset of added that are in the existing `HIGH_PERMISSIONS` set or actions `approve` / `manage_permissions` / `configure` / `suspend`. Amber `ShieldAlert`.
- **Modules that will become unavailable**: modules present in old base perms but absent from new. Rose `EyeOff`.

Approval routing
- `requiresApproval = any new role isProtectedRole || newLevel ∈ {full, high} || privilegedIntroduced.length > 0`.
- Primary CTA label & behavior:
  - `requiresApproval === true` → **Submit for Approval** → calls new `submitRoleChangeRequest(user, next, reason, effective, expires)` which INSERTs into `access_change_requests` (`kind = 'role_change'`, `payload = { roles, primary, effective_at, expires_at }`, status `pending`) and writes an `audit_logs` row (`admin_internal_note`, `metadata.reason`).
  - Otherwise → **Apply immediately** → existing `updateUserRoles()` path, with `audit_logs` before/after diff.
- Secondary CTA: **Cancel**.

Guardrails
- `validateRoleSet(newRoles)` inline error under the picker.
- Effective/expiry date validation inline.
- Submit disabled until reason valid, roles valid, and at least one difference exists.

### 2. Review Permissions drawer — full rewrite

File: `src/components/admin/access-control/ReviewPermissionsDrawer.tsx`

Right-side `Sheet` (`sm:max-w-[900px]`), read-first with a nested request flow.

Sections (each in its own bordered card):

1. **Permissions inherited from role** — read-only, module-grouped chips derived from `user.base_permissions`. Small "From: <primary role>" caption per module.
2. **Individual permission overrides** — read from `user_permission_overrides` where `expires_at IS NULL`. Split into **Granted** (green) and **Revoked** (rose). Each row shows key, granted-by/actor name, granted-at date, and a small `X` to request removal (opens the request flow, does not mutate directly).
3. **Temporary access** — same table, rows where `expires_at IS NOT NULL AND expires_at > now()`. Countdown badge (e.g. `expires in 3d`). Rose when expired.
4. **Restricted permissions** — high-signal actions the user does NOT have (`manage_permissions`, `configure`, `approve`, `suspend`). Muted rose `Ban` icon, module-grouped, capped 10.
5. **Pending changes** — rows from `access_change_requests` for this user where `status='pending'`. Show kind (`role_change` / `override_add` / `override_remove`), requested-by, created-at, and a `View` link to the future approvals screen.

Request flow (NOT edit the role template)
- Footer button: **Request individual override** — opens a nested `Dialog` with:
  - Radio: `Grant` / `Revoke`
  - Permission key `Select` (grouped by module, hides ones already matching that side)
  - Optional expiry date (shadcn calendar)
  - Reason (required, min 12 chars)
  - Submit → INSERT into `access_change_requests` (`kind = 'override_add'` or `'override_remove'`, `payload = { permission_key, expires_at }`, `status = 'pending'`).
- Toast on success; refetch pending list.

Footer deep-links (always visible)
- **Open Permission Matrix** → `/admin/permissions`
- **View Pending Approvals** → `/admin/access-approvals` (new route stub if missing — see §6)
- **View Audit History** → `/admin/audit-logs?actor_or_target=<user.id>` (uses existing filter param).

### 3. Suspend User dialog — full rewrite

File: `src/components/admin/access-control/SuspendUserDialog.tsx` (drop the wrapper over `ActionConfirmDialog`; build first-class `Dialog`).

Fields
- **User identity** header: avatar, full name, primary role, employee ID.
- **Suspension reason** — `Textarea`, required, min 12 chars.
- **Duration** — radio group:
  - `Indefinite`
  - `Until` + shadcn `Popover` date picker (min today+1).
- **Revoke active sessions** — `Switch` (default on). Shows active session count from `user_sessions` where `expires_at > now()`.
- **Reassign active tasks** — `Switch` (default on when count > 0). Shows count of `disputes` where `assigned_to = user.id AND status IN ('open','under_review','seller_response_pending')`.
- **Reassignment target** — visible only when reassign is on. `Select` of active users with `dispute_agent` or `dispute_manager` role, excluding the target user. Required when reassign is on.
- **Summary of consequences** — bulleted read-only block that reflects the current form state:
  - "Cannot sign in from any device"
  - "Active sessions will be revoked (N)" / "Active sessions preserved"
  - "Will not receive new task assignments"
  - "N active tasks will be reassigned to <name>" / "N active tasks stay assigned (will be flagged)"
  - "Historical records and audit history remain intact"
- **Explicit confirmation** — required `Checkbox`: "I understand this will immediately suspend <name>."

Actions
- Primary: **Suspend user** (danger button), disabled until reason valid, target chosen if reassigning, checkbox ticked.
- Secondary: **Cancel**.

Behavior (all via a new service action `suspendUserAtomic()` in `admin-access-control.service.ts`)
1. `UPDATE internal_users SET status='suspended', suspension_reason, suspension_expires_at`.
2. If `revoke_sessions` — `DELETE FROM user_sessions WHERE user_id = X` (or `UPDATE ... SET revoked_at = now()` if that column exists — verify at runtime).
3. If `reassign_tasks` — `UPDATE disputes SET assigned_to = <target> WHERE assigned_to = X AND status IN (...)` and write `admin_actions` rows (`reassign_case`) for each moved item.
4. `audit_logs` row: `action='profile_suspend'`, `metadata = { reason, duration, revoked_sessions, reassigned_count, target_id }`.

Reactivate & Deactivate — separate flows
- **Reactivate**: new `ReactivateUserDialog.tsx` (light `Dialog`, single required reason field, single confirm). Wired from row-menu — no shared modal with Suspend.
- **Deactivate**: existing `ActionConfirmDialog` usage in `AdminAccessControl.tsx` stays as its own confirmation. Copy already differs. No hard-delete option is exposed anywhere.

### 4. Wiring in `AdminAccessControl.tsx`

- New mutations: `submitRoleChangeRequest`, `applyRoleChange` (rename existing), `requestPermissionOverride`, `suspendUserAtomic`, `reactivateUser`.
- Row menu already opens Change Role, Review Permissions, Suspend/Reactivate — repoint handlers to the new drawer contracts.
- Toast + query invalidations (`internal-users-directory`, `access-summary`, `internal-user-detail`).

### 5. Permission catalog helper

File: `src/services/permission-catalog.ts` — add `ROLE_PERMISSIONS: Record<InternalRoleKey, string[]>` mirroring the seed, plus `permissionsForRoles(roles)`. Used by the Change Role diff. Marked "keep in sync with `internal_role_permissions` seed" comment.

### 6. Route stubs

- Confirm `/admin/permissions` exists; if the deep-link would 404, ship a lightweight `AdminPermissionMatrix.tsx` placeholder ("Coming soon") gated in `useAdminNav.ts`. Already implemented — verify only.
- `/admin/access-approvals` — add allow-listed route in `useAdminNav.ts` and a minimal page listing `access_change_requests` with status filter. Full workflow can come later; deep-link must not 404.

### 7. Tests (skipped earlier — add now)

- `src/lib/__tests__/invite-validation.test.ts` — asserts email regex, required department, duplicate email detection using `validateInviteInput` + mocked `checkEmailAvailability`.
- `src/lib/__tests__/employee-id-format.test.ts` — pure regex assertions against `^SD-EMP-\d{4}-[0-9A-HJKMNP-TV-Z]{6}$` (no DB call).
- Extend `access-level.test.ts` if Change Role diff logic needs coverage (single unit case: privileged role added → `requiresApproval === true`).

### Files
```
edit   src/components/admin/access-control/ChangeRoleDrawer.tsx        (full rewrite, ~350 lines)
edit   src/components/admin/access-control/ReviewPermissionsDrawer.tsx (full rewrite, ~380 lines)
edit   src/components/admin/access-control/SuspendUserDialog.tsx       (full rewrite, ~300 lines)
add    src/components/admin/access-control/ReactivateUserDialog.tsx
edit   src/services/admin-access-control.service.ts                    (submitRoleChangeRequest, requestPermissionOverride, suspendUserAtomic, reactivateUser, temp-perm + pending queries)
edit   src/services/permission-catalog.ts                              (ROLE_PERMISSIONS map + permissionsForRoles)
edit   src/pages/AdminAccessControl.tsx                                (new mutations + wiring)
add    src/pages/AdminAccessApprovals.tsx                              (minimal list; prevents deep-link 404)
edit   src/components/admin/useAdminNav.ts                             (allow-list new route)
add    src/lib/__tests__/invite-validation.test.ts
add    src/lib/__tests__/employee-id-format.test.ts
```

### Technical notes
- No new DB migrations required. Reuses `access_change_requests`, `user_permission_overrides`, `user_sessions`, `disputes.assigned_to`, `admin_actions`, `audit_logs`.
- Approval routing is server-agnostic on the FE: privileged transitions insert a pending request rather than mutating roles/permissions directly.
- Session revoke path uses `DELETE FROM user_sessions` if `revoked_at` column doesn't exist — verified at implementation time via `supabase--read_query`.
- Dates use shadcn `Calendar` inside `Popover` per the datepicker guideline (`pointer-events-auto`).
