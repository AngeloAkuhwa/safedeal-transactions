
# Assignment Rules, Automation, Escalation, Insights, Exports & Notifications — Finish plan

Bring the Assignment Rules panel and surrounding orchestration surface from cosmetic to fully enforced end-to-end. Everything below extends the existing `admin-task-orchestration-*` edge functions and the AssignmentRulesPanel / AssignmentControlPanel / ProductivityInsights / OrchestrationSummaryCards components.

## 1. Rules schema, storage, and enforcement

Extend `AssignmentRulesConfig` and the `assignment_rules` row that is already loaded via the overview endpoint:

- `mode`: one of `manual | round_robin | least_loaded | skill_based | priority_based` (exactly one primary automatic mode at a time, enforced server-side).
- `queue_scope`: `global` or a specific queue key; UI switcher lets senior admins configure per queue (defaults to `global`).
- Existing toggles kept: `round_robin`, `online_only`, `skip_at_capacity`, `priority_to_senior_pool`, `auto_escalate_stale`, `auto_reassign_on_offline`, `super_admin_self_assign`.
- New numerics: `stale_after_minutes`, `stale_escalation_queue`, `offline_reassign_after_minutes`, `max_active_per_agent` (per team override map), `max_overdue_before_skip`, `fallback_target` (`senior_agent_pool | escalation_queue | leave_unassigned`).
- `senior_pool_queue`, `senior_pool_role_key`.
- `round_robin_state` (server-only pointer, agent_id last picked, per queue).

Server changes in `admin-task-orchestration-action`:

- Add a single `pickAgent(mode, task, rules)` function respecting: online_only, skip_at_capacity, max_overdue_before_skip, priority_to_senior_pool, skill match (`required_permissions`), round-robin cursor persistence, least-loaded tiebreak, priority-based routing to senior queue.
- Rewrite `auto_assign` and `preview_auto_assign` to use `pickAgent` and honour `fallback_target` when no primary agent is eligible.
- Add background enforcement helpers callable from a scheduled worker (out of scope for this plan to wire cron, but the RPCs are added and idempotent): `auto_escalate_stale_tasks(rules)` and `auto_reassign_offline_agents(rules)`. Both skip tasks with `continuity_required` or `awaiting_final_approval`.
- Enforce `super_admin_self_assign` on the `assign_to_me` path — require the toggle to be on AND `task_orchestration.assign_self`, and always require a `reason` recorded to `admin_actions`.
- Validate all numeric rule fields (`>0` and reasonable upper bounds) in `save_rules`; reject otherwise with a clear error.

## 2. Review-and-Save workflow (replace "Save Assignment")

Rename button to **Review and Save Rules**. Clicking opens a new `ReviewRulesDrawer` that:

- Diffs `data.rules.config` (current) vs `draft` (proposed) into a table (Rule, Previous, New).
- Lists **Affected queues** (from `queue_scope` and `senior_pool_queue`).
- Renders **Estimated impact**: counts of tasks currently in `unassigned`, `assigned` in scope; how many would move under new mode using a fresh `preview_auto_assign` call.
- Surfaces **Warnings** (e.g. `max_active_per_agent` decreased below current peak, `auto_escalate_stale` on but no `stale_escalation_queue`, senior pool empty).
- Shows **Required approval** badge when the change crosses the existing permission-change-set thresholds (reuses `permission-approval-rules.ts` pattern with an orchestration-rules variant).
- Requires a **Reason for change** (min 20 chars) before Save is enabled.

Server:

- `save_rules` writes new row into a new `assignment_rule_versions` table (before/after JSON, actor, reason, approved_by nullable) and updates `assignment_rules.config`. Every change is auditable and reversible.
- When approval is required, the action returns `pending_approval` and inserts into `permission_change_sets` with `scope = 'orchestration_rules'`; existing approvals surface it in the admin Pending Approvals queue.
- All saves logged via `logAdminAction('orchestration.rules.save', {before, after, reason})`.

## 3. Test Configuration (dry-run)

Replace toast-only `test_rules` with a real simulation dialog:

- Server `test_rules` runs `pickAgent` over the current pending queue with the **draft** rules payload (client sends `rules` in the request), returns:
  - `sample`: array of `{task_code, priority, proposed_agent, rule_used, reason?}`
  - `unassigned`: `{task_code, reason}` (no seats / no skill / no eligible senior)
  - `capacity_impact`: `{agent_id, current, projected, max}[]`
  - `distribution_summary`: `{mode, assigned, unassigned, per_agent_average}`
- New `TestConfigurationDialog` renders those sections in tabs; footer has **Back to Edit** and **Review and Save Rules**.

## 4. Escalate (single + bulk depth)

Rewrite `EscalateTaskDialog` into an `EscalateTaskDrawer` supporting one or many selected tasks with fields:

- Escalation reason (required, ≥20 chars).
- Target queue or team (select).
- Escalation priority (`high | critical`).
- Internal note (visibility=`internal`).
- Requested reviewer (optional, agent picker).

Preview panel shows: current owner(s), new target, SLA impact (recomputed due dates), financial/compliance restrictions, required permissions on target queue.

Server `escalate` validates the target queue accepts the task's `required_permissions`. Financial (`refund_request`, `escrow_release_review`, `payment_hold_review`, `payout_review`) and fraud/compliance types are hard-restricted to queues whose configured role has the matching permission (`refunds.process`, `escrow.release`, `payouts.release`, `compliance.review`). Records to `admin_actions` and creates an internal note comment.

## 5. Productivity & summary card interactivity

- Make each `ProductivityInsights` card clickable: opens `AgentDetailsDrawer` (default tab = Performance) filtered by the currently selected date range + team filters.
- Add tooltips (`Tooltip` from ui/tooltip) explaining metric formulas (e.g. "Tasks marked resolved by the agent between {from} and {to}").
- `OrchestrationSummaryCards` gains real click handlers for **all six** cards, each applying a queue filter and scrolling to the queue:
  - Unassigned → `status=unassigned`
  - Active Agents → open roster tab `active`
  - At Capacity → roster tab `at_capacity`
  - Assigned Today → live progression filter `assigned_today`
  - Overdue → queue filter `sla=overdue`
  - Avg First Action → opens insight tooltip only (no filter)
- Add explicit "Range: last 24h · Team: All" caption row above the KPI grid so users see which slice is being counted; wire to the existing date-range/team filter state.

## 6. Export report

Extend `export_queue` action:

- Require `task_orchestration.export`.
- Accept `scope`: `queue | live | assignment_history | agent_load | automation_rules`.
- Accept `filters` (uses current queue/insight filters).
- Redact buyer/seller/financial columns unless the caller also holds `data.export.pii` (buyer identity) or `data.export.financial`; masked columns come back as `***`.
- Every export writes an `admin_actions` row with scope, filters hash, row count.

Front-end: replace single Bulk Export button with a small popover offering the five scopes and a "Include PII" checkbox that is disabled when the permission is missing.

## 7. Notifications

New helper `notifyOrchestration(event, payload)` in `_shared/orchestration.ts` writes into existing `notifications` (and `notification_deliveries`) with dedupe keys so identical unchanged conditions don't re-fire within the configured window.

Events wired:

| Event | Recipients | Trigger |
|---|---|---|
| `task_assigned` | assignee, their manager | `assign`, `assign_selected`, `assign_to_me` |
| `task_reassigned` | prior + new assignee, manager | `reassign`, rebalance moves |
| `task_escalated` | new queue managers, prior owner | `escalate`, auto-escalate |
| `sla_approaching` | assignee | worker when `sla_due_at - now ≤ threshold` |
| `sla_overdue` | assignee + manager | worker when overdue |
| `critical_unassigned` | senior admins | worker when `priority=critical` and unassigned > threshold |
| `agent_at_capacity` | manager | on capacity trigger crossing max |
| `automation_rule_failed` | senior admins | any `auto_assign` / `auto_escalate` / `auto_reassign` failure |
| `no_eligible_agent` | senior admins | preview or run returns empty plan |

Each notification includes a deep link (`/admin/task-orchestration?task=<id>` or `?queue=<key>&sla=overdue`). Dedupe key = `${event}:${task_id or queue}:${bucket}`.

## 8. Audit & permissions

- Every mutation already routes through `requirePermission`; add `task_orchestration.manage_rules` for save/test-with-persist, `task_orchestration.export` for exports, `task_orchestration.escalate` for escalate, `task_orchestration.assign_self` for self-assign.
- `logAdminAction` called on save_rules, test_rules (no-op audit level), escalate, export, reassign, override_capacity, self-assign.

## Technical notes

### DB migrations
- `assignment_rules`: extend `config` JSON schema (no column change), add `queue_scope text default 'global'`, `round_robin_state jsonb default '{}'::jsonb`, UNIQUE(`queue_scope`).
- New `assignment_rule_versions(id, rules_id, before jsonb, after jsonb, actor_id, reason, created_at, approved_by, approved_at)` with GRANTs, RLS `authenticated select via has_role('senior_admin')`, `service_role all`.
- Extend `orchestration_notification_dedupe(event, key, first_sent_at, expires_at)` with GRANTs + RLS to service_role.

### Files to add
- `supabase/functions/_shared/orchestration-rules.ts` — `pickAgent`, `applyRules`, `dedupeNotification`.
- `src/components/admin/task-orchestration/ReviewRulesDrawer.tsx`
- `src/components/admin/task-orchestration/TestConfigurationDialog.tsx`
- `src/components/admin/task-orchestration/drawers/EscalateTaskDrawer.tsx` (replaces dialog)
- `src/components/admin/task-orchestration/ExportScopePopover.tsx`

### Files to edit
- `AssignmentRulesPanel.tsx` — rename button, add queue selector, new fields (stale minutes, offline minutes, senior pool queue), open Review drawer.
- `AssignmentModeSelector.tsx` — add `least_loaded` and `skill_based`; ensure only one primary mode active.
- `AssignmentQuickActions.tsx` — self-assign gated on toggle + permission, export becomes popover.
- `OrchestrationSummaryCards.tsx` + `ProductivityInsights.tsx` — click handlers and tooltips.
- `admin-task-orchestration-action/index.ts` — pickAgent, dry-run test, escalate depth, export scopes, notification hooks, self-assign guard.
- `admin-task-orchestration-overview/index.ts` — surface `queue_scope`, dedup helpers for KPIs.
- `task-orchestration.service.ts` — new types (`ReviewRulesImpact`, `TestConfigResult`, `ExportScope`) and helpers.

### Out of scope
- Cron/worker deployment for background auto-escalation and offline reassignment. The RPCs and code paths land here; scheduling is a separate infra task.
- Redesign of the AgentDetailsDrawer Performance tab (only the entry point from insight cards is added).
