# Role Matrix tab — full redesign plan

## Current state (verified)
`src/components/admin/permission-matrix/RoleMatrix.tsx` renders one row per module and one aggregate `PermissionStateCell` per role. It has:
- No per-permission drill-down (rows are modules, not permissions)
- No search beyond the shared filter bar
- No risk-level, state, or environment filter specific to the matrix
- No role selector to hide/show columns
- No expand/collapse; no "differences only"; no "privileged only" toggle
- No Compare Roles mode
- No cell staging; clicks call `onCellClick` which just opens a details drawer
- No bulk module actions, no "copy from role", no dependency/conflict checks
- No virtualization
- Environment switcher (B2) is still pending from the previous plan and is a prerequisite for the "Environment selector" control

So: **~10% of the spec is present** (module grid + role columns + aggregate chip). The rest needs to be built.

---

## Scope of this plan
Rebuild the Role Matrix tab into a full workspace with two modes (All Roles / Compare), permission-level rows, staging, bulk actions, and dependency analysis. Keep everything read-only when the viewer lacks edit permission.

---

## Part 1 — Toolbar & filter state

Create `RoleMatrixToolbar.tsx` with a single `useRoleMatrixFilters` hook backing this state:
- `search` — matches permission `label`, `description`, `key`
- `moduleKey[]` — multi-select
- `riskLevel[]` — Low / Medium / High / Critical
- `stateFilter[]` — granted / denied / override_granted / override_denied / pending / restricted
- `visibleRoles: InternalRoleKey[]` — role column selector (default = all)
- `environment` — only rendered if `environmentSupported === true` (derived from B2 migration; otherwise the control is hidden entirely, not shown as "coming soon")
- `privilegedOnly: boolean`
- `differencesOnly: boolean` (in All Roles mode: hides permissions where all visible roles agree)
- `expandedModules: Set<string>` with Expand All / Collapse All
- `Clear filters` resets everything except `visibleRoles`

State lives in the tab component and is URL-synced (`?q=&mods=&risk=&roles=&env=&mode=`) so links are shareable.

---

## Part 2 — All Roles Matrix mode

New component `AllRolesMatrix.tsx` replacing the current `RoleMatrix.tsx` body.

Layout:
- Outer container `overflow-x-auto` — horizontal scroll stays inside the matrix, page never scrolls sideways
- First column (frozen via `sticky left-0` + solid background + right shadow):
  - Permission display name
  - Permission key (mono, muted)
  - Short description (truncated, tooltip on hover)
  - Risk badge for High / Critical only
- Role column headers are `sticky top-0` inside the scroller (so vertical scroll keeps them visible) with role name + icon + short capability count
- Rows grouped by module using collapsible sections. Module header row shows:
  - Module name + permission count
  - Per visible role: mini chip "Full / Partial (n/m) / None"
  - Chevron toggle wired to `expandedModules`
- Permission rows render one cell per visible role:
  - Granted → green check pill
  - Denied → muted dash
  - Row-state derived via existing `derivePermissionRowState` so override/pending/restricted states show as tinted chips with tooltip explaining the source
- Editable cells (viewer has `permissions.write` and role is not `protected`) get a hover ring + click handler that **stages** a change into a local `stagedChanges` map — not saved. Read-only viewers get `cursor-default` and no hover affordance.
- Staged changes surface in a sticky footer bar: "N changes staged across M roles · Review & submit · Discard". Submit routes through `permissionRepo.submitChangeSet` (per-role change sets, one per affected role) so approval workflow is preserved.

Virtualisation: use `@tanstack/react-virtual` for the permission rows once total permission count > 120. Module headers stay outside the virtualizer.

Bulk module actions (button cluster on each module header, gated by edit permission):
- Grant all eligible (skips permissions marked `restricted` for the role)
- Revoke all non-mandatory (skips `is_system_default` when flagged mandatory)
- Reset module to role default (diff vs. seeded default from `permissions.is_system_default` + role baseline)
- Each opens a confirm dialog showing "X permissions will change · Y users currently hold this role" before staging.

---

## Part 3 — Compare Roles mode

New component `CompareRolesMatrix.tsx`, activated via a segmented control at the top of the tab (`All Roles | Compare`).

- Role picker: multi-select chip input, min 2 / max 4 roles
- Renders only permissions where the selected roles **differ** (respects other filters)
- Sections:
  1. Shared by all selected roles (collapsed by default)
  2. Unique to each role (one sub-section per role)
  3. Privileged differences (filtered to High/Critical)
  4. Missing dependencies — computed from a new `permission_dependencies` lookup (see Part 5); flags cases like "role has `payouts.approve` but not `payouts.view`"
  5. Conflicting financial responsibilities — hardcoded conflict pairs (e.g. `payouts.approve` + `payouts.request`, `refunds.approve` + `disputes.decide`) surfaced as red banner rows
- "Copy permissions from role → target role" action:
  - Opens a preview drawer showing the resulting diff (adds / removes / unchanged) against the target's current grants
  - "Stage changes" button loads the diff into the same `stagedChanges` map used by All Roles mode; nothing saves until the user submits

---

## Part 4 — Staging & submission model

- `useStagedPermissionChanges()` hook: `Map<roleKey, Map<permissionKey, 'grant' | 'revoke'>>`
- Sticky footer summarises counts and offers Review, Submit, Discard
- Submit path: one `submitChangeSet` per affected role with `target_scope: 'role'`, `before`/`after` payloads carrying the full permission-key set for that role. Reuses the existing approval queue and audit trail — no new write RPC needed.
- Staged state is discarded on route change with a "You have unsaved staged changes" prompt.

---

## Part 5 — Data & migrations

Two small migrations:
1. `permission_dependencies (permission_key, requires_key)` — seed obvious view/edit/approve chains. Grant to authenticated + service_role, RLS `select` open to internal admins via `has_any_internal_role`.
2. Add `environment` column groundwork (B2 from prior plan) only if we're proceeding with the switcher this pass. If deferred, hide the environment control entirely and note it in the toolbar.

Repository additions in `src/services/permission-repository.ts`:
- `listPermissionDependencies(): Promise<{ permission_key: string; requires_key: string }[]>`
- Reuse existing `submitChangeSet`, `listRoleGrants`, `listOverrides`

Workspace helpers in `src/services/permission-workspace.service.ts`:
- `computeRoleDiff(roleA, roleB, grants)` → shared / uniqueA / uniqueB
- `computeMissingDependencies(roleKey, grants, deps)`
- `computeConflicts(roleKey, grants, conflictPairs)`

---

## Part 6 — Read-only enforcement

- `useAdminPermissions` already exposes `can('permissions.write')`. Thread this into every cell, bulk action, and Copy/Compare CTA. When false: no hover states, no click handlers, no footer bar, tooltips explain "You have read-only access to the Permission Matrix".

---

## Files to add
- `src/components/admin/permission-matrix/RoleMatrixToolbar.tsx`
- `src/components/admin/permission-matrix/AllRolesMatrix.tsx`
- `src/components/admin/permission-matrix/CompareRolesMatrix.tsx`
- `src/components/admin/permission-matrix/RoleColumnPicker.tsx`
- `src/components/admin/permission-matrix/StagedChangesFooter.tsx`
- `src/components/admin/permission-matrix/CopyPermissionsPreview.tsx`
- `src/hooks/useRoleMatrixFilters.ts`
- `src/hooks/useStagedPermissionChanges.ts`

## Files to edit
- `src/components/admin/permission-matrix/RoleMatrix.tsx` — becomes a thin mode switcher (All Roles / Compare) hosting the toolbar + staged footer
- `src/pages/AdminPermissionMatrix.tsx` — wire the new tab content, pass `canWrite`
- `src/services/permission-repository.ts` — add dependency reader
- `src/services/permission-workspace.service.ts` — add diff / dependency / conflict helpers

## Migrations (approval required)
- `permission_dependencies` table + grants + RLS + seed rows
- (Optional, only if B2 lands this pass) `environment` column on `role_permissions`, `user_permission_overrides`, `permission_change_sets`

---

## Decisions needed before I build
1. **Environment switcher** — build the B2 migration + column in this pass, or hide the environment control entirely for now and ship it as a follow-up?
2. **Dependency/conflict seed data** — should I seed a starter set (view→edit→approve chains + the obvious finance conflicts) or wait for you to supply the list?
3. **Virtualisation threshold** — 120 rows is a guess. Fine, or prefer always-on virtualisation?
