# Finish-line plan v5 — Environment switcher & SoD resolution

Two tracks. Both land the same turn.

---

## Track 1 — B3 Environment switcher (Production / Staging / Development)

**Goal.** Let admins scope the Feature Registry & Permission Matrix to an environment so Staging/Dev experiments don't pollute Production truth. Production stays the default and the only environment writable without a feature flag.

### Migration
- Add `environment TEXT NOT NULL DEFAULT 'production'` to:
  - `role_permissions`
  - `user_permission_overrides`
  - `permission_templates`
  - `permission_change_sets`
  - `permission_conflict_acknowledgements`
- Add a CHECK enforcing `environment IN ('production','staging','development')`.
- Recreate the relevant UNIQUE constraints to include `environment` (e.g. `role_permissions (role_key, permission_key, environment)`), so the same permission can be granted per env independently.
- Backfill: every existing row = `'production'` (default already covers this).
- Extend `apply_permission_change_set` and `reject_permission_change_set` RPCs to accept `p_environment` and scope every read/write to it.
- No GRANT changes needed (columns only).

### Repository
- `permission-repository.ts`: every list/mutation function gains an `environment` argument, defaulting to `'production'`. All Supabase queries add `.eq('environment', env)`.
- `permission-workspace.service.ts` `buildRoleGrantMap` takes `environment` and only reads matching rows.

### UI
- New `EnvironmentSwitcher.tsx` — segmented control (Production / Staging / Development) rendered in the matrix hero band, right of the KPIs.
- Sync selection to URL as `?env=staging` via `useRoleMatrixFilters` (already URL-synced).
- Persist last selection to `localStorage` as fallback.
- Non-production envs render a subtle amber ribbon strip above the tabs: "Viewing Staging environment — changes here do not affect Production."
- All matrix tables, staged changes footer, Copy preview, Acknowledge dialog receive the current env and pass it into repo calls.
- Change-set submissions include the env; the review queue shows an env pill next to each request.

### Guardrails
- Staged edits are per-env; switching envs with pending staged changes triggers the existing unsaved-guard confirm ("Discard N staged changes and switch to Staging?").
- Read-only users see the switcher (view-only across envs).
- Acknowledgements are per-env — a mute in Staging never suppresses a Production finding.

---

## Track 2 — Resolve Senior Admin escrow SoD conflict

**Decision (approved):** Remove `escrow.approve` from `senior_admin`. Escrow approval stays with Escrow Manager and Super Admin.

### Steps
- Data migration in `role_permissions`: `DELETE WHERE role_key='senior_admin' AND permission_key='escrow.approve' AND environment='production'`.
- Log via `admin_actions` (`role_changed`, actor = system migration, target = `senior_admin`, before/after diff) so the change appears in Audit Logs.
- After Track 1 lands, apply the same delete for `staging` and `development` rows if they exist (they will, from the backfill).
- Compare Roles will now show 0 conflicts across all default roles.

### Verification
1. Hard-reload `/admin/permission-matrix`, open Compare Roles, select `senior_admin` + `super_admin` — no conflict rows.
2. Audit Logs shows a `role_changed` entry with `{ removed: ['escrow.approve'] }` diff.
3. All Roles matrix: Senior Admin column shows `escrow.update` still granted, `escrow.approve` cleared.

---

## Track 3 — B2 Virtualization

No work this turn. Revisit when the permission catalog exceeds ~250 entries or the All Roles matrix exceeds ~40 rows per module. Documented as a follow-up in `permission-workspace.service.ts` header comment.

---

## Technical details

Files touched:
- `supabase/migrations/*` — one migration for env columns + unique reshapes, one data migration for the Senior Admin cleanup.
- `src/services/permission-repository.ts`, `src/services/permission-workspace.service.ts` — env parameter threading.
- `src/hooks/useRoleMatrixFilters.ts` — add `env: 'production' | 'staging' | 'development'` to URL state (default omitted for prod).
- `src/pages/AdminPermissionMatrix.tsx` — hydrate current env, pass down.
- `src/components/admin/permission-matrix/EnvironmentSwitcher.tsx` — new.
- `src/components/admin/permission-matrix/RoleMatrix.tsx`, `AllRolesMatrix.tsx`, `CompareRolesMatrix.tsx`, `StagedChangesFooter.tsx`, `CopyPermissionsPreview.tsx`, `AcknowledgeConflictDialog.tsx` — env-aware.
- `AdminAccessApprovals.tsx` — env pill on each queued change set.

RPC updates:
- `apply_permission_change_set(p_change_set_id uuid, p_actor uuid, p_environment text)`
- `reject_permission_change_set(p_change_set_id uuid, p_actor uuid, p_reason text, p_environment text)`

Order of operations (single turn):
1. Migration for env columns + Senior Admin cleanup (one call, both statements).
2. Wait for approval + Supabase types regeneration.
3. Repository/service updates.
4. UI: switcher, ribbon, URL sync, downstream env plumbing.
5. Typecheck.
