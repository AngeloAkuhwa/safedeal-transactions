## Draft → Review → Approve workflow (matrix + approvals + history)

Turn the current one-shot "stage → submit" flow into a full draft/review/approval lifecycle across the Permission Matrix, the Pending Approvals queue, and the Change History tab. No permission edit ever mutates live grants without going through Review Changes; privileged edits always require a separate approver.

### Current state (verified)
- `permission_change_sets` already carries `status ∈ {pending, approved, rejected, applied, cancelled}`, `before`/`after` JSONB, `environment`, `requested_by`, `applied_by`. RPCs `apply_permission_change_set` / `reject_permission_change_set` exist and are env-scoped.
- `useStagedPermissionChanges` stages cell edits in memory; `StagedChangesFooter` posts one change set per role via `permissionRepo.submitChangeSet` with just a reason field.
- `ReviewChangesDrawer` is a thin JSON viewer; `PendingApprovalTable` has 6 columns, no filters, no inline approve/reject; `PermissionHistoryTable` has 5 columns, no filters, no recreate action.

### 1. Change-state model (shared vocabulary)
- Add `ChangeState = 'unchanged' | 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'applied' | 'cancelled'` in `src/services/permission-workspace.service.ts`.
- New column `permission_change_sets.state text` (mirrors lifecycle for the UI) with a default of `'draft'` and a check constraint matching the enum above; kept in sync by the RPCs. Legacy `status` column stays for backwards compatibility (mapped 1:1).
- New column `permission_change_sets.requires_approval boolean` — set at submission time from the rules in §5.
- New column `permission_change_sets.review_comments jsonb` — append-only log `[{actor, action:'approved'|'rejected'|'requested_changes'|'commented', comment, at}]`.
- New column `submitted_at timestamptz` (distinct from `created_at`, which becomes the draft-created timestamp).

### 2. Staging surface (Matrix, Templates, Overrides, Feature Registry)
- Extend `useStagedPermissionChanges` to track user overrides and template edits (currently role-only) via a discriminated `StagedChange` union: `{ scope:'role'|'user'|'template', targetKey, permissionKey, op:'grant'|'revoke'|'deny', prevValue, nextValue, reason? }`.
- Replace direct write paths that still bypass staging:
  - `CreateOverrideDrawer` → stage instead of `createOverride` when `canManage && !privileged`; privileged always stages + flags approval.
  - `ApplyTemplateDialog` already stages — keep.
  - `PermissionToggleRow` in `RoleDetailPanel`, `RoleMatrix`, `CompareRolesMatrix` — already stages.
  - `FeatureDetailsDrawer` Suspend/Deprecate on High/Critical permissions → stage as a "feature status change" change set (new `target_scope='permission'`).
- Cell/row visual states driven by shared helper `getCellChangeState(prev, staged, changeSet)`:
  - Unchanged: default.
  - Draft (local): amber ring + amber dot.
  - Pending approval: blue ring + clock icon.
  - Approved: emerald ring + check.
  - Rejected: red ring + x.
  - Applied: subtle emerald tint that clears on next refresh.
  - Cancelled: strikethrough neutral.
- Global "Unsaved Changes" counter in the sticky sub-header (already partial via footer) plus per-row Undo (revert single cell) and per-role Discard (existing `discardRole`) — expose Undo from `PermissionToggleRow` overflow.

### 3. Replace footer actions
- `StagedChangesFooter` gains two primary buttons: **Review Changes** (opens the new drawer) and **Discard Changes** (confirm). The inline reason field goes away — it moves into the drawer where a real audit reason is required.
- `useUnsavedNavigationGuard` already blocks nav; extend copy to say "You have N unsaved permission changes across M targets".

### 4. Review Changes drawer (rewrite `ReviewChangesDrawer.tsx`)
Wide right-side sheet grouped by target (role / template / user / permission). Per target:
- Header: scope label, target name/avatar, environment ribbon, count of adds/removes, computed risk badge (`max(riskLevel of touched permissions)`).
- Diff table: `Permission key | Module | Risk | Previous | New | Impacted users | Dependencies | Conflicts` (dependencies come from `permission_dependencies`, conflicts from `permission_conflicts`, impacted users from `fetchRoleUserCounts` / override user).
- Security warnings block: privileged introductions, SoD violations, self-approval risk (see §5), Auditor/Finance/ops guardrails from `role-guardrails`.
- "Requires approval" pill computed live from §5 rules; explanation line names which rule triggered it.
- **Reason for change** — textarea, min 20 chars, required; blocks submit until satisfied.

Footer actions (context-dependent, all disabled while `busy`):
- **Apply Changes** — only shown when `!requires_approval` AND actor has all touched keys. Calls `apply_permission_change_set` directly with `_state='applied'`; atomic (any target failure rolls back the whole submission via a single new RPC `submit_and_apply_change_sets(_sets jsonb[])` wrapping the writes in one transaction).
- **Submit for Approval** — shown when `requires_approval`. Writes all sets with `state='pending_approval'`, `submitted_at=now()`. Idempotency guard: a client-side `submittingRef` + a server-side unique advisory lock on `(requested_by, hash(payload))` to prevent duplicate submissions on double-click.
- **Return to Editing** — closes drawer, keeps staging intact.
- **Discard Changes** — clears buffer with confirm.

On success: toast, refresh `permission-workspace.service` caches for the affected env, refresh effective permissions for impacted users (invalidate `admin-me` cache for each), write an `admin_actions` row via `logAdminAction('permission_change_submitted' | 'permission_change_applied')`, and clear the local staging buffer for that target scope.

### 5. Approval-required rules (`src/services/permission-approval-rules.ts` — new)
`requiresApproval(changeSet)` returns true if any of these hit:
1. Any touched key belongs to a Super Admin role change.
2. Touches any key in module `permissions` or `users` (permission-management / user-management).
3. Touches `user.impersonate`.
4. Touches `escrow.release`, `payouts.initiate`, `payouts.approve`, `refunds.approve`.
5. Touches any `*.export` key flagged `risk_level in ('high','critical')` (sensitive exports).
6. Touches `audit.read_full`.
7. Touches any key in module `platform_security`.
8. Any override on a `risk_level in ('high','critical')` permission (critical user overrides).
9. Suspending or deprecating a permission whose `risk_level in ('high','critical')`.

Additional invariants enforced client-side + in a new SECURITY DEFINER guard function `permission_change_can_submit(_actor, _payload) returns text`:
- Actor cannot grant a key they do not effectively hold (unless they are `super_admin`).
- Actor cannot modify a role at or above their own authority tier (tier map: super_admin > senior_admin > admin > ops/finance/support).
- Requesters cannot approve their own change sets — enforced by RPC (existing `apply_permission_change_set` gets a `_actor_check` guard that rejects when `applied_by = requested_by` unless the rule is non-privileged auto-apply).

### 6. Pending Approvals tab (rewrite `PendingApprovalTable.tsx` + `AdminAccessApprovals.tsx`)
Columns: Request ID (short hash), Type (role/template/user/permission), Target, Requested Changes (n add / n remove summary), Risk, Requested By, Requested Date, Required Approver (role hint from rule engine), Status, Actions.

Filters bar: type, risk, requester (searchable), approver, status (Pending/Approved/Rejected/Cancelled/Expired/Applied/Failed), date range. Filters URL-synced via `useSearchParams`.

Row click opens **Approval Details drawer** (new component `ApprovalDetailsDrawer.tsx`) showing: complete diff (same renderer as Review drawer), reason, impacted roles/users, dependencies, conflicts, security warnings, related `admin_actions` entries, requester profile card, and approval history from `review_comments`.

Approver actions in the drawer:
- **Approve** → confirm dialog, writes `state='approved'` then triggers atomic apply via `apply_permission_change_set`; toast on success.
- **Reject** → requires comment ≥10 chars.
- **Request Changes** → requires comment; sets `state='draft'`, returns ownership to requester with a notification row in `notifications`.

Guards: hide/disable Approve+Reject when `auth.uid() = requested_by` with tooltip "You cannot approve your own request".

Expired status: computed for pending sets older than 7 days (config in `system_settings.permission_approval_ttl_days`); scheduled cron is out of scope, so a lightweight client-side derivation + one-off SQL updater triggered by any approver action.

### 7. Change History tab (rewrite `PermissionHistoryTable.tsx`)
Columns: Date/time, Actor, Action, Target, Previous, New, Reason, Approval ref (link back to approval drawer), Result (applied/failed/rolled_back), Environment, Audit-event ref (`admin_actions.id` link).

Filters: role, user, permission, module, actor, action, result, date range (URL synced).

New action per row: **Recreate Change** — opens the Review Changes drawer prefilled with a *reversal* (or *reapply*) draft staged in the buffer. It's a new draft; goes through full review/approval like any other change. No destructive rollback path; historical rows remain read-only (a DB `prevent_delete` trigger on `permission_change_sets` + `admin_actions` for the permission scope).

### 8. Success + notification wiring
On successful apply:
- Refresh `permission-workspace.service` env-keyed caches.
- Invalidate per-user effective permission caches (broadcast on the existing `admin_actions` realtime channel; `usePermissions()` re-fetches on the affected user).
- `admin_actions` event with `action_type='permission_change_applied'`, payload includes full before/after and change-set id.
- Success toast + inline banner on the source tab.
- On failure of any target during atomic apply: whole transaction rolls back, change set state becomes `failed`, toast lists which target failed, no partial writes.

### 9. Technical scope
- **New files**
  - `src/services/permission-approval-rules.ts`
  - `src/components/admin/permission-matrix/ApprovalDetailsDrawer.tsx`
  - `src/components/admin/permission-matrix/PermissionDiffTable.tsx` (shared by Review + Approval drawers)
  - `src/components/admin/permission-matrix/RecreateChangeAction.tsx`
- **Rewrites**
  - `ReviewChangesDrawer.tsx` (full rebuild per §4)
  - `PendingApprovalTable.tsx` + `AdminAccessApprovals.tsx` (columns, filters, drawer wiring, inline approve/reject)
  - `PermissionHistoryTable.tsx` (columns, filters, Recreate)
  - `StagedChangesFooter.tsx` (Review + Discard actions only)
  - `useStagedPermissionChanges.ts` (scope discriminator)
  - `permission-repository.ts` (`submitChangeSets` batch, `approveChangeSet`, `rejectChangeSet`, `requestChangesOnChangeSet`, `recreateChangeSet`)
- **Migrations**
  - Add `state`, `requires_approval`, `review_comments`, `submitted_at` columns.
  - New RPC `submit_and_apply_change_sets` for atomic multi-target apply and `permission_change_can_submit` guard.
  - `prevent_delete` trigger on `permission_change_sets`.
  - New `system_settings.permission_approval_ttl_days` (default 7).

### Out of scope
- Server-side cron for TTL expiry (derived client-side + best-effort updater).
- Email notifications for approvers (uses in-app notifications only).
- Role-authority tier configuration UI (uses fixed map in code).
- Per-approver quorum / multi-approver flows beyond the "separate approver" rule.

Approve to implement in a single pass across the three tabs and the supporting migrations.
