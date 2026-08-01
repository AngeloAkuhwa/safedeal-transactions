Re-verified against the current code. Almost everything in this spec is now live end-to-end: `pickAgent` with fallback targets, round-robin cursor persistence in `assignment_rules.round_robin_state`, `save_rules` validation + `assignment_rule_versions` + approval routing into `permission_change_sets` (scope `orchestration_rules`) with a Pending Approvals deep link, the dry-run `test_rules` dialog, `EscalateTaskDrawer` with financial/compliance queue guards and an always-written internal comment, `ExportScopePopover` with PII/financial masking and audit rows, clickable summary/insight cards with the "Range · Team" caption and formula tooltips, and the notification set (`task_assigned`, `task_reassigned`, `task_escalated`, `sla_approaching`, `sla_overdue`, `critical_unassigned`, `agent_at_capacity`, `automation_rule_failed`, `no_eligible_agent`) with dedupe keys.

Three things are still open.

## 1. Self-assign does not enforce the rules toggle or a reason
`assign_to_me` checks the `task_orchestration.assign_self` permission and separation-of-duty, but it never reads `super_admin_self_assign` from the active rules and accepts an empty reason (falls back to the literal string "self-assigned").

Fix in `admin-task-orchestration-action`:
- Load the effective rules config for the task's queue scope; if `super_admin_self_assign` is off, return `self_assign_disabled` (403).
- Require a caller-supplied reason of at least 8 characters, same shape as the capacity-override guard; reject with `self_assign_reason_required` otherwise.
- Record the reason on the `admin_actions` row (currently only `task_ids` is stored) and mirror to audit logs.

## 2. Self-assign emits no `task_assigned` notification
`assign`, `assign_selected` and `reassign` all notify; the self-assign path does not. Emit the same `task_assigned` event (assignee + senior admins as manager stand-in) with dedupe key `assign_self:<task_ids>` so the notification matrix is complete.

## 3. Self-assign UI does not collect the reason or respect the toggle
`AssignmentQuickActions` fires self-assign without a prompt. Add a small reason dialog (min 8 chars) before the call, and disable the button with an explanatory tooltip when `super_admin_self_assign` is off in the loaded rules or the permission is missing.

## Technical notes
- No schema changes. No new tables; the notification dedupe continues to use the existing metadata-scan helper rather than a dedicated `orchestration_notification_dedupe` table.
- Extracting `pickAgent` into `_shared/orchestration-rules.ts` stays skipped — it is already single-sourced inside the action function and moving it is cosmetic.

## Files to edit
- `supabase/functions/admin-task-orchestration-action/index.ts` — self-assign toggle check, reason requirement, audit metadata, `task_assigned` emit.
- `src/components/admin/task-orchestration/AssignmentQuickActions.tsx` — reason dialog + toggle-aware disabled state.
- `src/pages/AdminTaskOrchestration.tsx` — pass the rules config into quick actions and forward the reason.

## Out of scope (unchanged)
- Cron scheduling for `auto_escalate_stale_tasks` / `auto_reassign_offline_agents` — still "Run now" only.
- AgentDetailsDrawer Performance-tab redesign.
