> Verified against the current code: `pickAgent`, `save_rules` validation + versioning, `test_rules` dry-run (with `rule_used`), `EscalateTaskDrawer` + financial-queue guard, `ExportScopePopover` with PII/financial gating, `ReviewRulesDrawer`, summary-card handlers, and the two enforcement actions (`auto_escalate_stale_tasks`, `auto_reassign_offline_agents`) are all in place. Five items are still open.

## 1. Round-robin cursor is not persisted
`round_robin_state` exists on `assignment_rules` but no code reads or writes it — round-robin currently restarts from the top of the roster on every run.

Fix: in `pickAgent`, read `round_robin_state[queue_scope]` (last picked agent id), start the eligible-agent scan after that agent, and write the new pointer back to `assignment_rules.round_robin_state` at the end of `auto_assign` / `auto_reassign_offline_agents` (never during previews/tests, so dry runs stay side-effect free).

## 2. Approval routing writes no change-set row
`save_rules` returns `requires_approval: true` and audits it, but it still applies the change immediately and never inserts a `permission_change_sets` row — so nothing lands in the Pending Approvals queue.

Fix:
- When thresholds are crossed (mode change, `max_active_per_agent` decrease, `super_admin_self_assign` turned on, `fallback_target = leave_unassigned`), do **not** write `assignment_rules.config`. Instead insert `permission_change_sets` with `scope='orchestration_rules'`, `before`/`after` JSON, reason, and return `{ status: 'pending_approval', change_set_id }`.
- On approval, apply the stored `after` config and write the `assignment_rule_versions` row with `approved_by` / `approved_at`.
- `ReviewRulesDrawer` shows the returned change-set id and a "submitted for approval" confirmation instead of a success toast.

## 3. Pending Approvals surface for rules changes
The approvals queue renders rows scope-agnostically. Add an `orchestration_rules` scope label and link each row to `/admin/task-orchestration?rules_change=<id>`; the page reads that param and reopens `ReviewRulesDrawer` read-only with the stored before/after diff.

## 4. SLA notifications not emitted
`sla_approaching` and `sla_overdue` are the two events from the spec table with no emitter.

Fix: emit both from `auto_escalate_stale_tasks` (the pass that already walks tasks and their `sla_due_at`): approaching when `sla_due_at - now ≤ threshold` (assignee), overdue when past due (assignee + senior admins). Dedupe keys `sla_approaching:<task_id>:<15-min bucket>` and `sla_overdue:<task_id>:<hour bucket>`, matching the existing dedupe helper. Links use `?task=<id>` and `?queue=<key>&sla=overdue`.

## 5. Escalation comment only on optional note
The spec requires an internal comment on every escalated task; today one is written only when the operator fills the optional internal note.

Fix: always insert an internal-visibility `task_comments` row carrying the escalation reason, target queue/team, new priority, and requested reviewer — appending the operator note when provided.

## Technical notes
- No new tables. `orchestration_notification_dedupe` stays out; the existing notifications-scan dedupe is sufficient.
- All server work stays inside `admin-task-orchestration-action`; no new edge functions.
- Extracting `pickAgent` into `_shared/orchestration-rules.ts` is cosmetic and skipped — the logic is already single-sourced inside the action function.

## Files to edit
- `supabase/functions/admin-task-orchestration-action/index.ts` — round-robin cursor, change-set routing, SLA emitters, always-on escalation comment.
- `src/components/admin/task-orchestration/ReviewRulesDrawer.tsx` — pending-approval result state, read-only mode.
- `src/pages/AdminTaskOrchestration.tsx` — `rules_change` deep link handling.
- `src/pages/AdminAccessApprovals.tsx` — `orchestration_rules` scope label + back-link.

## Out of scope
- Cron scheduling for the enforcement RPCs (still "Run now" only).
- AgentDetailsDrawer Performance-tab redesign.
