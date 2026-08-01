# Agent Performance — make resolved disputes visible & finish the card/workload spec

## What is actually wrong

Confirmed from the live database and the code:

- There are **0 orchestration tasks**, but **3 disputes** with **3 dispute outcomes**, all with a resolving agent recorded (latest 26 Jul 2026).
- The summary cards and workload rows now count those dispute resolutions, but the **case drawers still read only `orchestration_tasks`**. With that table empty, every "View Cases" / "Review SLA" drawer shows no cases even though the agent shows resolved work. That is the "I can't see the resolved dispute" symptom.
- The `disputes` table has no assignee or priority column, so a dispute-backed case row must derive its agent from `dispute_outcomes.resolved_by_user_id` and its SLA from platform settings, not from per-case fields.

## Fix 1 — dispute-backed cases in the drawers (root cause)

Rework the `agent_cases` mode of the agent performance function to return a **union**:

- Orchestration tasks assigned to the agent (as today), plus
- Disputes the agent resolved (via `dispute_outcomes.resolved_by_user_id`) that have no task record.

Each dispute-backed row is normalised to the same shape as a task row:

| Field | Source |
|---|---|
| Case ref | `DSP-<short dispute id>` |
| Title | dispute reason + transaction reference |
| Status / stage | dispute status (resolved, under review, …) |
| Opened | `disputes.opened_at` |
| Resolved | `dispute_outcomes.resolved_at` |
| Outcome | outcome type + decision summary |
| Amount | refund / release amount |
| Source badge | "Dispute" vs "Task" so operators know where the record came from |

Drawer changes:
- Group the list into **Active** and **Resolved in range**, so resolved dispute work is visible instead of being filtered out of an "active workload" list.
- SLA review mode keeps only overdue/breached rows and states plainly when a dispute has no configured SLA.
- Deep links: task rows open Task Orchestration, dispute rows open the dispute record.

## Fix 2 — summary cards: remaining semantics

- **Resolved this week**: add a real `week` range option (current calendar week) alongside 7d / 30d / month / custom, with the card sub-label synced to the selected range.
- **Open disputes**: card click switches to Workload with case status = open; sub-label keeps the assigned / unassigned split.
- **Average resolution**: extend the sample tooltip to state how many samples came from disputes vs tasks, so a small number is explainable.
- **Top agent**: unchanged (minimum-cases threshold, "Insufficient data" is non-clickable).
- **Active agents / Overdue**: unchanged; both already drive filters and the clear action.

## Fix 3 — Workload tab leftovers

- Search that matches agent name, email **and user ID**.
- "View Cases" for an agent with only dispute work opens the drawer's resolved group rather than an empty list.
- Result count line above the table (Showing X of Y agents).

## Technical notes

- Backend: `supabase/functions/admin-agent-performance/index.ts` — extend `agent_cases` mode with the dispute union, add the `week` range key, add sample provenance to the summary payload.
- Service: `src/services/agent-performance.service.ts` — widen `AgentCaseRow` with source, outcome, opened_at and a case-ref field.
- UI: `AgentCasesDrawer.tsx` (grouping, source badges, deep links), `AgentSLADrawer.tsx` (no-SLA copy), `AgentPerformanceFilters.tsx` (week range, search hint), `AgentPerformanceSummary.tsx` (tooltip provenance), `WorkloadTable.tsx` (result count).
- No database migration required; the data already exists in `disputes` and `dispute_outcomes`.