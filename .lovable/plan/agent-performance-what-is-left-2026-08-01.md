# Agent Performance — what is left

The 12-point gap list from the previous plan is implemented: server-side SLA filtering and paging, dispute-only rows, scope-aware SLA summary, corrected Paused mapping, assigned-vs-completed and split SLA trend charts, tooltips and sample sizes, drawer paging, `AgentSLADrawer.tsx` deleted, and a test file under `__tests__/agent-performance.test.ts`.

Two areas from your latest message are **not** done.

## 1. Rankings tab — transparent scoring

Current state (confirmed in the edge function and `RankingsTable.tsx`): a single hidden formula `sla*0.4 + speed*0.25 + overdue*0.2 + escalation*0.15`, bands at 97/93/85, no sample-size gate, no penalties model, no exclusions, no breakdown surfaced anywhere. The rankings filters reuse the shared filter bar only — no minimum-completed-cases or performance-level control.

Work:
- **Backend scoring rewrite** in `admin-agent-performance`: return a `score_breakdown` per agent with, for each component (SLA compliance, resolved workload normalised, avg first action, avg resolution, overdue rate, reopened rate, escalation accuracy — only metrics already tracked): weight, raw value, normalised value, contribution. Normalise workload log-scale so volume alone cannot dominate.
- **Penalties**: overdue cases, repeated SLA breaches, reopened cases, and quality/reassignment penalties only where that data exists. Explicitly exclude from penalties: waiting on buyer/seller, authorised paused, awaiting external evidence, manager-initiated rebalance reassignments, and cases with no configured SLA — each excluded case recorded with its reason.
- **Bands**: Excellent / Very Good / Good / Needs Attention, plus `insufficient_data` when completed cases are below the configured minimum sample size (default configurable, filter-driven).
- **Filters**: accept `min_completed` and `performance_level`; team, role and date range already exist.
- **UI**: rankings-only filter row (min completed cases, performance level), sample-size column so a 1-case agent is visibly not comparable, "Insufficient Data" state instead of a score, and a **Score breakdown dialog** on score click showing components, weights, raw vs normalised values, penalties applied, cases included, cases excluded and exclusion reasons. No manual score editing.

## 2. Agent Details drawer — tabbed rebuild

Current `drawers/AgentDetailsDrawer.tsx` is a single flat panel (stats grid, capacity bar, skills, three buttons). Required: six tabs.

- **Overview** — name, avatar, user ID, role, team, status, availability, active workload, capacity, last active, reporting manager when available.
- **Current Workload** — table of task/dispute ref, type, priority, stage, status, assigned date, SLA due, last updated, action.
- **Performance** — score + breakdown, resolved, avg first action, avg resolution, SLA compliance, overdue rate, current-period trend, previous-period comparison.
- **SLA** — on-track, at-risk, breached, completed within, completed outside.
- **Case History** — historical assignments and outcomes for the selected range (paged, reusing the cases endpoint).
- **Activity** — operational actions from audit/task history, no authentication-sensitive fields.

Contextual actions: View Current Cases, View Overdue Cases, Open Task Orchestration, View User in Users & Access, View Audit History, Rebalance Workload (opens the Task Orchestration preview flow, moves nothing). No role or permission editing in this drawer.

## Technical notes

- Backend: extend `admin-agent-performance` with `score_breakdown`, penalty/exclusion arrays, `min_completed` / `performance_level` filters and an agent-detail payload (workload rows, SLA counts, activity events); bump `contract_version` to 4.
- Service: extend `AgentPerformanceRow` and filters, add types for breakdown, exclusions and the detail payload.
- UI: new `RankingsFilters.tsx` and `ScoreBreakdownDialog.tsx`; split the details drawer into `drawers/agent-details/` tab components to keep files small.
- Tests: scoring normalisation, penalty exemptions, insufficient-data gating, and band boundaries.
