
# Users & Access — remaining work

## Status against the original 9-step sequence

| Step | Item | Status |
|---|---|---|
| 1 | Migration: new `admin_action_type` enum values | Not done |
| 2 | Service safeguards a, c, d, e + `assertNotLastSuperAdmin` + `requiresApproval` | Done |
| 2 | Safeguards b, f, g, h | Not done |
| 3 | Edge functions `admin-access-control-mutate` / `admin-access-review-request` | Not done (still using client `auditLog()` in service) |
| 3 | Migrate all mutations off client `auditLog()` to `logAdminAction` | Not done |
| 4 | Approvals page tabs + review drawer + approve/reject | Done |
| 5 | Coming Soon pages + route registration + `/admin/permissions` alias | Done |
| 6 | Contextual nav buttons (View Approval Request, View in Audit Logs, View Assigned Tasks, View Agent Performance, Manage Role Template) | Not done (only "Open Permission Matrix" exists) |
| 7 | `useDrawerSafety` + `useMutationOnce` hooks | Hooks exist, but only wired into `AdminAccessApprovals.tsx`. Not applied to `AddUserDrawer`, `UserDetailsDrawer`, `ChangeRoleDrawer`, `ReviewPermissionsDrawer`, `SuspendUserDialog`, `ReactivateUserDialog` |
| 8 | Contract tests `access-safeguards` + `access-audit` | Not done |
| 9 | Manual QA pass | Pending |

## What to build next (build-mode order)

### 1. DB migration — audit enum
Add these `admin_action_type` values: `user_invited`, `invitation_resent`, `user_activated`, `role_assigned`, `role_changed`, `permission_override_requested`, `permission_override_approved`, `permission_override_rejected`, `user_reactivated`, `user_deactivated`, `session_revoked`, `task_reassigned`.

### 2. Finish safeguards in `admin-access-control.service.ts`
- **Rule b (grantor holds permission):** in `requestPermissionOverride` and `updatePermissionOverrides`, fetch caller effective permissions via `internal_effective_permissions`; reject any added key not in the caller's set with typed error `E_GRANTOR_MISSING_PERMISSION`.
- **Rule f (open-work impact warning):** add `fetchAssignedWorkImpact(targetId, removedKeys)` returning open counts per module; return it from `computeRoleChangeDiff` and a new `previewPermissionOverride` so drawers can show a yellow "This affects N open items" panel with an "I understand" checkbox.
- **Rule g (finance paranoid check):** in `reviewAccessChangeRequest`, when payload is `permission` with any `finance_*` / `payouts.*` / `refunds.*` / `escrow.release*` key, reject when `reviewer.id === request.requested_by` regardless of role.
- **Rule h (reason required):** enforce non-empty `reason` on `submitRoleChangeRequest`, `requestPermissionOverride`, `updateUserRoles`, `updatePermissionOverrides`, `suspendUserAtomic`, `reactivateInternalUser`, `deactivateInternalUser`, `reviewAccessChangeRequest` (approve + reject).

Each guard throws a typed `AccessSafeguardError` with `code` + `rule` so the UI can render inline.

### 3. Unified audit via edge functions
Create two edge functions with CORS + JWT validation:
- `admin-access-control-mutate` — one entry with `op ∈ { update_roles, apply_permission_override, suspend, reactivate, deactivate, resend_invite, revoke_session, reassign_task }`. Each branch calls the existing service logic then `logAdminAction` with the correct `admin_action_type`, `before`/`after` JSONB diff, `reason`, `entity_ref`, and `ip`/`user_agent` from headers.
- `admin-access-review-request` — approve/reject queue items; runs safeguards a–g server-side; logs `role_change_approved` / `permission_override_approved` / etc. with `approval_reference = request.id`.

Refactor client service methods to thin wrappers that `functions.invoke` these endpoints. Delete the local `auditLog()` writer once every caller migrates.

### 4. Contextual nav buttons
- `UserDetailsDrawer` → "View Approval Request" (visible when target has a pending `access_change_requests` row): links to `/admin/access-approvals?request=<id>`.
- `UserDetailsDrawer` → "View Assigned Tasks" → `/admin/task-orchestration` (Coming Soon page).
- `UserDetailsDrawer` → "View Agent Performance" (only for agent-tier roles) → `/admin/agent-performance`.
- `AccessHistoryTimeline` row → "View in Audit Logs" → `/admin/audit-logs?entity=internal_users:<id>&action=<type>` (extend `AdminAuditLogs` to read those query params on mount).
- `ReviewPermissionsDrawer` → "Manage Role Template" (Super Admin only) → Coming Soon.
- `AdminAccessApprovals` → read `?request=<id>` query param and auto-open the drawer.

### 5. Apply drawer QA hooks
Wire `useDrawerSafety({ open, isDirty, onClose })` and replace bare `saving` state with `useMutationOnce` in: `AddUserDrawer`, `UserDetailsDrawer` (tabs with edits), `ChangeRoleDrawer`, `ReviewPermissionsDrawer`, `SuspendUserDialog`, `ReactivateUserDialog`. Verify Esc/overlay/X all respect the dirty guard, and focus restores to the row action trigger.

### 6. Contract tests
- `src/__tests__/access-safeguards.contract.test.ts` — one case per rule a–h asserting typed error code.
- `src/__tests__/access-audit.contract.test.ts` — each mutation path produces exactly one `admin_actions` row with `action_type`, `target_user_id`, before/after diff, `approval_reference` when applicable.

### 7. Manual QA checklist
Run the drawer-safety checklist across desktop + mobile widths for all six drawers + approval drawer.

## Out of scope
Task Orchestration and Agent Performance dashboards remain Coming Soon; no changes to non-admin flows or role definitions.
