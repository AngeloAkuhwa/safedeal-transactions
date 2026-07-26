
# Task Orchestration — RBAC wiring + functional queue & controls

Two work streams:
1. **RBAC** — register all 14 permissions in Feature Registry, seed role grants, enforce end-to-end (sidebar → route → controls → edge functions → realtime).
2. **Operational depth** — turn the Unassigned Queue and Assignment Control Panel into a real workspace (rich filters, pagination, atomic bulk assign, reassign flow, preview-then-confirm auto assign, concurrency guards).

Current baseline (verified this turn):
- DB `permissions` table only holds `task_orchestration.view / assign / reassign / configure` — 10 keys are missing.
- Role grants seeded only for `dispute_manager` (view/assign/reassign) and `dispute_agent` (view). Super/Senior/Support/Finance/Compliance/Auditor have nothing.
- Route guard uses only `task_orchestration.view`; page-level gating uses a loose "hasAny([assign, rebalance, escalate, manage])" super-check.
- Queue lacks: status/stage/SLA/age/amount/team/required-role/date filters, pagination, "select all matching", sort controls, task-ID / dispute-ID / party search.
- Auto-Assign currently runs immediately (preview drawer wired last turn but no per-row exclusion). Reassignment flow, capacity-override warning, and bulk-assign result report are missing.

---

## 1. Permission registry & role grants (DB migration)

**Permissions to upsert into `public.permissions`** (module `task_orchestration`, mark `configure`/`rebalance`/`override_capacity`/`export` as `risk_level = high` and `requires_reason = true` where appropriate):

`view, view_all, view_assigned, assign, assign_self, bulk_assign, reassign, rebalance, escalate, manage_rules, export, view_agent_load, override_capacity, view_history`.

Keep the existing `task_orchestration.configure` key aliased to `manage_rules` (insert `manage_rules`, migrate any references, drop `configure` at the end of the migration).

**Role grants** (`role_permissions` upsert, idempotent):

| Role | Keys granted |
|---|---|
| super_admin | all 14 |
| senior_admin | view, view_all, assign, assign_self, bulk_assign, reassign, rebalance, escalate, view_agent_load, view_history, export, manage_rules* |
| dispute_manager | view, view_all (scoped dispute), assign, assign_self, bulk_assign, reassign, rebalance (team-scoped, enforced in edge fn), escalate, view_agent_load, view_history |
| dispute_agent | view, view_assigned, assign_self, escalate, view_history |
| support_agent | view, view_assigned, assign_self, escalate, view_history |
| finance_operator | view, view_assigned, assign_self, escalate |
| finance_approver | view, view_assigned, assign_self, escalate |
| compliance_officer | view, view_all (compliance scope), view_history, escalate, view_agent_load |
| auditor | view, view_all, view_history, view_agent_load, export |

`manage_rules` for senior_admin is granted but the Rules panel additionally reads `override_capacity` for emergency writes.

**Dependencies** (`permission_dependencies`): `view_all → view`, `view_assigned → view`, `bulk_assign → assign`, `reassign → assign`, `rebalance → view_agent_load`, `override_capacity → assign`, `manage_rules → view_all`.

Migration includes GRANTs on any new/updated table (none new; only inserts).

## 2. Enforcement layer

**Route guard**: extend `admin-route-permissions.ts` — keep `/admin/task-orchestration` gated by `view`. Add computed derived flags in a new `useOrchestrationPerms()` hook:

```
canViewAll, canViewAssignedOnly, canAssign, canAssignSelf, canBulk,
canReassign, canRebalance, canEscalate, canManageRules, canExport,
canViewAgentLoad, canOverrideCapacity, canViewHistory
```

Wire the hook into `AdminTaskOrchestration.tsx` and pass into every child (AssignmentControlPanel, UnassignedTaskQueue action column, AgentRoster, AssignmentRulesPanel, drawers). Buttons hidden or `disabled` per flag with a tooltip explaining the missing permission.

**Sidebar**: hide the Task Orchestration entry when the effective role has no `task_orchestration.view`.

**Edge-function enforcement** (`admin-task-orchestration-action`, `admin-task-orchestration-overview`):
- Replace the current single-perm map with per-action requirements matching the list above (e.g. `assign_selected` → `assign`+`bulk_assign` when >1 task; `assign_to_me` → `assign_self`; `rebalance` → `rebalance`; `save_rules` → `manage_rules`; `preview_*` → `view` + relevant action perm; `task_detail`/history → `view` and, when the caller only has `view_assigned`, the task must be assigned to them; `export` → `export`).
- Overview endpoint scopes returned tasks: `view_all` → global; `view_assigned` → only rows where `assigned_agent_id = auth.uid()`; dispute_manager → only tasks with `dispute_id IS NOT NULL`; compliance_officer → compliance tag/type filter.
- Every write path already writes to `admin_actions`; extend override paths (`override_capacity`, forced assign past capacity) to require a `reason` (>=10 chars) and log `before/after` snapshots.

**Realtime**: the `orchestration_tasks` channel already runs on the client with anon/authenticated key. Restrict payload usage on the client to what the same permission set would allow (filter incoming rows through the scoping helper) so a role change mid-session doesn't leak rows.

## 3. Unassigned Task Queue — full column set + filters + pagination

Extend `admin-task-orchestration-overview` return shape:
- Move queue from a single embedded array to `queue: { rows, total, page, page_size, filters_echo }`.
- Add columns per row: `case_ref` (dispute code or transaction code fallback), `stage`, `queue`, `team`, `required_permissions`, `sla_due_at`, `age_seconds`, `buyer_name`, `seller_name`, `assigned_agent_name`.

Server-side filters accepted: `q` (task_id / task_code / dispute_id / transaction_id / buyer / seller / assigned agent), `priority`, `type`, `queue`, `status`, `stage`, `sla_bucket` (on_track / at_risk / overdue), `age_bucket`, `amount_min`, `amount_max`, `team`, `required_role`, `created_from`, `created_to`, sort (`created_at | priority | sla_due | amount`, dir), `page`, `page_size` (25/50/100).

Frontend changes in `UnassignedTaskQueue.tsx` + `TaskQueueFilters.tsx`:
- New column layout: Select · Task ID · Case Ref · Type · Priority · Stage · Age · SLA Due · Amount · Suggested Agent · Queue · Action.
- Filter bar rebuild with all controls listed above + "Clear filters".
- Sort headers (click to toggle asc/desc).
- Footer: rows-per-page select, page navigator, result count "showing X-Y of N".
- Two-tier selection: "Select this page" checkbox + "Select all N matching" link that stores a `selectAllMatching` flag (server-side operations then run with the filter payload instead of an id list).
- Row click opens Task Details drawer (already built) instead of only Action button.

## 4. Assign Selected — enriched drawer + atomic assign

Extend the existing `AssignTaskDrawer`:
- Header lists all selected tasks (chips) with a "remove from batch" X.
- Agent list built from `roster + agent_skills + agent_capacity + task_assignment_history` (last 24h overdue count). Each row shows: availability dot + label, active/max, overdue, team, role badge, matching skills, `suggestion_score` (server-computed), and `eligibility_reason` (e.g. "matches all required permissions", "over capacity", "missing skill: refunds.process").
- Ineligible agents render greyed with reason, only selectable when caller has `override_capacity` (adds red "Override" pill + mandatory reason).
- Note field (optional, ≤500 chars).
- Warnings block above CTA aggregates capacity/conflict/permission issues.
- Confirm step: summarize N tasks → Agent X, reason, note.

Backend `assign` / `assign_selected` action:
- Wrap the loop in the existing atomic RPC (`assign_task`) but add an optimistic-lock check per task (`expected_version` map). On mismatch return `{status: "conflict", task_id, current_version}`.
- Return a structured result: `{assigned: [ids], failed: [{task_id, reason}]}` — front-end renders a per-row toast + drawer summary. No silent partial failures.
- Auditing (already present) extended with `override: true, override_reason` when capacity/permission override used.

## 5. Auto-Assign preview with per-row exclusion

Upgrade `AutoAssignPreviewDrawer` to a two-pane preview:
- Left: proposed assignments table (Task ID · Type · Priority · SLA · Agent · Reason) each with a checkbox (default on).
- Right: agent load table showing current vs projected load; highlights any agent whose projected load exceeds capacity.
- Below: "Unmatched tasks" list with per-row reason ("no eligible agent", "missing skill …", "all agents at capacity"), plus SLA/priority warnings.
- Confirm sends the filtered list (`plan: [{task_id, agent_id, reason}]`) to a new backend action `apply_auto_assign` which runs the same atomic assign per row and returns the same success/failed report.

## 6. Assign to Me guard

`assign_to_me` in the edge function verifies, in order:
1. `task_orchestration.assign_self`
2. Required permissions on the task all present on caller (missing → 403 with list)
3. Capacity: `current_active < max_active_tasks` — else return `capacity_exceeded` (front-end shows override warning; only proceeds if `override_capacity` present + reason)
4. Overdue limit (from `assignment_rules.config.per_agent_overdue_cap`, default 5)
5. Separation-of-duty check: same task not previously actioned by caller in a conflicting role (e.g. finance_operator cannot self-assign a task they created)

Frontend: "Assign to me" button becomes a small confirm popover when warnings exist; disabled entirely without `assign_self`.

## 7. Reassignment flow

New `ReassignTaskDrawer`:
- Trigger from Task Details drawer (visible when `canReassign` and task has `assigned_agent_id`).
- Fields: new agent (same eligibility list as Assign), **required** reason (≥10 chars), optional note.
- Impact preview: previous agent's projected load after removal, new agent's load after, SLA impact, whether the task is currently overdue.
- Backend `reassign` action: atomic (update + insert `task_assignment_history` with `from_agent_id, to_agent_id, reason, actor_id`), version-checked, writes an `admin_actions` audit row, and enqueues `task_notification` events for both agents (row into `notifications` table with `type = task_reassigned`).

## 8. Bulk assign result reporting

`assign_selected` and `apply_auto_assign` return:

```
{
  assigned:  [{task_id, task_code, agent_id}],
  skipped:   [{task_id, task_code, reason, code}]
}
```

Front-end shows a `BulkAssignResultDialog` after run: two tabs (Assigned N, Not assigned M) each with copy-to-clipboard and CSV export. Toast collapses to "N assigned · M skipped — view details".

## 9. Concurrency guards

- Every mutation accepts `expected_version` per task and returns `409 version_conflict` on mismatch (already partly implemented; extend to `assign_selected` per row and `reassign`).
- Overview push via existing realtime channel already refreshes; add a lightweight `task_locks` in-memory Set on the client so once a task returns `conflict` it flashes red for 3s in the queue.

## 10. Export

New action `export_queue` returning a signed URL from the existing background export builder pattern (Users/Transactions exports). Requires `export` permission. CSV columns = queue columns + assigned agent + full history summary.

---

## Technical details (dev-only reference)

Files touched:

Backend
- **New migration** — upsert 14 permissions, seed role grants, seed dependencies, migrate `configure → manage_rules`.
- `supabase/functions/admin-task-orchestration-overview/index.ts` — server-side filter/sort/pagination, scoped result set, enriched columns.
- `supabase/functions/admin-task-orchestration-action/index.ts` — per-action permission map, `apply_auto_assign`, `reassign`, `export_queue`, structured success/skip results, override/reason enforcement.

Frontend
- `src/hooks/useOrchestrationPerms.ts` (new).
- `src/services/task-orchestration.service.ts` — new payload shapes, action signatures.
- `src/pages/AdminTaskOrchestration.tsx` — replace hard-coded `isSenior` with the hook.
- `src/components/admin/task-orchestration/`:
  - `TaskQueueFilters.tsx`, `UnassignedTaskQueue.tsx` — full filter set, pagination, sort, two-tier selection, click-row.
  - `AssignmentControlPanel.tsx`, `AssignmentQuickActions.tsx` — button visibility per hook, disabled tooltips.
  - `drawers/AssignTaskDrawer.tsx` — enriched agent list, warnings, override, batch chips.
  - `drawers/AutoAssignPreviewDrawer.tsx` — two-pane, per-row exclusion, unmatched list.
  - `drawers/ReassignTaskDrawer.tsx` (new).
  - `drawers/BulkAssignResultDialog.tsx` (new).
- `src/components/admin/AdminSidebar.tsx` — hide entry without `view`.
- `src/services/admin-route-permissions.ts` — unchanged key, but consumed by more child routes if we split future sub-pages.

Rollout order: (1) DB migration → (2) hook + service types → (3) edge-function overview scoping + queue pagination → (4) action-level permission map + reassign + apply_auto_assign → (5) UI drawers/queue rewrites → (6) sidebar/route guard polish → (7) export.
