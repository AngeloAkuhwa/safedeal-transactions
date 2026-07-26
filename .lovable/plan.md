# Task Orchestration — full port + domain model

Replace the current `Coming Soon` placeholder at `/admin/task-orchestration` with a real, server-backed Task Orchestration command centre that mirrors the supplied HTML 100% and plugs into SafeDeal's existing admin shell (sidebar, header, auth, `PermissionRoute`, dark theme, toasts, drawers, tables).

## 1. Database (single migration, awaits approval)

New tables (all with `GRANT` + RLS + `updated_at` trigger, no changes to existing disputes/transactions/internal_users):

- `orchestration_tasks` — full task record: `task_code`, `type`, `title`, `description`, `priority` (low/medium/high/critical), `status` (unassigned/assigned/in_progress/waiting_on_buyer/waiting_on_seller/waiting_on_evidence/escalated/pending_approval/resolved/closed/cancelled), `stage`, `queue`, `team`, `assigned_agent_id`, `suggested_agent_id`, `dispute_id`, `transaction_id`, `buyer_id`, `seller_id`, `amount`, `currency`, `sla_status`, `required_role`, `required_permissions text[]`, `required_skills text[]`, `risk_level`, `tags text[]`, `escalation_level`, `escalation_reason`, `assignment_reason`, `reassignment_count`, `version`, `source_event_key` (UNIQUE → idempotent creation), `created_at`, `assigned_at`, `started_at`, `due_at`, `first_action_at`, `resolved_at`, `updated_at`.
- `task_assignment_history` — every assignment change (from/to agent, mode, actor, reason).
- `task_status_history` — status + stage transitions with actor.
- `task_comments` — internal notes per task.
- `agent_capacity` — per internal_user: `max_active_tasks`, `current_active`, `overdue_count`, `avg_first_action_seconds`, `updated_at`.
- `agent_availability` — `status` (available/active/busy/at_capacity/offline), `last_heartbeat`, `updated_at`.
- `agent_skills` — `skill` text array join.
- `assignment_rules` + `assignment_rule_versions` — JSONB config (round robin, priority routing, capacity skip, online-only, senior pool fallback, max overdue, self-assignment toggle, etc.).
- `escalation_rules` — thresholds + target queue.
- `orchestration_events` — append-only audit stream.

Enums for task type / priority / status / stage / sla_status. RLS: read/write via `has_internal_role` + `has_permission` checks (`task_orchestration.view/manage/assign/escalate/rebalance/export`). `service_role` full for edge functions.

SQL RPCs (SECURITY DEFINER, `search_path = public`):

- `create_orchestration_task(...)` — idempotent on `source_event_key`.
- `assign_task(task_id, agent_id, mode, reason)` — bumps version, writes history, respects capacity + assignable.
- `auto_assign_pending(mode)` — batch, honours rules.
- `rebalance_agents()` — redistributes overflow, returns preview payload.
- `escalate_task(task_id, reason)` — moves to senior pool.
- `complete_task(task_id, resolution)` — validates it does NOT trigger refunds/payouts (financial actions gated by separate permissions elsewhere).

Trigger hooks so new `disputes` rows (and future qualifying events) fanout via `create_orchestration_task` — idempotent, does not touch existing dispute logic.

## 2. Edge functions

- `admin-task-orchestration-overview` — summary KPIs + queue + agent roster + live progression + insights in one call (matches Feature Registry pattern, uses SQL aggregates).
- `admin-task-assign` — validates permission, calls `assign_task`, writes `audit_logs` + `admin_actions`.
- `admin-task-auto-assign`, `admin-task-rebalance`, `admin-task-escalate`, `admin-task-complete`.
- `admin-task-export` — async job into existing `admin_export_jobs` pipeline, signed URL.
- `admin-orchestration-rules` — GET/PUT assignment + escalation rule config (versioned).

All use `requirePermission` + `logAdminAction` helpers already in the repo, CORS + direct `fetch` PATCH pattern per project conventions.

## 3. Service layer (`src/services/task-orchestration/`)

- `orchestration-repository.ts` — typed reads/writes, no Supabase client in UI.
- `orchestration-realtime.ts` — throttled realtime subscription for task + agent updates.
- `orchestration-types.ts` — shared enums/types.
- `assignment-rules.ts` — client-side rule evaluation for preview drawers.

## 4. React components (`src/components/admin/task-orchestration/`)

Exact list from the request, each a real component (no decorative controls):

- `TaskOrchestrationHeader` — title, subtitle, Auto-Assign pill (server-toggled), notification bell, `Export Report` button.
- `OrchestrationSummaryCards` — 6 KPI cards with left accent bars (danger/success/warning/plain/danger/plain).
- `AssignmentControlPanel` wrapping:
  - `AssignmentModeSelector` (Manual / Round Robin / Next Available / Priority-Based / Assign To Self) — writes to `assignment_rules`.
  - `AssignmentQuickActions` — Assign Selected, Auto Assign, Assign To Me, Rebalance, Escalate, Bulk Export (each wired to its edge function / drawer).
  - Senior-Admin-Only lock chip driven by permission check.
- `UnassignedTaskQueue` + `TaskQueueFilters` (priority filter, View All) + row selection checkboxes, Suggested agent column, per-row `Assign` action.
- `AgentRoster` with `AgentLoadCard` variants (available/active/busy/at_capacity/offline) — left-accent gradients from the HTML.
- `LiveTaskProgression` table (Task ID, Agent, Case Ref, Stage, Started, Last Updated, Status pill, View action) with Filter + View All.
- `ProductivityInsights` — 5 highlight cards (Most Active, Most Resolved, Least Loaded, Highest Overdue, Fastest Response).
- `AssignmentRulesPanel` — 6 toggles + `Maximum Active Disputes per Agent` + `Fallback Assignment Target` + `Maximum Overdue Cases Before Skip` + `Super Admin Self-Assignment`, plus `Save Assignment` and `Test Configuration` buttons wired to `admin-orchestration-rules`.
- Drawers/dialogs: `TaskDetailsDrawer`, `AgentDetailsDrawer`, `AssignTaskDrawer`, `AutoAssignPreviewDrawer`, `RebalancePreviewDrawer`, `EscalateTaskDialog`, `AssignmentHistoryDrawer` — all real, all audited.
- `LoadingSkeleton`, `EmptyState`, `ErrorState` — reused across sections.

Page (`src/pages/AdminTaskOrchestration.tsx`) composes these inside `AdminLayout`, reuses existing sidebar/header. Sticky header per existing pattern. Route + `PermissionRoute` already wired.

## 5. Visual system

Matches Feature Registry & Permission Matrix: deep navy background (`bg-background`), `bg-card/60` glass surfaces, `border-border/60`, subtle radial primary/success glows, blue primary buttons, semantic status colours (success/warning/danger/muted), mono badges for task codes. All values via existing tokens — no hex literals.

## 6. Responsiveness

- Desktop ≥ `xl`: full command-centre grid (queue 2/3 + roster 1/3, 6-col KPI row, 2-col rules panel).
- `md–lg`: KPIs 3-col, queue + roster stack, rules 1-col.
- Mobile: KPI carousel, queue rows become task cards with primary action, roster horizontal scroll snapping, tables use existing responsive-table helper, no page-level horizontal overflow.

## 7. Task lifecycle rules (enforced server-side)

- Idempotent creation via `source_event_key`.
- Critical tasks flagged + auto-routed to senior queue.
- Resolving a task never triggers refund/payout/release — those still require their own financial permissions elsewhere.
- Additional-approval path → `pending_approval` status.
- Full history preserved in `task_*_history` + `orchestration_events` + `audit_logs`.

## 8. Verification

`tsgo` typecheck, targeted Playwright pass over `/admin/task-orchestration` (KPIs load, assign flow writes history, rules save persists, mobile stack renders, sticky header behaves).

## Out of scope

- No changes to existing disputes / transactions / payouts / escrow business logic.
- No new financial permissions; task completion remains non-financial.
- No sidebar redesign (entry already exists).
