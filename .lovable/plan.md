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

Make the drawer speak the same language as the card, and label it so the two can't be confused.

1. **Pass the window and filters to the drawer.** `fetchAgentCases` sends the active `range` / `date_from` / `date_to` plus `case_priority`, `case_status`, `case_sla`. The edge function resolves the range exactly as the dashboard branch does.
2. **Apply window semantics server-side.** A case is *Resolved* only when its `resolved_at` falls in the window and it passes the same `caseMatch` filter. Active cases stay window-independent — open work is open now, which is how the card's Active figure is computed.
3. **Reuse the dashboard's dedupe rule.** Build the covered-dispute set from the agent's resolved-in-window tasks, matching `buildRow`, so one dispute never appears as both a task row and a dispute row.
4. **Include orphan outcomes.** When the parent `disputes` row is missing, still emit a row from the outcome data instead of dropping it.
5. **Remove the silent truncation.** Raise the caps and return a `truncated` flag; the drawer renders a "showing first N" note if it ever trips.
6. **Label the drawer.** Header reads `Resolved (n) · <range label>`, with an "All time" toggle so the wider view is one click away and is clearly marked as a different scope.
7. **Reconciliation guard.** A dev-only check asserts the drawer's windowed resolved count equals the row's `resolved_in_window`, so future drift surfaces immediately.

## Technical notes

- Files: `supabase/functions/admin-agent-performance/index.ts` (agent_cases branch), `src/services/agent-performance.service.ts` (`fetchAgentCases` signature, `truncated`), `src/components/admin/agent-performance/drawers/AgentCasesDrawer.tsx` (range label, all-time toggle, truncation note), plus the call sites that open the drawer so they pass the current filters.
- No schema changes and no new permissions; the existing `agent_performance.view` gate stays.