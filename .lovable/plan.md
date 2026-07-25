# Users & Access — finalization plan

Scope: close the gaps found in the current build so approvals, safeguards, audit trail, and cross-screen navigation work end to end. Leaves existing routes and features intact.

## 1. Privileged approval safeguards (service + DB)

All safeguards enforced server-side (DB function / service layer). Every block returns a clear typed error the UI can render.

| # | Rule | Where enforced |
|---|---|---|
| a | Requester ≠ approver | Already in `reviewAccessChangeRequest`. Keep + add same check to Finance-initiated releases (rule h). |
| b | Cannot grant a permission you don't hold | New guard in `requestPermissionOverride` + `updatePermissionOverrides`: fetch caller's effective permissions; reject any added key not in that set. |
| c | Cannot modify a user whose access level ≥ your own | New guard in `updateUserRoles`, `updatePermissionOverrides`, `suspendUserAtomic`, `reactivateInternalUser`, `deactivateInternalUser`. |
| d | Last active Super Admin cannot be suspended/deactivated/demoted | New `assertNotLastSuperAdmin(target)` helper — counts other active `super_admin` rows; blocks suspend / deactivate / role change that removes `super_admin`. |
| e | Cannot increase your own access | Guard in `updateUserRoles` and `updatePermissionOverrides` when `target === caller`. |
| f | Warn if removing a permission required by target's assigned open work | Non-blocking warning: `computeRoleChangeDiff` and permission override preview call `fetchAssignedWorkImpact(targetId, removedKeys)`; UI shows a yellow "This will affect N open items" panel with a required "I understand" checkbox before submit. |
| g | Finance operator cannot approve a financial change they initiated | Reuse rule a — reinforce by tagging change_type `permission` payloads that touch `finance_*` keys and blocking approval when `reviewed_by === requested_by` even if reviewer is super_admin (paranoid double check). |
| h | Reason required on every privileged change | Enforce non-empty `reason` in all queue submissions and in the review call (already partial; make consistent). |

**Which changes go through the approval queue** (extends the existing `access_change_requests` flow):
- Add or promote to `super_admin`
- Assign `finance_approver`
- Grant any of: `payouts.*`, `refunds.*`, `escrow.release*`, `users.manage*`, `permissions.manage*`, `audit.export*`
- Add a privileged permission override (any key in `PRIVILEGED_ACTIONS`)
- Suspend / deactivate a Super Admin
- Remove any `PRIVILEGED_ACTIONS` key from a privileged user

The router that decides "direct-apply vs queue" lives in one place: `requiresApproval(action, payload, caller, target)`.

## 2. Access Approvals page — real workflow

`/admin/access-approvals` currently lists pending items only. Upgrade to a real queue:
- Tabs: **Pending**, **Approved**, **Rejected**, **Cancelled** (server-side filter).
- Row action: "Review" opens a right-side **Approval Detail drawer** showing:
  - Change type, target user (with quick link to their user drawer)
  - Requested by + timestamp + reason
  - **Before → After diff panel** (roles diff for role changes; permission list diff for overrides; suspend/reactivate payload)
  - Impact panel: open tasks affected, whether target is last super admin
  - **Approve** / **Reject** buttons — both require a reason; both disabled if any safeguard (a–g) fails, with the failing rule shown inline
- Approving calls existing `reviewAccessChangeRequest` (extended to run safeguards a–g and to log audit — see §3).
- Empty, loading, error, permission-denied states.

## 3. Unified audit trail

Route every access-control event through the canonical `logAdminAction` (writes `admin_actions` and mirrors to `audit_logs`), replacing the current client-side `auditLog()` writer. Reason: single source of truth for the `/admin/audit-logs` screen and export.

Move the writes into edge functions so IP/User-Agent are captured:
- New/updated edge functions:
  - `admin-invite-internal-user` — log `user_invited` (verify existing call, add if missing).
  - `admin-access-control-mutate` — one function fronting: role update, permission override apply, suspend, reactivate, deactivate, invite resend, session revocation, task reassignment. Each branch calls `logAdminAction` with the right `admin_action_type` and a JSONB before/after diff.
  - `admin-access-review-request` — approve/reject queue items; logs `permission_override_approved` / `permission_override_rejected` / `role_change_approved` / etc. with `approval_reference = request.id`.
- Client service methods become thin wrappers over these functions (keeps RLS-safe writes and centralizes audit).

New `admin_action_type` enum values to add (migration): `user_invited`, `invitation_resent`, `user_activated`, `role_assigned`, `role_changed`, `permission_override_requested`, `permission_override_approved`, `permission_override_rejected`, `user_reactivated`, `user_deactivated`, `session_revoked`, `task_reassigned`. (Suspend + freeze/unfreeze already exist.)

Every audit row carries: actor, target_user_id, action, previous_value (JSONB), new_value (JSONB), reason, created_at, approval_reference (nullable → `access_change_requests.id`), result (`success` | `blocked_by_safeguard` | `failed`), entity_ref (e.g. `internal_users:<id>`, `access_change_requests:<id>`).

## 4. Routes & navigation

Existing that stay: `/admin/access-control`, `/admin/users-access` (redirect), `/admin/audit-logs`, `/admin/access-approvals`, `/admin/permission-matrix`.

Add three **Coming Soon** placeholder pages so nav links never break — each a small React page with a consistent empty-state card ("This module is coming soon. Track progress in the roadmap.") and correct breadcrumb:
- `/admin/permissions` → alias/redirect to `/admin/permission-matrix` (they map to the same concept — one canonical, one alias) so the spec's route resolves.
- `/admin/task-orchestration` → `AdminTaskOrchestration.tsx` (Coming Soon)
- `/admin/agent-performance` → `AdminAgentPerformance.tsx` (Coming Soon)

Add all five to `BUILT_ROUTES` in `src/components/admin/useAdminNav.ts` so the nav no longer shows a Coming Soon toast on click (the page itself renders the Coming Soon state).

Contextual navigation buttons (wire only to real destinations; hide when destination is Coming Soon):
- `ReviewPermissionsDrawer` → **Open Permission Matrix** (already present, keep).
- `UserDetailsDrawer` → **View Approval Request** (visible when the user has a pending item; links to `/admin/access-approvals?request=<id>`).
- `AccessHistoryTimeline` row → **View in Audit Logs** (links to `/admin/audit-logs?entity=internal_users:<id>&action=<type>`).
- `UserDetailsDrawer` → **View Assigned Tasks** (Coming Soon target → button renders but opens the Coming Soon page).
- `UserDetailsDrawer` → **View Agent Performance** (visible only when target has `agent`-tier role; opens Coming Soon page).
- `ReviewPermissionsDrawer` → **Manage Role Template** (visible only to Super Admin; opens Coming Soon page).

## 5. Drawer / dialog QA polish

Applied uniformly via one shared hook so behavior is consistent:
- `useDrawerSafety({ isDirty, onClose })`:
  - `beforeunload` + in-app close intercept → confirmation when dirty.
  - Focus restore: capture `document.activeElement` on open, restore on close.
  - `Esc` and overlay-click respect the dirty guard.
- Duplicate-submit prevention: replace bare `saving` boolean with an `useMutationOnce` wrapper (in-flight lock + AbortController; disables trigger + primary button; ignores repeat submits).
- Loading skeletons + error/empty states audited across: `AddUserDrawer`, `UserDetailsDrawer`, `ChangeRoleDrawer`, `ReviewPermissionsDrawer`, `SuspendUserDialog`, `ReactivateUserDialog`, new **Approval Detail drawer**.
- Keyboard: verified tab order, primary action on `Enter`, `Esc` closes (with dirty check).
- Responsive: drawers convert to full-screen sheets < md breakpoint; tables reuse existing responsive column set.

## 6. Verification (post-build)

- Manual: for each drawer, run the QA checklist (open → tab → close via Esc/X/overlay → focus back on trigger).
- Contract tests to add:
  - `access-safeguards.contract.test.ts` — each rule a–h returns the expected typed error.
  - `access-audit.contract.test.ts` — every mutation path produces exactly one canonical `admin_actions` row with expected fields.
- Regression: existing edge-function auth contract test still green; existing dashboards unchanged.

---

## Implementation sequence (build-mode order)

1. **DB migration** — add missing `admin_action_type` values.
2. **Service refactor** — introduce `requiresApproval()` router + safeguard helpers (rules a–h) + `assertNotLastSuperAdmin`.
3. **Edge functions** — `admin-access-control-mutate` and `admin-access-review-request`; migrate service methods to call them.
4. **Approval page rewrite** — tabs + Approval Detail drawer wired to `reviewAccessChangeRequest`.
5. **Coming Soon pages + route registration** — `/admin/task-orchestration`, `/admin/agent-performance`, `/admin/permissions` alias.
6. **Contextual nav buttons** in the three drawers + timeline.
7. **`useDrawerSafety` + `useMutationOnce`** hooks; apply to all six existing drawers + new one.
8. **Contract tests** for safeguards + audit unification.
9. **Manual QA pass** across desktop / tablet / mobile.

## Out of scope (intentional)

- Actual implementation of Task Orchestration and Agent Performance dashboards (Coming Soon only).
- Changes to non-admin routes, buyer/seller flows, dashboards, or notifications pipeline.
- New role definitions — existing 10-role model is unchanged.
