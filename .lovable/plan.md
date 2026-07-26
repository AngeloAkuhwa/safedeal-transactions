## Part A — The Super Admin conflicts in the screenshot

**Short answer:** yes, they should be cleaned up. What you're seeing is not a data bug — it's the intelligence layer telling the truth: Super Admin holds `payouts.create` AND `payouts.approve`, `refunds.create` AND `refunds.approve`, etc. That's a real segregation-of-duties violation *for any normal role*, but Super Admin exists precisely to hold everything. Flagging it every time creates noise that hides the one line that actually matters (`Senior Admin — escrow.update conflicts with escrow.approve`).

Two things wrong today:
1. `computeConflicts()` runs against every role, including protected ones (Super Admin is marked `protected: true` in the catalog).
2. The Senior Admin `escrow.update` ↔ `escrow.approve` finding is legitimate and needs a product decision — is that intentional, or should Senior Admin lose one side of the pair?

### A1. Exempt protected roles from SoD flagging, with an explanatory chip
- Update `computeConflicts` / the Compare panel to skip roles where `isProtectedRole(role) === true` AND add a small inline note in the section: *"Super Admin is exempt from segregation-of-duties checks by design."*
- Same treatment for Missing Dependencies on protected roles (Super Admin can never be "missing" a dependency).
- Result: the screenshot's "Super Admin" block disappears; only Senior Admin's one legitimate conflict remains — clearly visible and actionable.

### A2. Add an "Acknowledge" affordance for non-protected roles
- Some conflicts on non-protected roles are intentional (small teams, controlled scopes). Add a per-conflict "Acknowledge & mute" button that writes to a new `permission_conflict_acknowledgements` table (role, pair, reason, actor, timestamp).
- Acknowledged conflicts render as a muted grey row with the reason as a tooltip; unacknowledged conflicts stay red.
- Acknowledgements are auditable and reversible.

### A3. Decide on Senior Admin's `escrow.update` + `escrow.approve`
- I will not silently change this. In build mode I'll surface it in the plan output and ask which side to remove, or whether to acknowledge it.

### A4. Promote conflict rules from hardcoded to DB
- Currently `PERMISSION_CONFLICTS` is a hardcoded array in `permission-dependencies.ts`. Move it to a new `permission_conflicts (a_key, b_key, severity, rationale)` table, seed the existing 4 pairs, hydrate at app start (mirroring what we just did for `permission_dependencies`), keep the hardcoded array as a fallback if the table is unreachable.
- Lets ops add/remove SoD rules without a code deploy.

---

## Part B — Remaining Role Matrix finish-line gaps

### B1. In-app unsaved staged changes prompt
Today only `beforeunload` (tab close / hard reload) guards staged edits. Route changes inside the app do NOT prompt.
- Wire a React Router `useBlocker` (v6.4+) inside `RoleMatrix.tsx` that intercepts navigation when `stagedChanges.size > 0`.
- Show a small confirmation dialog: *"You have N staged changes across M roles. Leave without submitting?"* with Discard / Stay actions.
- Also block the tab switcher between Role Matrix / Feature Registry when staged.

### B2. Virtualization for the All Roles matrix
Not needed at today's ~90 permissions, but worth landing before the catalog grows.
- Add `@tanstack/react-virtual` (already in the ecosystem) to `AllRolesMatrix.tsx`.
- Virtualize permission rows only; module header rows stay outside the virtualizer so sticky headers and per-module bulk menus keep working.
- Turn virtualization on unconditionally (removing the earlier "threshold" idea — a single code path is simpler than branching at 120 rows).
- Preserve sticky-first-column behaviour by using absolute-positioned rows inside the virtualizer with the first cell also `sticky left-0`.

### B3. Environment switcher
Still deferred. Explicit decision needed:
- **Option 1 (recommended):** ship the migration this pass. Add `environment` column (`prod` / `staging` / `dev`, default `prod`) to `role_permissions`, `user_permission_overrides`, `permission_change_sets`. Add a segmented control in the toolbar. Every read/write filters by the active environment. URL param `rm_env=`.
- **Option 2:** keep it hidden. Note it in a follow-up.

---

## Technical details (for the record)

**Files to edit**
- `src/services/permission-dependencies.ts` — add `hydratePermissionConflicts`, `listPermissionConflicts`; skip protected roles in `computeConflicts` and `computeMissingDependencies`
- `src/services/permission-repository.ts` — add `listPermissionConflicts()` and `acknowledgeConflict()`
- `src/components/admin/permission-matrix/CompareRolesMatrix.tsx` — render the "Super Admin is exempt" chip; add Acknowledge button + acknowledged-state row styling
- `src/components/admin/permission-matrix/RoleMatrix.tsx` — `useBlocker` for staged changes; guard tab switcher
- `src/components/admin/permission-matrix/AllRolesMatrix.tsx` — wire `@tanstack/react-virtual`

**Files to add**
- (Optional) `src/components/admin/permission-matrix/AcknowledgeConflictDialog.tsx`

**Migrations**
1. `permission_conflicts (id, a_key, b_key, severity text, rationale text, created_at)` + grants + RLS + seed 4 existing pairs
2. `permission_conflict_acknowledgements (id, role_key, a_key, b_key, reason, actor_id, created_at, expires_at nullable)` + grants + RLS + trigger to write an `admin_actions` audit row
3. (Only if you approve B3-Option-1) `environment` column on `role_permissions`, `user_permission_overrides`, `permission_change_sets` + backfill `'prod'` for existing rows

---

## Decisions I need before building

1. **Senior Admin `escrow.update` + `escrow.approve`** — remove one side (which?), acknowledge with a reason, or leave flagged?
2. **Environment switcher** — ship the migration now (Option 1) or keep hidden (Option 2)?
3. **Acknowledgements** — do you want expiring acknowledgements (auto-re-flag after N days) or permanent-until-reversed?
