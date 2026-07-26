## Task Orchestration — remaining gaps

Everything in the visual/component spec is built and typechecks. Three real gaps remain: two are wiring, one is a missing backend hook required by "TASK CREATION FLOW".

### Gap 1 — Preview drawers built but never opened

Files exist and pass typecheck, but nothing on `/admin/task-orchestration` opens them, so the flow the spec calls for ("AutoAssignPreviewDrawer", "RebalancePreviewDrawer") is bypassed and the actions fire immediately.

- `AutoAssignPreviewDrawer` → Auto-Assign quick action must open it first. Call `test_rules` on the orchestration action edge function for `{pending, seats, would_assign}`, render the drawer, and only call `auto_assign` on confirm.
- `RebalancePreviewDrawer` → Rebalance quick action must open it with the current roster, then call `rebalance` on confirm.
- `AssignmentHistoryDrawer` → Add a "History" button in `TaskDetailsDrawer` and `AgentDetailsDrawer`. History rows come from `task_assignment_history` + `task_status_history` (task) and `task_assignment_history` filtered by agent (agent). Add a `history` action to `admin-task-orchestration-action` that returns the merged, ordered list.
- `EmptyState` → use it inside `UnassignedTaskQueue` and `AgentRoster` in place of the current inline "No … " strings so the empty presentation matches the rest of the app.

### Gap 2 — Nothing creates tasks from disputes/complaints

`create_orchestration_task(...)` RPC and `orchestration_tasks.source_event_key` (unique) both exist, but no edge function calls the RPC. Result: the queue only ever shows manually-inserted rows, and the spec's "A dispute, complaint or qualifying operational event creates a task … creation must be idempotent" is not satisfied.

Wire the RPC into every place a qualifying event is produced:

| Edge function | Event | Task type | Source key |
| --- | --- | --- | --- |
| `buyer-disputes` (create) | Buyer opens dispute | `new_dispute_review` | `dispute:{dispute_id}:opened` |
| `seller-dispute-detail` (respond) | Seller responds | `seller_response_review` | `dispute:{dispute_id}:seller_response:{response_id}` |
| `buyer-disputes` (respond) | Buyer responds | `buyer_response_review` | `dispute:{dispute_id}:buyer_response:{response_id}` |
| `dispute-detail` (evidence upload) | New evidence | `evidence_review` | `dispute:{dispute_id}:evidence:{evidence_id}` |
| `auto-escalate-silent-disputes` | Silent timeout | `compliance_escalation` | `dispute:{dispute_id}:auto_escalate` |
| Refund request handler | Buyer requests refund | `refund_request` | `refund:{refund_id}` |
| Payment hold triggers (existing money-state code) | Hold placed | `payment_hold_review` | `payment:{payment_id}:hold` |

Rules for every caller:
- Idempotency via `source_event_key` unique constraint: on 23505 conflict, treat as success and skip.
- Priority mapping: amount ≥ ₦500k or role=`compliance` → `critical`; disputes > 48h old on creation → `high`; default `medium`.
- Fill `required_role`, `required_permissions`, `dispute_id`, `transaction_id`, `buyer_id`, `seller_id`, `amount`, `currency`, `tags` from the source record.
- Only attempt auto-assign when `assignment_rules.active = true` AND `mode != manual`; otherwise leave `unassigned` and record `assignment_reason` = "queued: auto-assign disabled" (or the eligible-agent reason).
- Emit an `orchestration_events` row + `audit_logs` entry per creation, per spec.

### Gap 3 — Skills/role gating not enforced on manual assign

`agent_skills` and `orchestration_tasks.required_skills` / `required_role` exist, but `admin-task-orchestration-action` `assign_selected` currently only checks the agent is not offline. Add server-side validation before writing the assignment: agent must have every `required_skill`, satisfy `required_role`, and be under `max_active`. Return a structured error the drawer surfaces inline; do not swallow it into a generic toast.

### Out of scope (already done, listed so you can confirm)

- All 22 UI components exist, use the Permission Matrix aesthetic tokens (`CARD_CLASS`, `TONE`, glass cards), and the page composes them.
- 11 orchestration tables exist with RLS + grants.
- `admin-task-orchestration-overview` and `admin-task-orchestration-action` deployed and returning 200.
- Route `/admin/task-orchestration` guarded through the existing `PermissionRoute`, sidebar entry present.
- Header sticky, responsive stacking on the queue/roster split, mobile task cards for the queue.
- `AssignTaskDrawer`, `TaskDetailsDrawer`, `AgentDetailsDrawer`, `EscalateTaskDialog`, `AssignmentRulesPanel` (Save + Test) wired.

### Technical notes

- New action names on `admin-task-orchestration-action`: `history` (payload: `{ task_id? , agent_id?, limit }`) returning `{ entries: [{id, when, actor, action, detail}] }`.
- Shared helper for task creation goes in `supabase/functions/_shared/orchestration.ts` so every caller uses the same idempotency + priority mapping.
- Client-side: extend `task-orchestration.service.ts` with `fetchAssignmentHistory({taskId?, agentId?})` and `previewAutoAssign()`.
- No schema migration needed; `source_event_key` unique index already present.
