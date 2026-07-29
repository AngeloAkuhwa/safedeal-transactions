# Assignment Rules & Automation — remaining gaps

Most of the plan landed (pickAgent, Review drawer, Test dialog, Escalate drawer, Export popover, notification dedupe helper, `assignment_rule_versions`, self-assign permission gate). What's still missing to reach 100%:

## 1. Background enforcement RPCs (§1)
- Add idempotent server actions `auto_escalate_stale_tasks` and `auto_reassign_offline_agents` inside `admin-task-orchestration-action`, both honouring `stale_after_minutes`, `stale_escalation_queue`, `offline_reassign_after_minutes`, and skipping `continuity_required` / `awaiting_final_approval` tasks. Logged via `logAdminAction` and callable ad-hoc from the UI (button in Assignment Rules panel: "Run now") so ops can trigger without cron.
- Persist `round_robin_state` per `queue_scope` on `assignment_rules` (column exists — wire read/write in `pickAgent`).

## 2. Rule schema hardening (§1, §2)
- `save_rules`: validate every numeric (>0, sane upper bounds — e.g. stale ≤ 1440, offline ≤ 1440, max_active ≤ 200); reject with a clear error string surfaced by the Review drawer.
- Enforce exactly one primary automatic mode server-side (reject if `mode` is auto but `round_robin` toggle disabled contradicts, etc.).
- `queue_scope` UI switcher in `AssignmentRulesPanel` (defaults `global`; senior admins can pick per-queue).

## 3. Approval routing for rule changes (§2)
- When a rule change crosses thresholds (mode change, `max_active_per_agent` decrease, `super_admin_self_assign` turned on, `fallback_target = leave_unassigned`), `save_rules` returns `pending_approval` and inserts a `permission_change_sets` row with `scope='orchestration_rules'`, `before`/`after` JSON, reason.
- `ReviewRulesDrawer` shows the "Requires approval" badge from server response (currently only client-guessed) and switches Save button to **Submit for approval**.
- Pending Approvals queue (existing) already renders scope-agnostic rows; add scope label + link back to `/admin/task-orchestration?rules_change=<id>` which re-opens the drawer read-only.

## 4. Test Configuration surfacing (§3)
- Wire `TestConfigurationDialog` "Review and Save Rules" footer button to open `ReviewRulesDrawer` with the same draft (currently closes only).
- Include `rule_used` per sample row in the server response so the Sample tab can show which rule matched (pickAgent already knows; return it).

## 5. Escalate depth (§4)
- Server `escalate`: enforce financial/compliance queue restriction — reject when `task_type ∈ {refund_request, escrow_release_review, payment_hold_review, payout_review}` and the target queue's configured role does not hold the matching permission (`refunds.process`, `escrow.release`, `payouts.release`, `compliance.review`).
- Create an internal-visibility comment on each escalated task carrying the reason + requested reviewer.
- Delete legacy `EscalateTaskDialog.tsx` (superseded by drawer) and remove any remaining imports.

## 6. Summary + insights interactivity (§5)
- `OrchestrationSummaryCards`: wire the six click handlers (Unassigned, Active Agents, At Capacity, Assigned Today, Overdue, Avg First Action-tooltip only) to update queue/roster filter state and scroll into view. Add the "Range: last 24h · Team: All" caption row above the KPI grid, bound to current filters.
- `ProductivityInsights`: each card opens `AgentDetailsDrawer` on the Performance tab (entry-point only, no drawer redesign). Tooltips already added — verify all metrics have one.

## 7. Export scope + redaction (§6)
- Server `export_queue`: add `assignment_history`, `agent_load`, `automation_rules` scopes (currently supports queue/live only). Mask buyer/seller identity columns unless caller holds `data.export.pii`; mask financial columns unless `data.export.financial`. Log `admin_actions` row with `{scope, filters_hash, row_count}`.
- `ExportScopePopover`: disable "Include PII" / "Include financial" checkboxes when the caller lacks the matching permission (fetched from `useAdminPermissions`).

## 8. Notification event coverage (§7)
Already wired: `task_assigned`, `task_reassigned`, `task_escalated`, `agent_at_capacity`. Missing:
- `sla_approaching`, `sla_overdue` — emit inside the same code path that recomputes SLA (or from the new stale-tasks RPC).
- `critical_unassigned` — emit from `auto_assign` / `preview_auto_assign` when a `priority=critical` task remains unassigned above threshold.
- `automation_rule_failed` — emit when `auto_assign`/`auto_escalate`/`auto_reassign` throws or returns empty plan.
- `no_eligible_agent` — emit when `pickAgent` returns null for any queued task.
- Every notification `data.link` must be `/admin/task-orchestration?task=<id>` or `?queue=<key>&sla=overdue`. Dedupe key format `${event}:${task_id or queue}:${bucket}` (hour bucket for overdue, 15-min for approaching).

## 9. Audit coverage (§8)
- Add `logAdminAction` calls for: `test_rules` (audit-level `info`, no PII), `override_capacity`, `export_queue` (any scope), `assign_to_me` (already partial — verify reason recorded).

## Technical notes

- No new tables required beyond what already exists. Dedupe uses the existing notifications-scan approach (spec's `orchestration_notification_dedupe` table is optional; current approach is acceptable).
- All new server branches remain inside `admin-task-orchestration-action` — no new edge functions.

## Files to edit

- `supabase/functions/admin-task-orchestration-action/index.ts` — new actions, validation, approval routing, redaction, SLA/critical/no-eligible/rule-failed emitters.
- `src/components/admin/task-orchestration/AssignmentRulesPanel.tsx` — `queue_scope` switcher, "Run now" buttons for the two enforcement RPCs.
- `src/components/admin/task-orchestration/ReviewRulesDrawer.tsx` — read `requires_approval` + error strings from server response; swap Save label.
- `src/components/admin/task-orchestration/TestConfigurationDialog.tsx` — footer → open ReviewRulesDrawer; render `rule_used` per sample.
- `src/components/admin/task-orchestration/OrchestrationSummaryCards.tsx` — six click handlers + caption row.
- `src/components/admin/task-orchestration/ProductivityInsights.tsx` — confirm AgentDetailsDrawer entry-point on all cards.
- `src/components/admin/task-orchestration/ExportScopePopover.tsx` — permission-based disable of PII/financial toggles + new scopes.
- `src/pages/AdminTaskOrchestration.tsx` — plumb summary-card filters, rules_change deep link, drawer wiring from TestConfig → Review.
- `src/components/admin/task-orchestration/drawers/EscalateTaskDialog.tsx` — delete.

## Out of scope

- Cron scheduling for the two enforcement RPCs (ad-hoc "Run now" only).
- AgentDetailsDrawer Performance-tab redesign.
