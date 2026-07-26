# Task Orchestration — Agent Roster fix + remaining RBAC gaps

## Why the Agent Roster is empty (confirmed)

Verified against the live database:
- `internal_users` (active): **2**
- `agent_availability` rows: **0**
- `agent_capacity` rows: **0**

The overview edge function (`admin-task-orchestration-overview`) only surfaces roster entries whose caller holds `task_orchestration.view_agent_load`, and it derives KPIs like `active_agents` / `available_agents` strictly from `agent_availability`. Because no agent has ever registered availability/capacity rows, the roster is blank even for Super Admin (agents show as offline, and load KPIs read 0). If the caller is a role without `view_agent_load` mapped, the roster is force-empty on top of that.

## Fix plan

### 1. Bootstrap agent presence + capacity for every internal user
- New migration:
  - Trigger on `internal_users` (AFTER INSERT / AFTER UPDATE OF status): when `status='active'`, upsert a default row into `agent_capacity` (`max_active_tasks=5`, counters=0) and `agent_availability` (`status='offline'`, `last_seen_at=now()`).
  - One-time backfill for existing active internal users so the current 2 accounts get rows immediately.
- Result: roster always lists every active internal user with sane defaults; capacity math (`active_agents`, `at_capacity`) works even before an agent logs in.

### 2. Presence heartbeat for internal users
- Reuse existing `usePresenceHeartbeat` pattern, but on admin pages call a new edge function `admin-agent-heartbeat` that upserts `agent_availability` (`status='available'`, `last_seen_at=now()`) for the calling internal user.
- Mount the heartbeat in the admin shell so any signed-in internal user appears online in the roster.
- Add a small "Set availability" control (Available / Busy / Offline) in the Agent Roster header for the current user.

### 3. Recompute capacity counters from truth
- Add a Postgres function `recompute_agent_capacity(user_id)` that recounts `orchestration_tasks` for `current_active`, `overdue_count`, `resolved_today`, `tasks_today`, `avg_first_action_seconds`.
- Call it from the existing triggers/RPCs that already mutate task state (assign, reassign, complete, escalate) so counters stop drifting from zero.

### 4. Overview function robustness
- In `admin-task-orchestration-overview`:
  - Left-join style already OK, but treat missing availability as `offline` (already does) AND still include the user in `active_agents` count when the internal user is signed in within the last 5 min (fallback via `last_seen_at`).
  - Return roster to any caller with `view_agent_load` OR `view_all` (Senior Admin/Dispute Manager currently rely on view_all — confirm mapping and, if missing, also grant `view_agent_load` in the role→permission seed).

### 5. RBAC seed audit (remaining gap from prior turn)
- Verify `role_permissions` seed grants:
  - Super Admin, Senior Admin, Dispute Manager → `view_agent_load`, `view_history`, `rebalance` where applicable.
  - Auditor → `view`, `view_all`, `view_history` only (read-only).
  - Finance Operator / Approver → scoped `view_assigned` + finance task types.
- Re-run seeding migration idempotently (upsert on `(role_id, permission_id)`).

### 6. Small UI polish
- `AgentRoster` empty state: replace silent "0" with an explicit message ("No agents online yet — sign in as an internal user or set availability to Available") so the cause is visible.
- Show each agent's `last_seen_at` relative time under their name.

## Remaining Task Orchestration gaps (still open from the previous plan)

1. **Reassignment drawer UI** — backend `reassign` action exists, but no dedicated Reassign drawer with impact preview and dual-notify (previous + new agent). Currently reuses Assign drawer.
2. **Bulk assignment result report** — edge function returns per-task outcome, but UI shows a single toast; needs a results dialog listing `assigned` vs `not_assigned` with per-row reason.
3. **Auto-Assign preview exclusions** — preview drawer lists proposals but has no checkbox to exclude individual proposals before confirmation.
4. **Assign-to-Me capacity override** — capacity block message shows, but no "Request override" path invoking `override_capacity` permission with reason capture.
5. **Realtime subscription scoping** — current channel subscribes to all `orchestration_tasks` rows; must filter by `assigned_agent_id=eq.<self>` for callers without `view_all` to honour the "hiding a button is not sufficient security" rule for live streams.
6. **Export permission gate** — export button hidden, but the CSV endpoint itself must reject callers without `task_orchestration.export` (server check).
7. **Rules tab write-through** — `manage_rules` UI edits `assignment_rules` client-side; needs an edge action that validates + versions changes into `assignment_rule_versions`.

## Technical notes

- Trigger uses `SECURITY DEFINER` with `SET search_path=public`; no CHECK constraints (uses trigger validation per project rules).
- Heartbeat function verifies `is_internal_admin(auth.uid())` before upserting.
- All new writes route through existing `logAdminAction` for auditability where they mutate capacity or availability on behalf of another user.
- No changes to `agent_capacity` / `agent_availability` schemas — only data + triggers + one RPC.

## Out of scope

- Skills-matrix editing UI (agent_skills already enforced server-side).
- Cross-region routing rules.
