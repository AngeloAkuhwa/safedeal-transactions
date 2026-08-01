# Resolved counts: dashboard vs drawer

## Why the numbers differ

They answer two different questions. Confirmed in `admin-agent-performance`:

- **Dashboard card / workload row "Resolved"** counts only cases resolved **inside the selected date range** (7d, 30d, month, custom) that also pass the active **case filters** (priority, status, SLA). Dispute-only resolutions are deduped against the agent's resolved tasks so a case is never counted twice.
- **Drawer (`mode: "agent_cases"`)** ignores the date range and every filter. It pulls **all tasks ever assigned to that agent** (latest 200) plus **all disputes they ever personally resolved** (latest 200), then splits them into Active / Resolved in the UI.

So the drawer's "Resolved (n)" is an all-time number while the card is a windowed number. Three smaller drifts sit on top of that:

1. The drawer dedupes disputes against tasks *currently assigned* to the agent; the dashboard dedupes against the agent's *resolved-in-window* tasks. Different overlap sets.
2. The drawer drops a dispute row when the parent `disputes` record can't be loaded; the dashboard still counts that outcome.
3. The drawer's two 200-row caps silently truncate busy agents; the dashboard reads the full task set.

## Fix

Introduce one shared scope control so the dashboard, the workload rows and the drawer always count the same set — and let that scope be either the selected time frame or all time.

### A. Scope toggle on the dashboard

- Add an **"In range" / "All time"** segmented toggle next to the range selector in `AgentPerformanceFilters`, backed by a new `scope: "range" | "all_time"` filter that defaults to `range`.
- When **All time** is selected, the range dropdown is disabled and greyed, and the header shows an "All time" pill so the reading is unmistakable.
- The toggle drives everything at once: the six summary cards, the workload table's Resolved / Avg resolution / delta columns, the trend chart, exports and the drawer. There is never a mixed state.
- Server-side, `scope: "all_time"` widens the window to `[epoch, now]` and suppresses period-over-period deltas (no meaningful previous window), so delta chips render as "—" instead of a misleading percentage.
- `resolved_label` returns "All time" so every card and drawer header inherits the correct wording with no extra plumbing.
- The choice persists in the URL query (`?scope=all_time`) so a shared link reproduces the exact view.

### B. Align the drawer with the card

1. **Pass the scope, window and filters to the drawer.** `fetchAgentCases` sends `scope`, `range` / `date_from` / `date_to` plus `case_priority`, `case_status`, `case_sla`. The edge function resolves the range exactly as the dashboard branch does.
2. **Apply window semantics server-side.** A case is *Resolved* only when its `resolved_at` falls in the window and it passes the same `caseMatch` filter. Active cases stay window-independent — open work is open now, which is how the card's Active figure is computed.
3. **Reuse the dashboard's dedupe rule.** Build the covered-dispute set from the agent's resolved-in-window tasks, matching `buildRow`, so one dispute never appears as both a task row and a dispute row.
4. **Include orphan outcomes.** When the parent `disputes` row is missing, still emit a row from the outcome data instead of dropping it.
5. **Remove the silent truncation.** Raise the caps and return a `truncated` flag; the drawer renders a "showing first N" note if it ever trips.
6. **Label the drawer.** Header reads `Resolved (n) · <range label>` and inherits the dashboard scope, with a local scope toggle that mirrors the dashboard control for one-off widening without leaving the drawer.
7. **Reconciliation guard.** A dev-only check asserts the drawer's windowed resolved count equals the row's `resolved_in_window`, so future drift surfaces immediately.

## Technical notes

- Files: `supabase/functions/admin-agent-performance/index.ts` (`resolveRange` gains an all-time branch; agent_cases branch), `src/services/agent-performance.service.ts` (`scope` on the filters type and defaults, `fetchAgentCases` signature, `truncated`), `src/components/admin/agent-performance/AgentPerformanceFilters.tsx` (segmented toggle), `AgentPerformanceSummary.tsx` and `WorkloadTable.tsx` (label + suppressed deltas), `drawers/AgentCasesDrawer.tsx` (scope label, toggle, truncation note), `src/pages/AdminAgentPerformance.tsx` (URL sync, passes filters to the drawer).
- All-time queries read the full task and outcome tables; the existing indexes on `resolved_at` and `assigned_agent_id` cover this, and results stay capped and paginated.
- No schema changes and no new permissions; the existing `agent_performance.view` gate stays.