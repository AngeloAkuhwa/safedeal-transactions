# Agent Performance & Dispute Operations — full port

Replace the "Coming soon" placeholder at `/admin/agent-performance` with a fully functional screen that mirrors the supplied HTML, built entirely on existing SafeDeal data. No new roles, no new permissions, no separate portal, no seeded agents.

## What already exists (verified)

- Route `/admin/agent-performance` is registered and permission-gated on `agent_performance.view`; `agent_performance.view` and `.export` already exist in the permissions catalog and DB. Nothing new to register.
- Sidebar entry exists and is marked as a built route.
- Agent-side data already lives in `internal_users`, `internal_user_roles` / `internal_roles`, `agent_availability` (status, last_heartbeat), `agent_capacity` (max_active_tasks, current_active, overdue_count, avg_first_action_seconds, resolved_today), `agent_skills`.
- Case data lives in `orchestration_tasks` (assigned_agent_id, status, stage, sla_status, due_at, first_action_at, resolved_at, escalation_level, reassignment_count, dispute_id, transaction_id, queue, team), `task_assignment_history`, `task_status_history`, `disputes`, `dispute_outcomes` (`resolved_by_user_id`).
- Current data volume is small (2 internal users, 3 disputes, 0 orchestration tasks), so empty states and zero-safe math matter as much as the happy path.

## Backend

New edge function `admin-agent-performance` (CORS + `requirePermission("agent_performance.view")`, matching the existing admin function pattern), returning one payload for the whole screen:

- **Agent eligibility** — internal users with `status = 'active'` whose effective permissions (via `internal_effective_permissions`) include dispute/task handling rights, or who have any assignment history in `orchestration_tasks` / `task_assignment_history` / `dispute_outcomes` in the selected window. No email or name matching, no new roles.
- **Summary metrics** — Active Agents (+ delta vs previous equal-length window), Open Disputes (assigned, open task/dispute statuses), Resolved This Week (+% vs previous window), Avg Resolution (`resolved_at - assigned_at`, with delta), Overdue Cases (`sla_status` breached / `due_at` past), Top Agent (highest score).
- **Per-agent rows** — active cases, resolved, avg resolution time, avg first-action time, overdue count, reassignments, escalations, SLA compliance %, availability status, role label, team.
- **Score formula** — weighted composite of SLA compliance, resolution speed vs team median, overdue rate and escalation rate, normalised 0–100 with bands (Excellent / Very Good / Good / Needs attention). The formula is exposed in a tooltip, same as Productivity Insights.
- **Historical attribution** — resolved/handled counts are attributed via `task_assignment_history` and `dispute_outcomes.resolved_by_user_id`, so later reassignment does not move past credit.
- **Filters** — team, date range (7d / 30d / this month / custom), plus More Filters (role, availability status, queue, SLA state, overdue-only, min active cases). All metrics recompute server-side against the filter set.
- **Live agent count** — derived from `agent_availability.last_heartbeat` within the existing heartbeat window.
- **Export** — a `mode: "export"` action gated on `agent_performance.export`, producing CSV of the current tab + filters, written to `admin_actions` / `audit_logs` via the existing `logAdminAction` helper, reusing the export-scope masking pattern from Task Orchestration.

No new tables, no new statuses, no duplicate agent registry.

## Frontend

New folder `src/components/admin/agent-performance/` with an `index.ts` barrel, mirroring the Task Orchestration layout:

- `AgentPerformanceHeader` — title "Agent Performance & Dispute Operations", subtitle "Performance tracking · Workload management", live-agent pill with pulsing dot, notification button (routes to `/admin/notifications`, dot when unread), Export Report button.
- `AgentPerformanceSummary` — 6 metric cards (Active Agents, Open Disputes, Resolved This Week, Avg Resolution, Overdue Cases with red left border, Top Agent) in the 2/3/6-column responsive grid; cards are clickable and apply the matching filter.
- `AgentPerformanceTabs` — Workload / Performance / SLA Compliance / Rankings segmented control with the contextual caption line beneath.
- `AgentPerformanceFilters` — team select, date-range select, More Filters popover.
- `WorkloadTable` — Rank, Agent (avatar + pulsing availability line), Role, Active Cases pill (blue / amber at capacity / red over), Resolved, Avg Time, Overdue, Score + band, Actions. Rank 1/2/3 use gold/silver/bronze gradient badges; top performer row gets the blue ring, overdue rows the red ring, at-capacity rows the amber ring.
- `PerformanceDashboard` — resolution-time trend, throughput and first-action breakdown per agent.
- `SLAComplianceTable` — on-time vs breached, breach reasons, worst offenders.
- `RankingsTable` — leaderboard ordered by score with movement vs previous period.
- `AgentDetailsDrawer`, `AgentCasesDrawer` (agent's cases, deep-linking to dispute/transaction/task detail), `AgentSLADrawer` (Review SLA), `ExportPerformanceDialog`, plus `EmptyState`, `ErrorState`, `LoadingSkeleton`.
- Row actions: **View Detail** (details drawer), **View Cases** (cases drawer), **Review SLA** (shown when the agent has overdue/breached cases), **Rebalance** (reuses the existing Task Orchestration rebalance action, permission-gated, with the confirm + reason flow already in place) — every action is wired, none decorative.

`AdminAgentPerformance.tsx` composes these inside the existing `AdminLayout`, reusing the current sidebar, header, auth and permission context. `ComingSoonPanel` usage is removed from this page. Data access goes through a new `src/services/agent-performance.service.ts` — no direct Supabase calls from components.

## Visual direction

Match Permission Matrix / Task Orchestration: deep navy canvas with the two blurred radial glows, elevated card surfaces with subtle borders and inset highlight, blue primary actions, green positive, amber warning, red overdue, compact table rows, mono badges, consistent typography and accessible labels/tooltips on every icon-only control. Tokens only — no hardcoded hex in components.

## Out of scope (explicitly excluded)

Market/vendor/onboarding/referral agents, acquisition funnels, commission management, a separate `/agent` portal, new roles, new permissions.