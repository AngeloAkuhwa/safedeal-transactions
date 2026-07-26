# Task Orchestration — remaining UI gaps + aesthetic polish

Backend for the 10-point plan is done: availability enum expanded, server-side queue filters/pagination/matching_ids, SoD guard, skill-aware auto-assign, movement-safe rebalance, reassign notifications, and 7 new lifecycle actions (`start`, `update_stage`, `add_internal_note`, `request_info`, `request_evidence`, `submit_resolution`, `close`). Queue UI (columns, filters, sort, pagination, "select all matching") landed last turn.

All remaining work stays inside `src/components/admin/task-orchestration/**` plus `src/pages/AdminTaskOrchestration.tsx` and the shared tokens in `src/index.css`.

## Part 1 — Functional gaps

1. **Assign Task drawer eligibility panel** — per-agent row: availability chip, capacity meter, overdue count, team, role, skills, suggested score, eligibility reason; inline warnings for capacity / missing skill / SoD; "Selected tasks" list when bulk-assigning.
2. **Auto-Assign preview depth** — render `agent_loads` (current → projected) and `unmatched` (task + reason) sections the server already returns.
3. **Rebalance preview overhaul** — list per-movement rows `{ task, from, to, reason, sla_delta, priority }` with per-row exclude checkboxes and a required confirmation reason; pass `exclude_move_ids` + `reason` to `rebalance`.
4. **Live Task Progression filters + status chips** — real filter popover (agent, team, stage, status, priority, SLA, task type, date range) + distinct chips for `waiting_on_external`, `escalated`, `pending_approval` next to the SLA badge.
5. **Task Details drawer 7-tab expansion** — Overview · Buyer & Seller · Transaction · Dispute · Evidence · Communications · Internal Notes · Assignment History. Overview adds Risk, Stage, Queue, Assigned Agent, Due Date, SLA Status, Required Role, Required Permissions, Escalation State. Action bar adds Start Task, Update Stage, Add Internal Note, Request Information, Request Evidence, Reassign, Submit Resolution, Close — gated by `useOrchestrationPerms`.
6. **Agent Details drawer completeness** — role, permissions, skills, critical-task count, SLA risk, avg resolution time, reassignment history, contextual link buttons (Access Control, Agent Performance, Assigned Tasks, Assignment History).
7. **Agent Roster card enrichment** — role, team, critical-task count, current SLA risk, last-activity relative time on each card; keep availability distinct from "eligible".

## Part 2 — Aesthetic polish (screen-wide)

The orchestration surface today reads as a dense operations table. The polish raises it to the same "control-room dashboard" register used across Feature Registry and Access Control — richer, quieter, more premium — without changing the functional layout.

**Design directions ritual first.** Before touching any styles, capture the current `/admin/task-orchestration` screen, run `design--create_directions` on a hero band + one representative card, and present three rendered directions via a prototype question. Locked tokens must match the existing admin palette (sky primary, glass surfaces, inter type). Only after the user picks a direction do we commit tokens.

Once a direction is chosen, apply consistently across:

- **Header band** — softer gradient wash, refined KPI chips with monospaced tabular numerals, subtle live-pulse indicator on the "Active" dot, tighter subtitle rhythm.
- **Summary cards (KPIs)** — glass surfaces (`bg-card/60` + backdrop blur) with hairline `ring-border/50`, delta arrows with tinted backgrounds, `tabular-nums` on every number, hover lift `translate-y-[-1px]` + soft shadow.
- **Assignment Control Panel** — segmented mode selector styled like the Environment Switcher, quick-action buttons grouped with a divider, disabled-state affordance for permission-gated actions.
- **Unassigned Task Queue** — sticky header row, alternating hairline row separators, priority pills that own their column, SLA badges with left-tick color bar, hoverable rows that reveal the row action, empty-state illustration hint.
- **Agent Roster** — cards get avatar ring tinted by availability, capacity meter as a slim segmented bar, role/team as a two-line subtitle, "eligible/ineligible" state visually distinct from availability dot.
- **Live Task Progression** — swimlane feel: status chip + SLA badge sit side-by-side, stage progression rendered as a compact stepper, filter popover styled as glass over-panel.
- **Productivity Insights** — icon-led stat tiles, subtle gradient underline for each superlative, avatar cluster where relevant.
- **Assignment Rules panel** — form group with clearer section labels, toggles use the shadcn switch, "Last saved" chip in the corner.
- **All drawers** — 480/600/720 px width tiers by content weight, sticky header with entity code + status pill, sticky footer for the primary action, section headers in `text-xs uppercase tracking-wider text-muted-foreground`, tab bar mirrors Feature Registry.
- **Loading & empty states** — replace the generic skeleton with card-shaped skeletons that mirror final layout; empty states get a single-icon glyph + one-line explanation + one CTA.
- **Motion register** — 120–180 ms tween on hover/press, 220 ms slide+fade on drawers, no bounce; reduce-motion respected.
- **Tokens** — pull any new gradients/shadows into `src/index.css` as `--gradient-orchestration-header`, `--shadow-orchestration-card` so they're reusable and dark-mode safe. No hard-coded colors in components.

## Order of work

1. Group A (drawers powered by existing payloads): items 1 → 2 → 3.
2. Group B (live surface + roster): items 4 → 6 → 7.
3. Group C (largest): item 5 — 7-tab Task Details.
4. Group D (aesthetic): run directions ritual → apply chosen direction top-down (header → KPIs → panels → tables → drawers → states).

Functional work (Groups A–C) ships first so the visual pass in Group D dresses a complete surface rather than a moving target.

## Technical notes

- No new migrations, no new edge-function actions. Overview payload already exposes `roster[*].skills / role / critical_active / sla_risk / last_activity_at` and `unassigned_page.matching_ids`.
- Rebalance apply loop needs the existing `notifyReassignment` call on each accepted move (single-line addition inside `rebalance` handler, folded into item 3).
- Aesthetic changes must be additive to `src/index.css` tokens — no component-level hex or `text-white`/`bg-black` classes. Contrast verified in both themes.
