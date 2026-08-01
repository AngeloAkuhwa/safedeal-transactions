# Agent Performance — what's left to reach 100%

The screen is live at `/admin/agent-performance` with the real backend, guarded by the existing `agent_performance.view` / `agent_performance.export` permissions, and it reuses the admin shell, roles, disputes, orchestration tasks and assignment history. Nine items remain before the port matches the brief exactly.

## 1. Dead actions (highest priority)

Three controls currently navigate or render but do nothing on arrival:

- **Rebalance** sends the user to `/admin/task-orchestration?rebalance=1&agent=<id>`, but the Task Orchestration page never reads those parameters, so nothing opens.
- **Case rows** in the cases drawer link to `/admin/task-orchestration?task=<id>`; that parameter is also unread.
- **Notification bell** always renders without the unread dot because no count is passed in.

Fix: teach Task Orchestration to read `task` and `rebalance`/`agent` on mount (open the task drawer, or run the rebalance preview pre-scoped to that agent), and wire the bell to the existing admin notification count used elsewhere.

## 2. Missing dedicated SLA drawer

The brief lists `AgentSLADrawer` as its own component. Today SLA review reuses the cases drawer with an `slaOnly` flag and only shows a filtered case list.

Fix: add a real SLA drawer showing on-time / overdue / breached counts, compliance percentage, the SLA target versus actual per case, hours past due, escalation level, and links to each case.

## 3. Component naming parity

Rename to the names the brief specifies so the folder reads as requested:

- `AgentPerformanceDetailDrawer` -> `AgentDetailsDrawer` (namespaced inside the agent-performance folder so it does not clash with the orchestration drawer of the same name)
- `ExportReportDialog` -> `ExportPerformanceDialog`

## 4. Open Disputes card accuracy

The card falls back from task-derived open cases to a global dispute count, so the number can silently change meaning. It also routes to the unfiltered dispute list.

Fix: always report open dispute-type work assigned to the agents in scope, show the fallback as a separate caption, and deep link into the dispute queue filtered to open and assigned.

## 5. Role filter scope

The role dropdown lists every internal role, including non-operational ones that can never appear in the table.

Fix: restrict the facet to roles that actually qualify an agent for this screen (the same eligibility rule the backend uses).

## 6. Metric fidelity

Two calculations are approximations:

- Escalations are counted from task creation date rather than when the escalation happened.
- Reassignments count only moves away from the agent, ignoring moves toward them.

Fix: derive both from `task_assignment_history` and escalation events inside the selected window, and show "received" and "handed off" separately in the detail drawer.

## 7. Table sorting

Workload, Performance and SLA tables are fixed to score order. The reference behaviour lets an operator sort by the column that matters.

Fix: add sortable headers on active cases, resolved, average time, overdue and score, with rank staying a stable computed position.

## 8. Accessibility and tooltip pass

Add the remaining accessible labels and explanatory tooltips: score formula on every tab (not just Workload), capacity meter descriptions, `aria-sort` on sortable headers, `aria-live` on the live-agent chip, and keyboard focus rings on the ranking cards.

## 9. Visual verification

The preview session is signed out, so the finished screen has never been rendered against the reference screenshot. After sign-in, capture the page and diff it against the supplied design for spacing, card heights, badge colours and table density, then correct the differences.

## Technical notes

- No new tables, roles, permissions, statuses or seed data. Every item above uses `internal_users`, `internal_user_roles`, `internal_roles`, `role_permissions`, `agent_availability`, `agent_capacity`, `agent_skills`, `orchestration_tasks`, `task_assignment_history`, `dispute_outcomes` and `disputes`.
- Changes land in `supabase/functions/admin-agent-performance/index.ts` (facets, escalation and reassignment windows, open-dispute scoping, SLA drawer payload) plus the components under `src/components/admin/agent-performance/` and `src/pages/AdminTaskOrchestration.tsx` for the deep-link handlers.
- Export stays audit logged through `logAdminAction` with the mandatory reason and PII masking already in place.
