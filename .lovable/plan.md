
## Honest audit vs the spec

**Not done 100%.** Current `AddUserDrawer.tsx` (90 lines) and `UserDetailsDrawer.tsx` (130 lines) cover only a small subset.

### Add User drawer — missing
Today: Full name, Work email, Roles + primary, Department (free text, optional), Require 2FA.

Missing: First/Last name split, Employee ID, Team, Job title, Reporting manager, Access-expiry date, Reason for access, "Send invitation immediately" toggle, email format + duplicate check, role summary panel (description / derived access level / modules / important perms / restricted perms / approval-required flag), "Save as Pending" secondary CTA, pending-access-request creation for privileged roles.

Plus this turn's asks: Department must be a **required dropdown**; show the assigned role's reporting chain hint; Employee ID must be **auto-generated read-only**.

### User Details drawer — missing
Today: single scroll view with roles, access, status, 2FA, permissions list, access history, 4 footer actions.

Missing: tabbed layout (Overview / Role & Access / Assigned Work / Activity / Access History); Overview fields (employee ID, department, team, job title, reporting manager, created date, invitation status); Role & Access breakdown of overrides / temporary permissions / expiry / pending requests; Assigned Work tab; Activity tab (sign-ins + admin actions, no sensitive data); Access History extra columns (prev/new value, reason, approval status, approver, audit ref); Deactivate + Resend Invitation actions; permission-gated action visibility.

---

## Plan

### 1. Departments as a managed list
- `src/services/departments.catalog.ts`: typed enum — `Trust & Safety`, `Disputes`, `Finance`, `Compliance`, `Identity Verification`, `Support`, `Engineering`, `Executive`, `Other`.
- Extend `InviteUserInput` / `InternalUser` in `admin-access-control.service.ts` with: `first_name`, `last_name`, `employee_id` (read-only, server-assigned), `department` (required enum), `team`, `job_title`, `reporting_manager_id`, `access_expires_at`, `reason`, plus overrides/temporary permission arrays, `invitation_status`, `created_at`.

### 2. Server-side Employee ID generation
Migration on `public.internal_users`:
- Add columns for the new profile fields (nullable except `department`).
- Add `employee_id text` with `UNIQUE` constraint.
- Create SQL function `public.generate_employee_id()` returning `SD-EMP-<YYYY>-<6-char Crockford base32>` (alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ` — no I/L/O/U to avoid look-alikes). Uses `gen_random_bytes(4)` seed, loops up to 5 times on `UNIQUE` collision, raises after that.
- Set column `DEFAULT public.generate_employee_id()` and backfill existing rows in the same migration.
- Add a `BEFORE UPDATE` trigger that blocks changes to `employee_id` for every role (including `service_role` unless a `set_config('app.allow_employee_id_change', 'true', true)` guard is set — reserved for future access-change-request flow).
- GRANTs preserved; RLS unchanged.

### 3. Rebuild `AddUserDrawer`
Sectioned layout:
- **Identity**: First name, Last name, Work email (regex + async duplicate check against `internal_users.email`), **Employee ID as read-only Input** with placeholder `"Auto-generated on invite"` and helper text `"Assigned by the system — cannot be edited."` The real value appears in the success toast and the User Details drawer after creation.
- **Placement**: Department (required shadcn `Select` from catalog — no free text), Team, Job title, Reporting manager (`Select` populated from `fetchInternalUsers({status: 'active'})`, filtered to admin-tier roles). A tiny helper line under the primary-role picker shows `"Reports to: <manager full_name> · <manager primary_role>"`.
- **Access**: existing `RolePicker` + Access-expiry date (`input type=date`) + Reason (`Textarea`, required when a privileged role is selected).
- **Role summary card**: description, derived access level via `deriveAccessLevel`, module list, key allowed permissions, notable restricted permissions, `requiresApproval` badge for `full`/`high` levels.
- **Delivery**: "Send invitation immediately" `Switch`. Primary CTA label toggles: `Send invitation` (on) / `Save as pending` (off).
- Privileged roles → `createAccessChangeRequest` inserts into `access_change_requests` (status `pending`), and the user is created in `pending_approval` instead of `invited`/`active`.

### 4. Rebuild `UserDetailsDrawer` with 5 tabs
- **Overview**: profile header + Employee ID (mono, copy-to-clipboard), Email, Department, Team, Job title, Reporting manager (linked), Status, Last active, Created date, Invitation status.
- **Role & Access**: primary role, all roles, derived access level, role-based permission chips, overrides split into `Granted` / `Revoked`, temporary permissions with expiry countdowns, pending requests from `access_change_requests`.
- **Assigned Work**: `fetchAssignedWorkSummary(userId)` → `{ active_disputes, open_tasks }` from `disputes.assigned_to`; "Open in Task Orchestration →" link placeholder.
- **Activity**: last 10 `user_sessions` (device, masked IP, timestamp) + last 10 `audit_logs` where `actor_user_id = user`; strip token/OTP/password fields.
- **Access History**: expanded `AccessHistoryTimeline` columns — Date, Action, Prev value, New value, Actor, Reason, Approval status, Approver, Audit ref (link `/admin/audit-logs?event=<id>`).

### 5. Permission-gated actions
Hide (not disable) footer actions based on `internal_effective_permissions`:
- Change Role → `users_and_access.change_role`
- Review Permissions → `permission_management.edit`
- Suspend / Reactivate → `users_and_access.suspend`
- Deactivate → `users_and_access.deactivate`
- Resend Invitation → `users_and_access.invite` AND target status `invited`

### 6. Wire mutations in `AdminAccessControl.tsx`
Add `deactivateUser` and `resendInvitation` mutations; each writes an `audit_logs` row (`admin_internal_note` action, JSONB before/after). Toast success/error.

### 7. Tests
- Extend `src/lib/__tests__/access-level.test.ts` — privileged invite → `pending_approval`.
- New `src/lib/__tests__/invite-validation.test.ts` — email format, required department, duplicate email.
- New `src/lib/__tests__/employee-id-format.test.ts` — asserts regex `^SD-EMP-\d{4}-[0-9A-HJKMNP-TV-Z]{6}$`.

### Files
```
add    src/services/departments.catalog.ts
add    src/services/assigned-work.service.ts
add    src/components/admin/access-control/RoleSummaryCard.tsx
add    src/components/admin/access-control/tabs/{Overview,RoleAccess,AssignedWork,Activity,AccessHistoryTab}.tsx
edit   src/components/admin/access-control/AddUserDrawer.tsx        (full rewrite)
edit   src/components/admin/access-control/UserDetailsDrawer.tsx    (full rewrite → tabs)
edit   src/components/admin/access-control/AccessHistoryTimeline.tsx (extended columns)
edit   src/services/admin-access-control.service.ts                 (types, dup-check, access-request, resend, deactivate)
edit   src/pages/AdminAccessControl.tsx                              (new mutations + permission gating)
migr   supabase/migrations/<ts>_internal_users_profile_fields.sql   (columns + employee_id + generate_employee_id() + immutability trigger)
test   src/lib/__tests__/access-level.test.ts (extend)
test   src/lib/__tests__/invite-validation.test.ts (new)
test   src/lib/__tests__/employee-id-format.test.ts (new)
```

### Technical notes
- Employee ID is **never** generated or editable in the browser; the column default + immutability trigger enforce this even against direct DB writes.
- Migration touches only `public.internal_users` plus one helper function/trigger. No auth/storage schema changes.
- Reporting-manager dropdown reuses existing paginated `fetchInternalUsers` service, filtered client-side to admin-tier roles.
- All new selects use shadcn `Select`; dates use native `input type=date`.
