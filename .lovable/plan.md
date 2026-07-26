## Goal

Re-skin `/admin/task-orchestration` so it reads as a sibling of the Permission Matrix (borderless glass cards, tinted icon tiles, sticky header, compact dense tables), split the current single 882-line `index.tsx` monolith into the requested reusable components, and close the remaining functional/domain gaps left over from the earlier port.

The route, edge functions (`admin-task-orchestration-overview`, `admin-task-orchestration-action`), DB schema (`orchestration_tasks`, `agent_capacity`, `assignment_rules`, etc.), and service layer already exist and stay — this is a visual + structural + gap-fill pass, not a rewrite of the domain.

## 1. Adopt the Permission Matrix visual system

Standard tokens applied everywhere on the page:

- Cards: `rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-sm` (no hard black `#1E293B`, no per-component hex).
- Filter/toolbar strips: `rounded-xl border border-border/70 bg-card/60 p-3 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]`.
- KPI tiles: matrix `PermissionSummaryCards` pattern — small tinted icon square (`bg-*/10 ring-1 ring-inset ring-*/20`), 10px uppercase muted label, 2xl bold value, hover lift.
- Tone map reused from matrix: primary/blue, emerald/success, amber/warning, rose/danger, sky/info, muted/neutral.
- Page shell: sticky header row inside `AdminLayout` (same behavior as matrix + audit logs), subtle radial gradient background wash.
- Replace hardcoded `text-white`, `bg-slate-*`, `#1E293B`, etc. with semantic tokens (`text-foreground`, `bg-card/60`, `text-muted-foreground`, `border-border`).
- Tables: dense rows, `text-xs` headers uppercase-tracked, hover row highlight, status/priority as pill badges with the tone palette above.

## 2. Component split (from the 882-line file)

Break `src/components/admin/task-orchestration/index.tsx` into the exact set the brief asks for, under `src/components/admin/task-orchestration/`:

- `TaskOrchestrationHeader.tsx` — title, subtitle, Auto-Assign pill, notifications bell, Export Report.
- `OrchestrationSummaryCards.tsx` — 6 KPI tiles (Unassigned, Active Agents, At Capacity, Assigned Today, Overdue, Avg First Action) with delta chips and click-through filters.
- `AssignmentControlPanel.tsx` — wraps Mode + Quick Actions + the guidance callout.
- `AssignmentModeSelector.tsx` — Round Robin / Load-Based / Skill-Based / Manual, persists to `assignment_rules`.
- `AssignmentQuickActions.tsx` — Assign Selected, Auto Assign, Assign To Me, Rebalance, Escalate, Bulk Export (each permission-gated, each wired to a real action).
- `TaskQueueFilters.tsx` — priority, type, queue, age, amount, search; drives server-side query params.
- `UnassignedTaskQueue.tsx` — checkbox column, task/dispute link, type, priority pill, age, amount, suggested agent, per-row Assign, "View All (n)".
- `AgentRoster.tsx` + `AgentLoadCard.tsx` — availability tint (available/at-capacity/offline), active vs avg vs overdue counters, click opens details.
- `LiveTaskProgression.tsx` — task id, agent avatar, case ref, stage, started, last updated, status (On Track / Overdue / Waiting), View action, Filter + View All.
- `ProductivityInsights.tsx` — Most Active, Most Resolved, Least Loaded, Highest Overdue, Fastest Response cards.
- `AssignmentRulesPanel.tsx` — all toggles + numeric caps + Fallback Assignment Target + Save Assignment + Test Configuration, mapped to `assignment_rules` version bump.
- Drawers/dialogs: `TaskDetailsDrawer.tsx`, `AgentDetailsDrawer.tsx`, `AssignTaskDrawer.tsx`, `AutoAssignPreviewDrawer.tsx`, `RebalancePreviewDrawer.tsx`, `EscalateTaskDialog.tsx`, `AssignmentHistoryDrawer.tsx`.
- Shared: `LoadingSkeleton.tsx`, `EmptyState.tsx`, `ErrorState.tsx`.
- `index.ts` barrel exports; `AdminTaskOrchestration.tsx` becomes a thin composition (state + data fetch + polling only).

Every button, toggle, dropdown, filter and row action is wired — no decorative controls.

## 3. Fill functional gaps

Backend / service (extends existing files, no duplicates):

- `AutoAssignPreviewDrawer` and `RebalancePreviewDrawer` — call `runOrchestrationAction` with a new `dry_run: true` mode; edge function returns projected assignments + skipped agents + reasons before commit.
- `TaskDetailsDrawer` — pulls full task row incl. required role/permissions, SLA, risk level, tags, references (dispute, transaction, buyer, seller); shows `task_status_history`, `task_assignment_history`, `task_comments`; add-comment + change-stage actions (gated).
- `AssignmentHistoryDrawer` — per task or per agent, sourced from `task_assignment_history` + `orchestration_events`.
- `EscalateTaskDialog` — mandatory reason (min 20 chars), sets `escalation_level` + `escalation_reason`, routes to senior queue, writes `orchestration_events` + `admin_actions`.
- Rules panel Save → bumps `assignment_rule_versions`; Test Configuration → dry-run auto-assign against current unassigned queue and previews results.
- Idempotent creation guard: edge function keys off `(source_type, source_id)` when materializing tasks from disputes/holds; missing today for a couple of sources — will be added.
- Sync task status ↔ dispute state on resolve; block financial side-effects unless caller has the separate financial permission (already true, will be surfaced in UI as a lock chip).
- Realtime: subscribe to `orchestration_tasks` and `orchestration_events` (throttled, matrix pattern) so KPIs, queue and Live Progression update without full reload; polling stays as fallback.
- Permission gating everywhere via `useAdminPermissions` — Senior-only actions (rebalance, escalate, rules save, bulk export) hidden or disabled with tooltip for lower roles; matches matrix behavior.
- Audit: every mutation goes through `logAdminAction` with `action_type`, `target_type=orchestration_task`, ref id and reason where required.

## 4. Responsiveness

- Desktop: full command-centre grid preserved.
- Tablet: KPI cards 3-up then 2-up; control panel stacks Mode above Quick Actions; queue and roster become full-width stacked sections.
- Mobile: queue rows collapse into task cards (title, pills, amount, primary action); roster becomes vertical list; rules panel becomes single-column; sticky header keeps title + Auto-Assign chip only.
- No horizontal page overflow — internal tables scroll inside their cards.

## 5. Verification

- Typecheck + build.
- Manual pass at 375/768/1280/1600 widths.
- Playwright headless: load `/admin/task-orchestration`, screenshot header + KPIs + control panel + queue + roster + progression + insights + rules; confirm visual parity with matrix screens.
- Confirm `admin-task-orchestration-overview` still 200s and the new `dry_run` branch returns previews.

## Out of scope

- No changes to `AdminLayout`, sidebar, auth, route guards, or unrelated admin screens.
- No schema changes beyond additive columns if a gap strictly needs one (will be flagged before running the migration).
