# Assignment Rules & Automation — what's left

Sections 1–8 of the finish plan are implemented and wired (rules schema + `pickAgent` enforcement with round-robin cursor and fallback targets, Review-and-Save drawer with diff/impact/approval/reason, Test Configuration dry-run returning sample/unassigned/capacity_impact/distribution_summary, Escalate drawer with reviewer + financial/compliance queue restrictions, clickable summary and productivity cards with tooltips and the range/team caption, export scopes with PII/financial masking, audit logging on every mutation, and cron-scheduled auto-escalate / auto-reassign).

Four residual gaps remain, all in the notification layer.

## 1. Shared notification helper

The spec asks for `notifyOrchestration(event, payload)` to live in `supabase/functions/_shared/orchestration.ts`. Today the equivalent (`notifyEvent`) is a closure inside `admin-task-orchestration-action/index.ts`, so no other function can emit orchestration notifications consistently.

- Move it into `_shared/orchestration.ts` as `notifyOrchestration(admin, { event, recipients, title, body, dedupeKey, dedupeMinutes, data })`, keeping the durable dedupe path through `orchestration_notification_dedupe`.
- Import it in the action function and delete the local copy.

## 2. Delivery rows

Notifications are inserted into `notifications` only. The spec also requires `notification_deliveries` rows so admin Notification Center retry/status views can see orchestration alerts.

- After the `notifications` insert, insert matching `notification_deliveries` rows (channel `in_app`, status `sent`, timestamp) inside the same helper.

## 3. Deep links on every event

Only four call sites attach a `link`. Add the standard deep link to the remaining events so every alert is actionable:

- `task_assigned` (single + bulk) and `task_reassigned` → `/admin/task-orchestration?task=<id>`
- `task_escalated` → `?queue=<target_queue>` when present, else `?task=<id>`
- `agent_at_capacity` → `?agent=<agent_id>`
- `critical_unassigned` → `?status=unassigned&priority=critical`
- `no_eligible_agent` / `automation_rule_failed` → `?status=unassigned`

## 4. Manager recipients

The matrix routes `task_assigned` / `task_reassigned` / `agent_at_capacity` to "their manager". Currently assignee-only (capacity falls back to all senior admins).

- Add a `managersFor(agentId)` resolver in the shared module: prefer the agent's team lead / `dispute_manager` peers for the agent's queue, falling back to senior admins.
- Use it as an extra recipient set on `task_assigned`, `task_reassigned`, and `agent_at_capacity`.

## Technical notes

- Files edited: `supabase/functions/_shared/orchestration.ts`, `supabase/functions/admin-task-orchestration-action/index.ts`.
- No DB migration needed — `orchestration_notification_dedupe` and `notification_deliveries` already exist.
- Both edge functions redeployed after the change.
