
# Draft-and-review workflow — remaining gaps

The staging + `ReviewChangesDrawer` half is in place, but the **Pending Approvals** and **Change History** tabs plus several policy/UX guarantees from the spec are still missing. Below is the audited gap list, grouped by spec section, with the exact fix each one needs.

---

## 1. Data source mismatch (root cause for most tab gaps)

The **Review Changes drawer** submits into `permission_change_sets` via `permissionRepo.submitChangeSets`, but the **Pending Approvals** tab on `/admin/permission-matrix` still reads `permissionRepo.listApprovals()` — which loads the legacy `access_change_requests` table. New staged changes therefore never appear in the queue, and the queue can never surface change-set fields like risk, environment, or before/after diffs.

**Fix**
- Add `permissionRepo.listAllChangeSets` (already exists) as the source for the Pending Approvals tab, filtered by status ∈ {`pending_approval`, `requested_changes`}.
- Keep `access_change_requests` visible on the standalone `/admin/access-approvals` page (that stream is used by role/user drawers) but stop mixing them.
- Provide one unified list function `fetchPermissionApprovals(filter)` in `permission-workspace.service.ts` so both tabs read the same rows.

---

## 2. Pending Approvals tab — missing columns, filters, and drawer

Current `PendingApprovalTable.tsx` is a 53-line stub with only Target / Change type / Requester / Reason / Age / a Review link that navigates away. Spec requires a full queue with an in-page **Approval Details drawer**.

**Fix**
- Rebuild `PendingApprovalTable` to render: Request ID, Request Type, Target (scope + key with link), Requested Changes (adds/removes summary), Risk Level (max risk across touched keys via `getPermissionRisk`), Requested By, Requested Date, Required Approver (from `evaluateApproval` hits), Status pill, Actions.
- Support statuses: `pending_approval`, `approved`, `rejected`, `cancelled`, `expired`, `applied`, `failed` (already in `ChangeState`; add `expired` handling if not present).
- Add a filter bar (`PermissionFilters` pattern): Request type, Risk level, Requester, Approver, Status, Date range. URL-sync via search params.
- Add an **Approval Details drawer** (new `ApprovalDetailsDrawer.tsx`) that opens on row click and shows: full `PermissionDiffTable`, reason, impacted roles + user count, dependencies, conflicts, security warnings, related audit events, requester profile, approval history for the change set. Actions: Approve, Reject, Request Changes; Reject/Request-changes require a comment ≥ 20 chars.
- Wire actions to `permissionRepo.approveChangeSet`, `rejectChangeSet`, `requestChangesOnChangeSet`.

---

## 3. Change History tab — missing columns, filters, and Recreate

Current `PermissionHistoryTable.tsx` is 43 lines with When / Action / Target / Actor / Summary and no filters. Spec requires a complete history table plus a non-destructive Recreate Change action.

**Fix**
- Extend `HistoryRow` (in `permission-workspace.service.ts`) to include: `previous_value`, `new_value`, `reason`, `approval_ref` (change_set id), `result` (applied/failed), `environment`, `audit_event_ref`. Source these from `permission_change_sets` joined with `audit_logs` / `admin_actions`.
- Rewrite `PermissionHistoryTable` columns to: When, Actor, Action, Target, Previous value, New value, Reason, Approval ref, Result, Environment, Audit ref.
- Add filters: Role, User, Permission, Module, Actor, Action, Result, Date range — URL-synced.
- Add row action **Recreate Change** that opens the Review Changes drawer pre-populated with the inverse (or duplicate) staged changes — never a direct write. Explicitly disable destructive delete/edit on historical rows.

---

## 4. Cell-level draft marker + counter surface

`useStagedPermissionChanges` and `StagedChangesFooter` count staged edits, but the spec also requires each **changed cell** to be visually marked with its `ChangeState` and to show pending/applied/rejected states pulled from `permission_change_sets`.

**Fix**
- In `PermissionStateCell` / `PermissionToggleRow`, overlay a `PermissionRowStateBadge` when the cell is staged (`draft`), or when there's an open change-set touching `(role|user, permission_key)` (states `pending_approval`, `requested_changes`, `approved`, `applied`, `rejected`, `failed`).
- Add `fetchOpenChangeSetsByCell()` returning `Map<${role|user}:${key}, ChangeState>` for the current environment, cached and refreshed on approval events.

---

## 5. Approval rule enforcement gaps

`evaluateApproval` covers the *what*. The spec also mandates *who*:

- Requesters cannot approve their own change sets.
- Users cannot grant permissions they do not currently hold.
- Users cannot change roles above their authority.
- Critical (`risk_level in ('high','critical')`) changes require a distinct approver.

**Fix**
- Add `canApproveChangeSet(changeSet, actor)` in `permission-approval-rules.ts` returning `{ allowed, reason }`. Enforce (a) `changeSet.requested_by !== actor.id`, (b) actor holds every key in `after \ before`, (c) actor's `role_rank ≥ target_role_rank` from `permission-catalog`, (d) for `hits.some(critical)` require a fresh approver even if actor is Super Admin.
- Mirror the same guard in the `apply_permission_change_set` RPC (server side, authoritative) — reject with a specific error code the drawer can render.
- Hide/disable Approve/Reject buttons in the Approval Details drawer when the guard blocks.

---

## 6. Duplicate-submission + unsaved-navigation guards

`useUnsavedNavigationGuard` exists but is only wired to the environment switcher inside `RoleMatrix`. The spec asks for a global unsaved warning and idempotent submission.

**Fix**
- Wrap `AdminPermissionMatrix` in a `useUnsavedNavigationGuard(staged.totalChanges > 0)` block that intercepts router navigation and `beforeunload` while any change is staged.
- Add an idempotency key (`crypto.randomUUID()`) to each `SubmitChangeSetInput`, dedupe at both the drawer level (disable button during `busy`) and the RPC level (unique index on `(idempotency_key, requested_by)`).

---

## 7. Post-apply refresh + audit trail

`ReviewChangesDrawer.onSubmitted` currently refetches roles/approvals/history but doesn't invalidate impacted user permission caches or emit the "success" toast contract described in the spec.

**Fix**
- On successful apply, additionally invalidate: `internal_effective_permissions` for every impacted user, `useCurrentUser` if the actor is impacted, and `EnvironmentSwitcher`'s workspace cache for the current env.
- Ensure `apply_permission_change_set` writes a paired row into `audit_logs` (`action_type = 'permission_change_applied'`) with `metadata = { change_set_id, before, after, hits }`. Verify persistence, then link that audit id back into the change-set row so the History tab's "Audit ref" column can deep-link.

---

## Out of scope for this pass (still deferred, unchanged)

- Server-side cron to hard-flip expired change sets and overrides.
- `/admin/users` route rename.
- Table virtualization on the History / Approvals tabs (target after row count exceeds 500).

Approve this and I'll implement §1–§7 in order (data source unification first so §2 and §3 can share it).
