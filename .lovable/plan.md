# Draft-and-review workflow — remaining gaps

The workflow, states, Review Changes drawer, approval rules, atomic apply, Recreate action, and Approval Details drawer are all in place. Against the plan text you pasted, four small gaps remain — all in the Pending Approvals and Change History filter/drawer surfaces. Everything else is done.

## Gaps to close

1. **Pending Approvals — missing filter chips**
   Current chips: type, risk, status, search. Plan requires additionally: **Requester**, **Approver**, and **Date range**. Add three chips on `PendingApprovalTable.tsx` fed from the loaded rows (distinct requesters/approvers) plus a preset date-range picker (Today / 7d / 30d / Custom).

2. **Change History — missing filter chips**
   Current chips: scope, result, search. Plan requires: **Role**, **User**, **Permission**, **Module**, **Actor**, **Action**, **Date range**. Extend `PermissionHistoryTable.tsx` with permission/module/actor selects (populated from row data) and the same date-range preset. Scope already covers role/user split; keep it and layer the new dimensions on top.

3. **Approval Details drawer — missing context blocks**
   `ApprovalDetailsDrawer.tsx` shows diff, reason, and actions. Plan requires it to also render: **Impacted roles**, **Impacted users**, **Dependencies**, **Conflicts / security warnings**, **Related audit events**, and **Approval history** (submitted → reviewed → applied timeline). Wire these from existing sources: `permission-dependencies.ts`, `permission_conflicts`, `audit_logs` filtered by change-set id, and the `permission_change_sets` status transitions.

4. **Change History drawer — parity with Review Changes**
   Clicking a history row currently opens the same review drawer in read-only mode. Confirm the drawer shows: reason, approval reference (link to change-set), result, environment, and audit-event reference. If any are missing, add them as a compact metadata block at the top of the drawer.

## Out of scope (as previously agreed)

- Server-side cron to hard-flip expired overrides.
- Users route rename.
- Table virtualization.
- Rollback beyond Recreate (never edit or delete historical records — already enforced).

## Technical notes

- Date-range preset: reuse the pattern from `AdminAuditLogs` if present; otherwise a small `<DateRangeChip>` returning `{from, to}` and filtering client-side on `submitted_at` / `applied_at`.
- Impacted users count already exists on the change-set row (`impacted_users`); surface it in the drawer alongside a role→user expansion fetched lazily via `permission-repository.listUsersImpactedByChangeSet` (add if missing — thin wrapper over `user_roles` + `user_permission_overrides`).
- Approval history: derive from `permission_change_sets` (`submitted_at`, `reviewed_at`, `reviewed_by`, `applied_at`, `status`) — no new table needed.
- Audit events: `audit_logs` where `metadata->>'change_set_id' = :id`.
