# Agent Performance — functional summary cards + full Workload tab

## What changes

### 1. Summary cards become precise, filter-aware metrics

All six cards are recalculated in the `admin-agent-performance` edge function against the currently applied filters (team, role, availability, SLA, search, date range), so the cards and the table always agree.

- **Active Agents** — internal users who are eligible case handlers (hold a disputes / task-orchestration permission or have real casework history), have `status = active`, are not suspended/deactivated/on leave, and match the selected team + role filters. Being logged in never by itself makes someone an active agent; the live/presence count stays a separate line.
- **Open Disputes** — unresolved dispute work in scope: assigned dispute-backed cases plus unassigned open disputes, excluding resolved, closed and cancelled. A sub-note splits assigned vs unassigned.
- **Resolved This Period** — counted from the recorded resolution/completion timestamp (`orchestration_tasks.resolved_at`, `dispute_outcomes.resolved_at`), never from a last-updated date. The card label follows the selected range ("Resolved This Week" / "Last 30 Days" / "This Month" / custom).
- **Avg Resolution** — mean of (recognised investigation start → final resolution) across completed cases only. Excludes open cases, cancelled cases, invalid/test records, records missing either timestamp, and negative durations. A tooltip shows "based on N completed cases"; when N is 0 the card reads "—" with "No completed cases".
- **Overdue Cases** — unresolved cases where `now > due_at` (or SLA status already overdue/breached). Cases with no SLA due date are never labelled overdue.
- **Top Agent** — highest score among eligible agents that meet a minimum completed-case threshold. Below the threshold the card shows **"Insufficient data"** and is not clickable.

### 2. Card interactions + active-filter chips

Clicking a card applies a named filter and jumps to the right tab:

| Card | Action |
| --- | --- |
| Active Agents | Workload tab, filtered to active agents |
| Open Disputes | Workload tab, case-status filter = open work |
| Resolved This Period | Performance tab scoped to the selected period |
| Avg Resolution | Performance tab |
| Overdue Cases | SLA Compliance tab, overdue-only on |
| Top Agent | Opens that agent's Agent Details drawer |

A chip row under the cards shows every active filter (whether set by a card or the filter panel), each chip individually removable, plus a single **Clear Filters** action. The card that produced the current filter is visually marked as selected.

### 3. Workload tab — full operational table

Columns: Rank, Agent, Role, Availability, Active Cases, Waiting Cases, Critical Cases, Resolved, Average Resolution Time, Overdue, Workload Status, Score, Actions. On narrow widths the secondary values (Waiting, Critical, Avg Time) collapse into an expandable row detail; the primary columns always remain visible.

**Workload Status** — Available, Normal, Near Capacity, At Capacity, Overloaded, Offline, On Leave — derived from the existing Task Orchestration capacity and availability configuration (`agent_capacity.max_active_tasks`, current active count, `agent_availability.status`). No second capacity calculation is introduced; the derivation is extracted into one shared helper used by both screens.

**Filters** (panel + chips): search by agent name / user ID / email, team, role, availability, workload status, case priority, case status, SLA status, date range, minimum active-case count, minimum overdue count, score range, Clear Filters.

**Table behaviour**: sorting on every numeric column, pagination with rows-per-page selection (10/25/50/100), result count ("Showing X–Y of Z agents"), sticky table header, loading state, empty state, error state with Retry.

**Row actions** — each rendered only when the signed-in administrator already holds the matching existing permission, otherwise hidden:
- View Detail → Agent Details drawer
- View Cases → Task Orchestration / Disputes with that agent applied as a filter
- Review SLA → that agent's overdue and at-risk cases
- Rebalance → the existing Task Orchestration Rebalance Preview via deep link; never an immediate reassignment from this screen

## Technical notes

- `supabase/functions/admin-agent-performance/index.ts`: rework summary computation (filter-aware counts, resolution-timestamp sourcing, completed-case count for the tooltip, top-agent data threshold), add per-agent `waiting_cases`, `critical_cases`, `workload_status`; accept the new filter keys plus `sort`, `dir`, `page`, `page_size` and return `total` alongside the page slice.
- `src/services/agent-performance.service.ts`: extend `AgentPerformanceFilters`, `AgentPerformanceRow` and `AgentPerformanceSummaryData`; return pagination metadata.
- New files: `workloadStatus.ts` (shared derivation), `ActiveFilterChips.tsx`, `TablePagination.tsx` under `src/components/admin/agent-performance/`.
- Updated: `AgentPerformanceSummary.tsx`, `AgentPerformanceFilters.tsx`, `WorkloadTable.tsx`, `AdminAgentPerformance.tsx` for new fields, selection state and permission-gated actions.
- Row-action permissions read from the existing `permissions` payload (`task_orchestration.*`, `disputes.*`) — no new permission keys.
- Existing glass-morphism tokens (`CARD_CLASS`, `INNER_CARD_CLASS`) reused; no visual system changes.