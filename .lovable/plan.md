
# Permission Matrix — Quick Actions, Connections & Final Review

Goal: turn every remaining decorative control in the Permission Matrix workspace into a real, audited action, wire the matrix into the rest of the admin app through deep links + a pending-approvals nav badge, and pass a full functional / security / UX / data-integrity sweep. All work reuses the existing `permission_change_sets`, `permission_templates`, `user_permission_overrides`, `audit_logs`, and `admin_actions` stores — no new parallel data stores.

## 1. Quick Actions dock (top-right of `/admin/permission-matrix`)

New shared component `QuickActionsMenu` rendered next to the environment switcher. Each action is permission-gated via `useAdminPermissions()` and disabled with tooltip when the current user lacks the capability.

### 1a. Reset to Default
- Reuses existing `ResetRoleToDefaultDialog`, but promoted from Role Detail to global Quick Actions.
- Flow: pick role → load default template (via `permissionRepo.getRoleDefaultTemplate`) → compute grants/revokes vs current effective → render `PermissionDiffTable` with impacted-users count (from `internal_users` + `user_permission_overrides` counts) → 20-char reason → submit as a change-set through `apply_permission_change_set` RPC (routes to approval if `requires_approval`).

### 1b. Export Configuration
- New `exportPermissionMatrix()` service — SQL-first snapshot of `role_permissions` + `permissions` + `permission_environments` for the active environment.
- Options: JSON or CSV; scope = **Filtered view** (respects role/module/state/env filters) or **Full configuration**.
- Columns: `role_key, role_label, permission_key, module, state, environment, source, risk`.
- Guard: only visible when `perms.canExportAccessControl` (new fine-grained perm; falls back to `access_control.export`).
- Every export writes one `admin_actions` row (`action_type = 'export'`, `resource = 'permission_matrix'`, metadata records scope + filters + row count) which surfaces automatically in `/admin/audit-logs` since that page already reads `admin_actions`.

### 1c. View History
- Navigates to `/admin/permission-matrix?tab=history` and forwards the current role / module / permission / user filters as query params (see §2). No new data store.

### 1d. Alert Settings (real, not decorative)
- Opens `AlertSettingsDrawer`. Backed by existing `notification_preferences` scoped to key `access_control.matrix` with typed toggles:
  - `critical_permission_changed`
  - `change_set_rejected_or_failed`
  - `temporary_access_expiring` (default 72h before `expires_at`)
  - `protected_role_modified`
- Wiring: reuse the existing per-alert notification dispatcher used by other admin surfaces (fan-out through `notifications` + `notification_deliveries`). Emit events from the change-set apply RPC and from an expiring-override cron check (already runs for permission overrides — add the alert hook).
- If a toggle is on but the user is not authorised to receive that class of alert, the toggle is disabled with an explanatory tooltip.

### 1e. Suspend Permission Assignment (renamed from "Suspend Permission")
- New dialog: pick a permission key → show:
  - Roles currently granting it (from `role_permissions`).
  - Users currently holding it via override (from `user_permission_overrides` joined with `internal_users`).
- Copy explicitly states: *"Prevents new assignment of this permission. Existing grants remain in place and the underlying product feature stays available."*
- Action creates a change-set of type `suspend_assignment` that sets `permissions.assignable = false` (new boolean column, default `true`). Matrix and CreateOverrideDrawer both filter out non-assignable permissions from the "grant" picker.
- Requires approval (`requires_approval = true` unconditionally) and reason. Full audit trail preserved via change-set + `admin_actions`. Un-suspending follows the same flow.

## 2. Cross-screen connections & deep links

All navigation uses URL params so filters survive refresh/back.

| Source | Click target | Destination | Query params |
|---|---|---|---|
| Role Detail — user count chip | number | `/admin/access-control?role=<key>` | preserves env |
| Overrides tab — row | user cell | `/admin/access-control?userId=<id>&tab=role-access` | — |
| Pending Approvals — row | any cell | opens existing `ApprovalDetailsDrawer` (already wired) | — |
| Any audit reference (change-set id, override id) | id chip | `/admin/audit-logs?ref=<id>&type=change_set\|override` | audit page adds `ref` filter |
| `/admin/access-control` — "Open Permission Matrix" | button | `/admin/permission-matrix?role=<key>` or `?userId=<id>&tab=overrides` | — |
| Nav badges (sidebar) | Access Approvals link | shows count from `permission_change_sets` where `status='pending_approval'` **AND** current user is an eligible approver | polled every 60s + realtime channel |

Additional wiring:
- `AdminTaskOrchestration` and `AdminAgentPerformance` route guards switch to `PermissionRoute` using catalogue keys `task_orchestration.view` and `agent_performance.view` — no separate permission list.
- `/admin/users-access` already redirects to `/admin/access-control` — keep.
- `AdminAccessApprovals` page already exists — verify it reads the same `permission_change_sets` view used by the matrix's Pending Approvals tab, remove any local shadow list.

## 3. Nav badge for pending approvals

- Add `usePendingApprovalsBadge()` hook backed by a lightweight `count(*)` query filtered by approver eligibility (`canApproveChangeSet` policy) and subscribed via Supabase Realtime on `permission_change_sets`.
- Renders in the admin sidebar next to "Access Approvals" and (as a small dot) in the app header for any admin surface.
- Hidden entirely when the user cannot approve anything.

## 4. Final review pass (fix-forward, not just checklist)

FUNCTIONALITY sweep — verify each item and file targeted fixes:
- Every button in the Quick Actions dock, RoleDetail, Overrides, Templates, Pending, History tabs wired to an action or removed.
- Filter/clear-filter parity across the 6 tabs (`useRoleMatrixFilters` extended for History & Overrides).
- Draft-before-review invariant preserved — staged changes never call `apply_permission_change_set` directly.
- Template diff preview and Override "role value vs effective value" columns validated with a seeded fixture.

SECURITY sweep — mostly enforcement checks + tests:
- Add server-side `requirePermission` on: `permission-repository` RPC callers, `admin-export-jobs` for matrix exports, alert-preference edge function, suspend-assignment RPC.
- Add RLS regression: non-privileged internal user cannot `UPDATE role_permissions`, `INSERT permission_change_sets` outside their scope, or `UPDATE user_permission_overrides`.
- Guardrails: `apply_permission_change_set` rejects when requester = approver, when grants exceed requester's own permissions, when protected system permissions are being removed, when the last active Super Admin would lose the role, and when a temporary override has no `expires_at`. All already partially present — add explicit unit-style SQL tests and surface friendly UI messages.
- Auditor role: verify UI hides all mutation buttons *and* server rejects mutation calls (belt + suspenders).

UX sweep:
- Sticky permission column + matrix header confirmed at `xl` and below; add horizontal-scroll shadow only inside the matrix, no page-level overflow.
- Mobile (`<md`): automatically switch to Role Detail single-column view (already partially there — finish the breakpoint).
- Add loading skeletons for Overrides, Templates, Pending, History tables and error states with a Retry button using the existing `EmptyState` component variants.
- Add `aria-label`/`title` to icon-only buttons; verify keyboard focus returns to the launcher after any drawer closes (extend `useDrawerSafety`).
- Ensure state is not colour-only: append a symbolic glyph inside `PermissionStateCell` badges (already partially — verify all 6 states).

DATA INTEGRITY sweep:
- Add a migration-time assertion query that fails if any `permissions.key` was renamed or any duplicate `(role_key, permission_key, environment)` exists.
- Confirm `AdminAccessControl` and `AdminPermissionMatrix` both hydrate roles from `role-registry.ts` (single source).
- Confirm that failed `apply_permission_change_set` transactions roll back (wrap in `BEGIN`/`EXCEPTION` — already the case; add a fault-injection test).
- Deprecated permissions: keep row in `permissions` with `status='deprecated'`, hide from grant pickers, retain in audit rendering.

## 5. Technical notes

- No new tables. Alert prefs → `notification_preferences`; suspend flag → new column `permissions.assignable boolean not null default true`; export receipts → `admin_actions`.
- One migration only, covering: `permissions.assignable`, index on `permission_change_sets(status, environment)` for badge count, and helper view `v_pending_approvals_for_actor(uuid)` used by the badge hook (SECURITY DEFINER with `search_path=public`).
- All new edge functions (`admin-permission-matrix-export`, `admin-suspend-permission-assignment`, `admin-alert-preferences`) follow the existing pattern: `verify_jwt=false` in config, in-code JWT + `requirePermission`, CORS via `npm:@supabase/supabase-js@2/cors`, Zod input validation, and always emit an `admin_actions` row on success.
- Files touched (indicative): `src/pages/AdminPermissionMatrix.tsx`, `src/pages/AdminAccessControl.tsx`, `src/pages/AdminAuditLogs.tsx`, `src/components/admin/permission-matrix/*` (new: `QuickActionsMenu`, `AlertSettingsDrawer`, `SuspendPermissionDialog`, `ExportConfigDialog`), `src/services/permission-workspace.service.ts`, `src/services/permission-repository.ts`, `src/hooks/usePendingApprovalsBadge.ts`, `src/components/admin/AdminSidebar.tsx`, `supabase/functions/admin-permission-matrix-export/*`, `supabase/functions/admin-suspend-permission-assignment/*`, `supabase/functions/admin-alert-preferences/*`, one migration.
- After implementation: run typecheck, load `/admin/permission-matrix`, `/admin/access-control`, `/admin/access-approvals`, `/admin/audit-logs`, `/admin/task-orchestration`, `/admin/agent-performance` in the preview, confirm no console/runtime errors, and fix anything caught by the security scan.
