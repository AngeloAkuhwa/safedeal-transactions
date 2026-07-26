## What's already landed (from the previous turn)

- `QuickActionsMenu` mounted next to the Environment switcher on `/admin/permission-matrix` with 5 gated actions (Reset · Export · History · Alerts · Suspend).
- Sidebar: new **Access Approvals**, **Task Orchestration**, **Agent Performance** entries under Administration + pending-approvals badge via `usePendingApprovalsBadge` (RPC `count_pending_approvals_for_actor`, realtime + 60s poll).
- Migration shipped: `permissions.assignable`, index on `permission_change_sets(status, environment)`, the SECURITY DEFINER counter RPC.
- Export dialog writes an `admin_actions` receipt (`action_type='export'`, `resource='permission_matrix'`).

## Gaps this plan closes

### A. Suspend must be a change-set, not a direct write
Current `SuspendPermissionDialog` calls `permissionRepo.updatePermission({ status: 'suspended' })`. Spec requires:
- Flip `permissions.assignable = false` (not `status`) so existing grants remain.
- Route through `apply_permission_change_set` with `requires_approval = true` unconditionally + 20-char reason.
- Filter non-assignable permissions out of `CreateOverrideDrawer` and the matrix "grant" picker.
- Un-suspend uses the same flow (toggle to `assignable = true`).
- Add repo method `submitAssignabilityChange(key, assignable, reason)` that emits an `admin_actions` row on submit.

### B. Alert Settings — server-backed, not localStorage
Verified: `notification_preferences` has only fixed boolean columns (`payment_updates`, `dispute_updates`, `system_alerts`, …). No free-form key store exists, so the spec's `key = access_control.matrix` cannot land as-written.
- Migration: add nullable JSONB `notification_preferences.matrix_alerts` holding the 4 typed toggles (`critical_permission_changed`, `change_set_rejected_or_failed`, `temporary_access_expiring`, `protected_role_modified`).
- Rewrite `AlertSettingsDrawer` to read/write that column via `notification-preferences.service.ts` (RLS: user can only touch their own row).
- Emit those alerts from `apply_permission_change_set` (grant/revoke of Privileged/Critical; reject/fail terminals; protected-role touch) and from a small cron that scans `user_permission_overrides.expires_at` in the next 72h; fan-out reuses the existing `notifications` + `notification_deliveries` pipeline.

### C. Export moves to an edge function (audit + scale)
`ExportConfigDialog` currently builds the CSV/JSON client-side from the in-memory role map. Replace with:
- `supabase/functions/admin-permission-matrix-export/index.ts` — verify_jwt validation, `requirePermission('permissions.view')`, Zod input (`scope`, `format`, `env`, `filters`), SQL-first snapshot join of `role_permissions ⨝ permissions ⨝ permission_environments`, streams a signed URL back.
- Reuses `admin_export_jobs` (already used for user/tx exports) with resource='permission_matrix'.
- Client polls the job and downloads.

### D. Deep-link plumbing (unverified surfaces — verified during build)
Need to read these files first and add only what's missing:
- `/admin/access-control` — accept `?userId=<id>&tab=role-access` and auto-open that user's drawer. (`?role=` already respected — verified.)
- `/admin/audit-logs` — accept `?ref=<id>&type=change_set|override` as a filter on `admin_actions.resource_id` / metadata.
- `/admin/permission-matrix` — Role Detail user-count chip → `/admin/access-control?role=…`; Overrides row user cell → `/admin/access-control?userId=…`; any audit id chip → `/admin/audit-logs?ref=…`.
- `/admin/access-control` header — add "Open Permission Matrix" button that forwards `role` or `userId`.

### E. Route guards for the two new admin pages
`permissionForPath` already maps `/admin/task-orchestration` → `task_orchestration.view` and `/admin/agent-performance` → `agent_performance.view`, but `App.tsx` may not wrap those Route elements in `PermissionRoute`. Read `App.tsx` and, if unwrapped, wrap them (mirrors the pattern already used for `/admin/permission-matrix`).

### F. `AdminAccessApprovals` — remove shadow list (if any)
Read the page; confirm it reads the same `permission_change_sets` filter used by the matrix's Pending Approvals tab via `fetchPermissionApprovalItems`. If it maintains a local list, delete and reuse.

### G. UX + a11y sweep (targeted, not blanket)
- Sticky permission column + matrix header at `xl↓`: add scroll shadow inside `RoleMatrix` container only.
- Mobile (`<md`) auto-switch to Role Detail — verify the `useIsMobile` gate covers the tab default (already partial).
- Loading skeletons + `EmptyState` retry on Overrides, Templates, Pending, History tables (audit which are missing).
- `PermissionStateCell` — verify all 6 states include a glyph, not colour-only.
- Icon-only buttons in Quick Actions dropdown items already labelled; audit rest of matrix.
- Extend `useDrawerSafety` so focus returns to the launcher after Alert / Export / Suspend / Reset drawers close.

### H. Data integrity + security regression
- Add a Postgres unit test file (`supabase/tests/permission-matrix.sql` via `pg_prove` or a plain psql script) covering:
  - duplicate `(role_key, permission_key, environment)` fails.
  - `apply_permission_change_set` rejects requester = approver.
  - rejects grants outside requester's permissions.
  - rejects removing protected system perms.
  - rejects removing the last active Super Admin.
  - rejects temporary override without `expires_at`.
- RLS regression: unprivileged internal user cannot `UPDATE role_permissions` / `INSERT permission_change_sets` outside scope / `UPDATE user_permission_overrides`.
- Auditor role: assert every mutation edge function returns 403 for them.

### I. Final smoke pass
After D–G land: load `/admin/permission-matrix`, `/admin/access-control`, `/admin/access-approvals`, `/admin/audit-logs`, `/admin/task-orchestration`, `/admin/agent-performance`; capture any console/runtime errors; run the security scanner; fix or acknowledge findings.

## Order of execution

1. Migration (assignability change-set support helper + `matrix_alerts` column).
2. Backend: suspend-as-change-set repo method, alert-prefs service, export edge function.
3. Frontend rewrites: `SuspendPermissionDialog` (change-set path + assignable filter in override picker), `AlertSettingsDrawer` (server-backed), `ExportConfigDialog` (edge-function-backed).
4. Deep links + PermissionRoute wraps + AccessApprovals reuse check.
5. UX / a11y / skeleton pass.
6. SQL + RLS regression tests.
7. Smoke + security scan.

## Explicit unknowns to verify at build time

- Whether `App.tsx` already wraps `/admin/task-orchestration` and `/admin/agent-performance` in `PermissionRoute`.
- Whether `AdminAccessControl` supports `?userId=`.
- Whether `AdminAuditLogs` supports `?ref=` or needs a new filter.
- Whether `AdminAccessApprovals` currently uses `fetchPermissionApprovalItems` or a shadow query.
- Which override/template/pending/history tables are missing skeleton/retry.
- Whether `PermissionStateCell` already renders glyphs for all 6 states.

Each will be resolved by a file read before the corresponding edit.

## Deliberately out of scope

- No new tables. Only the two column additions above.
- No changes to the shared header/nav shell beyond the Access Approvals badge already shipped.
- No template-authoring UI changes.