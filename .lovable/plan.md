
# Task Orchestration — remaining gaps vs spec

I audited the current wiring against your spec. Sidebar gating, route guards, per-action server permissions, non-`view_all` realtime scoping, per-row bulk results, auto-assign exclusions and CSV exports via server permission are **already in place**. Below are the remaining gaps grouped by the sections in your spec, followed by the fix plan.

## Confirmed gaps

### A. Unassigned Task Queue — columns & filters
Present today: Selection, Task ID (+ dispute), Type, Priority, Age, Amount, Suggested, Action; filters = search / priority / type / age; select-current-page only.
Missing:
- Columns: Case/Dispute Reference (dedicated), Stage, SLA Due, Queue.
- Filters: Queue, Status, Stage, SLA, Amount range, Team, Required-role, Date-range, Clear filters.
- Sort controls, pagination + rows-per-page, result count.
- "Select all matching results" (across pages), separate from "select current page".

### B. Assign Task drawer — eligibility depth
Shows agent name + `active/max`. Missing per spec:
- Availability chip, capacity bar, overdue count, team, role, relevant skills, suggested score, eligibility reason.
- Explicit warnings for capacity, permissions/skill gaps, SoD conflicts.
- "Selected tasks" summary when bulk-assigning (currently only the first task is echoed).

### C. Auto-Assign preview — depth
Has proposals + per-row exclusion + counts. Missing:
- Per-agent "current → projected" load rows.
- Unmatched tasks list with the reason each one could not be placed (no seats / missing skill / offline etc.).
- Selected assignment mode is shown, but selected-tasks scoping (subset vs whole queue) is not surfaced.

### D. Rebalance — safety & preview
`buildRebalancePlan` picks best agent by capacity only. Missing:
- Exclusion rules server-side: skip tasks in Final Decision, `pending_approval`, tasks locked by another operation, continuity-required tasks, moves that would create a permission/skill conflict.
- Preview must list, per proposed movement: task, previous agent, proposed agent, reason, SLA impact, priority impact.
- Per-movement exclusion checkboxes and a required confirmation reason.
- Notifications to both previous and new agent on apply.

### E. Live Task Progression — filters & status
"Filter" button is a placeholder. Missing filters (Agent, Team, Stage, Status, Priority, SLA, Task Type, Date range) and distinct status chips for `waiting_on_external`, `escalated`, `pending_approval` (today only SLA badge is shown).

### F. Task Details drawer — tabs, fields, actions
Only 3 tabs (Overview / Timeline / Comments). Missing tabs & content:
- Buyer & Seller (role-permitted view).
- Transaction (summary + link to full Transaction Details).
- Dispute (summary + link to full Dispute Details).
- Evidence (list + permitted evidence actions).
- Communications (buyer/seller messages related to the task).
- Internal Notes as a distinct tab from public Comments.
- Assignment History as a dedicated tab (previous agent, new agent, assigned by, mode, reason, timestamp).

Overview fields missing: Risk, Stage, Queue, Assigned agent, Due date, SLA status, Required role, Required permissions, Escalation state.

Task actions missing per permission: Start Task, Update Stage, Add Note (internal), Request Information, Request Evidence, Reassign, Submit Resolution, Close. (Assign, Escalate, Send-for-Approval, Complete already wired.)

### G. Agent Roster / Agent Details drawer
Agent Details drawer today shows Load / Overdue / Tasks Today / Resolved Today / Avg First Action only. Missing: role, permissions, skills, critical-task count, current SLA risk, avg resolution time, reassignment history, and contextual links (View in Users & Access, View Agent Performance, View Assigned Tasks, View Assignment History).

Agent Roster card is missing: role, team, critical-task count, current SLA risk, last activity.

### H. Availability enum coverage
`agent_availability_status` = `available | active | busy | at_capacity | offline`. Spec requires **`on_leave`** and **`suspended`** as first-class statuses used for eligibility filtering.

### I. Server-side safety extras
- `reassign` does not emit notifications to previous/new agent.
- `assign_to_me` and `assign_selected` don't check separation-of-duty (e.g., initiator cannot approve their own financial task).
- No explicit block when target agent status is `on_leave`/`suspended` (enum doesn't yet include these values).

## Fix plan

Ordered for minimal blast radius. Every item stays inside the Task Orchestration surface; no other module changes.

1. **Availability enum expansion (migration)** — add `on_leave` and `suspended` to `agent_availability_status`; treat both as ineligible in `pickBestAgent`, `buildAutoAssignPlan`, assign/reassign guards, and Roster status controls.
2. **Queue filters & pagination**
   - Extend `QueueFilters` with `status`, `stage`, `sla`, `queue`, `team`, `requiredRole`, `amountMin`, `amountMax`, `dateFrom`, `dateTo`, plus `sortBy`, `sortDir`, `page`, `perPage`.
   - Move filtering + counting server-side in `admin-task-orchestration-overview` (accept a `queue_filters` payload; return `{ rows, total, page, per_page }`).
   - UI: dedicated columns for Case/Dispute Ref, Stage, SLA Due, Queue; result count, "clear filters", sort headers, pagination bar, rows-per-page selector, and a second "Select all matching results" checkbox that switches selection to a server-scoped id set.
3. **Assign Task drawer eligibility panel** — expand each agent row with availability chip, capacity meter, overdue count, team, role, skills; compute a suggested score and eligibility reason; show inline warnings for capacity / missing skill / SoD; render a "selected tasks" list for bulk assign.
4. **Auto-Assign preview depth** — enrich server `preview_auto_assign` response with `agent_loads: [{ agent_id, current, projected }]` and `unmatched: [{ task_id, reason }]`; render both sections in the drawer.
5. **Rebalance overhaul (server + drawer)**
   - Server: exclude tasks in stages `final_decision`, statuses `pending_approval`/`escalated`, rows with `locked_by_action_id IS NOT NULL`, tasks flagged `continuity_required`, and moves that would violate skill/permission match.
   - Server response for `preview_rebalance` returns per-move `{ task_id, task_code, from, to, reason, sla_delta, priority }`.
   - Drawer lists movements with checkboxes to exclude, requires a reason, and passes `exclude_task_ids` + `reason` to `rebalance`; on apply, enqueue notifications for both agents.
6. **Live Task Progression filters + status chips** — real filter popover (agent/team/stage/status/priority/SLA/type/date range) + distinct chips for `waiting_on_external`, `escalated`, `pending_approval` alongside the existing SLA badge.
7. **Task Details drawer expansion**
   - Add tabs: Buyer & Seller, Transaction, Dispute, Evidence, Communications, Internal Notes, Assignment History (split from Timeline).
   - Overview: add Risk, Stage, Queue, Assigned Agent, Due Date, SLA Status, Required Role, Required Permissions, Escalation State fields.
   - Action bar: Start Task, Update Stage, Add Internal Note, Request Information, Request Evidence, Reassign, Submit Resolution, Close — each gated by its `useOrchestrationPerms` flag and routed through new `admin-task-orchestration-action` cases (`start`, `update_stage`, `add_internal_note`, `request_info`, `request_evidence`, `submit_resolution`, `close`) that write to `orchestration_tasks` + `task_status_history` and mirror to `admin_actions` / `audit_logs`.
   - Non-goal reminder: Transaction / Dispute / Evidence tabs render a **summary + deep link** to the existing full screens, not a duplicate of them.
8. **Agent Details drawer completeness** — surface role, permissions, skills, critical-task count, SLA risk, avg resolution time, and a reassignment-history list; add contextual link buttons to `/admin/access-control?userId=`, `/admin/agents/:id/performance`, `/admin/task-orchestration?assigned=:id`, and the Assignment History drawer scoped to that agent.
9. **Agent Roster card enrichment** — add role, team, critical-task count, current SLA risk, last-activity relative time to each card; keep availability distinct from "eligible".
10. **Notifications & SoD**
    - On `reassign` and `rebalance` movements, insert `notifications` rows for `from_agent_id` and `to_agent_id`.
    - Add SoD guard in `assign`, `assign_selected`, `assign_to_me`: reject when target agent is the task's initiator/originator on financial task types (`refund_request`, `escrow_release_review`, `payment_hold_review`, `payout_review`), returning `sod_conflict` unless the caller holds `task_orchestration.override_capacity` **and** provides a ≥8-char reason.

## Technical notes

- All new drawer tabs read via `fetchTaskDetail` — extend the server `task_detail` case to include buyer/seller summary (role-permitted), transaction stub, dispute stub, evidence rows, communication rows, and split `internal_notes` from public `comments`.
- New action cases must reuse the existing `checkVersion` optimistic-lock pattern and `logAdminAction({ mirrorToAuditLogs: true })`.
- Availability enum change is a migration; refresh types after apply.
- Server-side pagination for the queue is required so "Select all matching results" is honest — client-only filtering would silently drop rows beyond the 50-row cap.

```text
Overview endpoint returns:
{ scope, kpis,
  unassigned_queue: { rows, total, page, per_page },
  live_progression: [...],
  roster: [...],
  insights, rules }
```

No changes to Feature Registry / Permission Matrix / Users & Access are needed — permissions and role grants already cover every new action.
