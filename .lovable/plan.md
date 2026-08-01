# Agent Performance — All-time fix, Performance tab, SLA Compliance tab

## 1. Why "All time" still shows Last 7 Days

The client already sends `scope`, and the edge function source already has the all-time branch (`resolveRange` returns `label: "All time"`, `allTime: true`). But the screenshot shows `Range: Last 7 Days`, `Resolved · Last 7 Days`, and `Active Agents +2 this period` — under all-time the roster note would read "All-time roster". That combination points at a deployed `admin-agent-performance` build that is behind the repo.

This diagnosis is unconfirmed, so step one is to call the function directly with `scope: "all_time"` and inspect `resolved_label` / `range.key`:

- If the response says "Last 7 Days" → redeploy `admin-agent-performance` and re-check.
- If the response is correct → the bug is client-side: the `rangeLabel` passed into the summary/header comes from local filter state instead of `data.range.label`; switch both to the server label.

Also in this step:
- Header shows an "All time" pill and the range dropdown stays disabled/greyed.
- Summary, workload table and drawer all inherit `resolved_label` — never a locally derived label.
- Delta chips render "—" when the server returns `null`.
- Exports and the trend chart carry `scope`, so there is never a mixed window.

## 2. Drawer / dashboard reconciliation

The scope toggle, filter pass-through, dedupe reuse, orphan outcomes, raised caps + `truncated` flag and drawer scope label are already implemented. Remaining:
- Verify end-to-end after the redeploy that the drawer's windowed Resolved equals the workload row's Resolved for the same agent, in both scopes.
- Add the dev-only reconciliation warning when the two disagree.

## 3. Performance tab (real data only)

Replace the current three-card + single-line-chart view with a full panel driven by the same filters and scope.

Summary metrics: cases assigned, started, resolved, escalated, reassigned away, resolution rate, avg first-action time, avg resolution time, SLA compliance rate, overdue rate. Reopened cases and quality-review results render "Not currently tracked" unless a real source exists — no placeholder numbers.

Visuals (each with title, calculation tooltip, empty state, non-misleading axis):
- Resolved cases trend — bucketed day / week / month from the selected range (all-time buckets monthly).
- Avg resolution-time trend — current vs previous comparable period; comparison series omitted under all-time.
- SLA compliance trend — compliant / at-risk / breached.
- Workload versus completion — assigned vs completed per agent.
- Status distribution — active, waiting, escalated, overdue, resolved.
- Agent comparison — selected agents over the same range.

Interpretation: the tab never labels the highest resolved count as "best". Ranking context shows workload, priority mix, SLA performance, escalations and overdue alongside volume, with a note that resolved volume alone is not performance.

## 4. SLA Compliance tab

Reuse the existing SafeDeal SLA/due-date configuration — no new SLA definitions.

Summary strip: total SLA-tracked cases, on track, at risk, breached, avg first-action time, avg resolution time, compliance %.

States mapped from current data: On Track, At Risk, Breached, Paused, Not Configured, Completed Within SLA, Completed Outside SLA. A case with no SLA definition or due date is "Not Configured" — never counted as compliant or breached.

Case-level table (the existing per-agent view stays above it as a roll-up): Agent, Dispute/Task ID, Priority, Current Stage, Assigned Date, First Action, SLA Due, Time Remaining or Overdue, Status, Last Updated, Action.

Filters: agent, team, role, priority, stage, SLA status, date range — shared with the page filter bar.

Actions: View Case, View Agent, Escalate (only where already permitted), Rebalance via Task Orchestration, View Timeline. No direct assignment edits from this table.

"Review SLA" on a workload row opens this tab with that agent applied, Overdue + At Risk selected, and the current date range/scope preserved.

## Technical notes

- `admin-agent-performance` gains an `sla_cases` mode (case-level rows honouring the same range/filters) and extends the overview payload with the performance metric block plus multi-series trend buckets. `resolveRange` and the shared case filter are reused so every tab counts the same set.
- New components under `src/components/admin/agent-performance/`: `PerformanceSummaryGrid.tsx`, chart components, `SLASummaryStrip.tsx`, `SLACaseTable.tsx`. `PerformanceDashboard.tsx` and `SLAComplianceTable.tsx` are refactored to compose them.
- `agent-performance.service.ts` gains SLA case types and a fetcher; `AdminAgentPerformance.tsx` syncs tab and SLA-status filters to the URL alongside `scope`.
- No schema changes and no new permissions; the `agent_performance.view` gate stays.