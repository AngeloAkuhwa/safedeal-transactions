# Agent Performance — fix "—" Avg Time and finish the six cards + Workload tab

## What the data says (verified)

- `orchestration_tasks` has **0 rows**. Every workload and timing metric on this screen is derived from tasks only, so Avg Resolution renders "—", Resolved is near-zero, and Overdue is always 0. This is a coverage gap, not a formatting bug.
- Real casework does exist elsewhere: 3 disputes (all resolved) with 3 matching `dispute_outcomes` rows, all resolved by the internal user `SafeDeal Admin`. Those resolutions currently feed only the "resolved" count, never the timing maths.
- `disputes` has no assignee, priority or SLA due column (only `opened_at`, `resolved_at`, `seller_response_due_at`), so dispute-derived SLA must come from the existing configured SLA rules, not invented per-case deadlines.
- 2 active internal users, both with capacity and availability rows; no assignment history.

## 1. Make metrics dispute-aware (fixes the dash)

Extend the `admin-agent-performance` function so each agent's metrics union two sources instead of one:

- **Orchestration tasks** — unchanged behaviour, used whenever tasks exist.
- **Dispute outcomes** — a resolved dispute is attributed to `resolved_by_user_id`, with elapsed time measured from the recognised investigation start (the dispute's assignment/first-action record when present, otherwise `opened_at`) to `dispute_outcomes.resolved_at`.

Exclusions applied to the timing set: still-open disputes, cancelled disputes, records missing either timestamp, and known invalid/test records. Where both a task and a dispute describe the same case, the case is counted once (dispute id de-duplication, already present for counts, extended to timings).

Avg Resolution then shows a real number, with the completed-case sample size in the existing tooltip. If the sample is genuinely zero, the card shows "—" plus "No completed cases" rather than a bare dash.

## 2. Summary cards — exact semantics

| Card | Rule |
| --- | --- |
| Active Agents | Eligible case-handling internal users with an active account, not suspended or deactivated, matching the team/role filters. Login state is never the test. |
| Open Disputes | Unresolved disputes matching current filters, split as "assigned / unassigned" in the sub-label. Resolved, closed and cancelled excluded. |
| Resolved | Cases whose **resolution/completion** timestamp falls in the selected range (never `updated_at`). Label follows the range: "Resolved · Last 7 Days" / "Last 30 Days" / "This Month". |
| Avg Resolution | As section 1, with sample-size tooltip. |
| Overdue Cases | Unresolved cases where now is past an **existing** SLA due date. Cases with no configured SLA are never counted or labelled overdue. |
| Top Agent | Highest-scoring eligible agent for the period, only when the minimum completed-case threshold is met; otherwise the card reads "Insufficient data" and is not clickable. |

### Card interactions

Each card sets page state and highlights itself: Active Agents → Workload filtered to active agents; Open Disputes → open work; Resolved → resolved work for the period; Avg Resolution → Performance tab; Overdue → **SLA Compliance tab pre-filtered to overdue**; Top Agent → that agent's details drawer. The resulting filters appear as removable chips with a Clear Filters action (chips already exist; the SLA-tab overdue wiring and the empty-state message when a card yields no rows are added here).

## 3. Workload tab — complete column set

Final columns: Rank, Agent, Role, **Availability**, Active, Waiting, Critical, Resolved, Avg Time, Overdue, Workload Status, Score, Actions. Availability becomes its own column (today it is only a subtitle under the agent name). On narrow screens the secondary values (Waiting, Critical, Avg Time, Escalations, Reassignments) collapse into an expandable row detail so the primary columns stay readable.

Workload Status keeps its seven states and continues to read the existing Task Orchestration capacity (`agent_capacity.max_active_tasks`) and availability configuration — no second capacity model.

## 4. Filters and table behaviour

Already in place: search by name/user ID/email, team, role, availability, workload status, case priority, case status, case SLA, date range, minimum active, minimum overdue, score range, Clear Filters, sorting, pagination, rows-per-page, result count, loading, empty and error states with Retry.

Remaining work: make the table header **sticky** while the body scrolls, keep the sticky page header from overlapping it, and surface a filter-aware empty state ("No agents match these filters — Clear Filters").

## 5. Row actions and permissions

- **View Detail** → Agent Details drawer.
- **View Cases** → deep-links to Task Orchestration filtered to that agent (currently opens a local drawer only); the drawer stays available as the quick preview.
- **Review SLA** → that agent's overdue and at-risk cases.
- **Rebalance** → opens the existing Task Orchestration Rebalance Preview; never reassigns from this screen.

Each action renders only when the signed-in administrator holds the matching existing permission (`task_orchestration.view` / `.assign` / `.rebalance`, `disputes.view`), instead of rendering disabled buttons for everyone.

## Technical notes

- Backend: `supabase/functions/admin-agent-performance/index.ts` — dispute-source metrics, SLA-configured overdue guard, range-aware resolved label, assigned/unassigned dispute split, Top Agent threshold.
- Frontend: `AgentPerformanceSummary.tsx` (card semantics and SLA-tab routing), `WorkloadTable.tsx` (availability column, expandable details, sticky header), `AdminAgentPerformance.tsx` (card → tab/filter wiring, permission-gated actions), `helpers.ts` (sticky header tokens).
- No schema change is required. Seeding demo orchestration tasks is deliberately not part of this plan — the fix makes real dispute data drive the numbers.
