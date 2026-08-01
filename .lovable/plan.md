# Assignment Rules & Automation — what's left

Re-checked the whole spec against the code. Sections 1-8 are implemented and deployed: `pickAgent` with round-robin cursor persistence, validated `save_rules` with versioning and approval routing into the Pending Approvals queue, the `test_rules` dry run, `ReviewRulesDrawer`, `TestConfigurationDialog`, `EscalateTaskDrawer` with financial/compliance guards, summary-card and productivity click-throughs, the five-scope export popover with PII/financial masking and audit rows, all nine notification events including the SLA sweep, and the self-assign toggle + reason gate landed just now.

Three items remain.

## 1. Automation runs are manual-only
`auto_escalate_stale_tasks` and `auto_reassign_offline_agents` only fire from the "Run now" buttons on the page. Without a schedule, stale escalation, offline reassignment, and the SLA-approaching / SLA-overdue alerts never fire on their own.

Fix: add scheduled jobs that call the orchestration action function — stale + SLA sweep every 5 minutes, offline reassignment every 10 minutes. Both handlers are already idempotent and dedupe their notifications, so repeat runs are safe.

Note: the original spec listed scheduling as out of scope; it is included here because nothing else blocks the automation from working end to end.

## 2. Approval provenance on rule versions
`assignment_rule_versions` currently stores rule id, version, config, actor, note and timestamp — there is no approver field, so a version applied through an approved change set looks identical to a direct save.

Fix: add approver and approval-time columns, set them when a change set is applied (approver = acting admin), leave them empty for direct saves, and show an "Approved by" line in the rules history rows.

## 3. Agent details entry point
Clicking a productivity card opens the agent drawer, but it does not force the Performance tab or carry the active range/team filters into it.

Fix: accept an optional default tab and filter context on the drawer, and pass "performance" plus the current range/team from the insight cards.

## Technical notes
- The scheduling statement is project-specific (function URL + key), so it runs as a data statement, not a migration.
- The column addition plus the apply-change-set function update is one migration; no access-rule or grant changes needed.
- No new tables, no new edge functions.

## Files to touch
- Migration: `assignment_rule_versions` approver columns + `apply_permission_change_set` update.
- Scheduling statement for the two automation actions.
- `src/components/admin/task-orchestration/ProductivityInsights.tsx` and `drawers/AgentDetailsDrawer.tsx`.

## Out of scope
- AgentDetailsDrawer Performance-tab redesign.