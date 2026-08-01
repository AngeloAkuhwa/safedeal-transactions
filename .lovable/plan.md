# Agent Performance — all-time reconciliation and complete analytics plan

## Confirmed current state

- The UI already sends `scope: "all_time"`, persists it as `?scope=all_time`, disables the range selector, and passes the scope into exports and case drawers.
- The backend already has an all-time range branch and combines completed orchestration tasks with personally resolved dispute outcomes.
- The current database contains **0 orchestration tasks** and **3 historical dispute outcomes**, all resolved by one internal user. Therefore task-only metrics such as first action and SLA cannot currently produce a real value; they must show an explicit unavailable/not-tracked state.
- Two correctness defects remain in the current aggregation:
  - completed tasks with no `due_at` are counted as on-time, which can produce false 100% SLA compliance;
  - all-time trend buckets still calculate a “previous period” resolution series even though all-time has no meaningful comparison window.
- The current “Review SLA” action opens a separate drawer. It does not open the SLA Compliance tab with the selected agent and At Risk + Overdue/Breached filters as required.

## 1. Make range and all-time one canonical analytics contract

- Centralize resolved-case identity, date-window membership, case filters, and task/dispute deduplication inside the backend function so summary cards, agent rows, trends, exports, SLA rows, and drawers consume the same scoped result set.
- For `scope=all_time`, derive the effective start from the earliest qualifying task assignment/resolution or dispute outcome/open date instead of exposing the Unix epoch as an analytics boundary.
- Return explicit scope metadata: requested scope, applied scope, resolved label, effective dates, granularity, and whether comparison data is available.
- Suppress every previous-period value and delta in all-time mode, including chart series and agent-row comparison fields.
- Keep active work window-independent, but constrain resolved, assigned, started, escalated, and reassigned events to the effective range when range mode is selected.
- Use the same covered-dispute set for the dashboard and drawer. Preserve orphan outcomes as resolvable rows and return count/cursor metadata rather than silently truncating results.
- Add a response-contract/version check so a stale deployed function produces a clear reload/error state instead of silently showing a selected 7-day label for an all-time request.

## 2. Reconcile dashboard, workload, drawer, and export counts

- Pass the complete active filter set into the agent case request: scope, date range, team, role, priority, status, SLA state, stage, and selected agent.
- Return server-calculated active and resolved totals with the drawer response; display `Resolved (n) · All time` or the exact range label.
- Keep the drawer’s local In range / All time switch, but clearly mark it as a local override and reset it when the drawer closes or the selected agent changes.
- Replace fixed “first 1,000” behavior with backend pagination and a visible result count; no busy agent should silently lose historical cases.
- Add development reconciliation assertions comparing each agent row’s resolved count with the same agent/scope/filter count returned by the case endpoint.
- Ensure exports use the same canonical scoped rows and include the applied scope/range in the audited export metadata and filename.

## 3. Complete the Performance summary with real data only

- Calculate and display: assigned, started, resolved, escalated, reassigned away, resolution rate, average first-action time, average resolution time, SLA compliance, and overdue rate.
- Define every event metric by its own event timestamp rather than task creation time.
- Keep dispute outcomes in resolved counts and resolution-time samples, deduped against task-backed disputes.
- Show **“Not currently tracked”** for reopened cases because no reopened transitions currently exist and for quality review because the existing review table has no score/result field and currently contains no records.
- Include sample sizes and data-source coverage in metric tooltips, especially for averages and dispute-only fallback calculations.
- Never default SLA compliance to 100% when there are zero configured/completed SLA samples; return `null` and render “No tracked cases.”

## 4. Correct and finish the Performance visuals

- Resolved Cases Trend: group by day/week/month according to the effective range and use the canonical deduped resolved set.
- Average Resolution-Time Trend: compare current and previous comparable buckets only in range mode; all-time shows the lifetime series with no comparison line.
- SLA Compliance Trend: plot compliant, at-risk, and breached counts/rates separately; exclude Not Configured and Paused from the denominator.
- Workload vs Completion: compare cases assigned in each bucket with cases completed in that bucket, not current active load versus lifetime resolution.
- Status Distribution: use mutually exclusive active, waiting, escalated, overdue, and resolved buckets so one case cannot appear twice.
- Agent Comparison: compare selected/filtered agents using workload, priority/complexity mix, SLA, overdue, escalation, reassignment, and quality/reopen data only when available. Do not imply that raw resolved volume alone means “best.”
- Add a calculation-info tooltip and a data-source/sample note to every chart, preserve zero baselines where meaningful, avoid clipped or misleading axes, and provide chart-specific empty states.

## 5. Build a correct SLA analytics model from existing configuration

- Use existing task `due_at`, `sla_status`, timestamps, and configured timeout rules; do not create new SLA definitions.
- Map cases to: On Track, At Risk, Breached, Paused, Not Configured, Completed Within SLA, Completed Outside SLA, and Cancelled.
- Treat missing/invalid due dates as **Not Configured** and exclude them from compliance, breach, and on-time denominators.
- Preserve the backend’s explicit SLA state when valid; derive At Risk from remaining configured duration only when needed.
- Define Paused from waiting states only where the existing workflow treats the SLA clock as paused; otherwise keep the real stored state rather than assuming every waiting case is paused.
- Return dedicated SLA summary data: total SLA-tracked, On Track, At Risk, Breached, average first action, average resolution, compliance percentage, completed within/outside, paused, and not configured.

## 6. Complete the SLA Compliance tab

- Add summary cards for all requested SLA metrics, with “No tracked cases” rather than a false percentage when the denominator is zero.
- Keep the sticky case table and expose: agent, task/dispute ID, priority, stage, assignment, first action, due date, remaining/overdue duration, state, last update, and actions.
- Add URL-backed filters for agent, team, role, priority, stage, multiple SLA states, and date range/scope. Apply them server-side so counts and rows stay aligned.
- Add permission-gated actions: View Case, View Agent, Escalate, Rebalance through Task Orchestration, and View Timeline. Do not mutate assignment directly from this table.
- Gate Escalate with the actual orchestration escalation permission rather than general case-view access; gate Rebalance independently.
- Route dispute-only rows to the dispute investigation view and task rows to Task Orchestration.
- Replace the separate SLA classification logic in the agent drawer with the same backend SLA states and summary calculations used by the tab.

## 7. Implement the Review SLA deep link

- Change every Review SLA entry point to open the SLA Compliance tab, not a separate drawer.
- Apply the selected agent and a multi-state filter containing At Risk plus Breached/Overdue, while preserving the current scope and date range.
- Persist the investigation state in the URL so refresh/share reproduces it.
- Scroll/focus the SLA results after navigation and retain a direct View Agent action from the table.

## 8. Verification and deployment

- Add focused tests for range vs all-time, task/dispute deduplication, orphan outcomes, no-due-date handling, empty SLA denominators, all-time comparison suppression, pagination, and Review SLA URL restoration.
- Validate against the current sparse dataset: All time must show the 3 real dispute outcomes for their resolver; task-only and SLA values must remain unavailable because there are currently no orchestration task records.
- Add fixture-based checks with task-backed cases covering every SLA state, previous-period comparisons, reassignment, escalation, and mixed task/dispute resolution.
- Verify dashboard cards, workload rows, drawers, charts, SLA table, exports, and URL state at desktop and mobile widths.
- Deploy the updated backend function, then perform a live response check confirming `scope=all_time`, `range.label="All time"`, no previous-period series, and matching resolved counts across all surfaces.

## Technical scope

- Backend: `supabase/functions/admin-agent-performance/index.ts` plus small shared aggregation helpers if extraction improves consistency.
- Service contract: `src/services/agent-performance.service.ts`.
- Page/state: `src/pages/AdminAgentPerformance.tsx`.
- UI: filters, summary, workload table, Performance metrics/charts, SLA Compliance table, case drawer, and SLA/detail entry points under `src/components/admin/agent-performance/`.
- No new SLA definition, permission, or synthetic performance data will be introduced. A schema migration is only needed if later product requirements choose to formally track quality scores or reopened-case events.