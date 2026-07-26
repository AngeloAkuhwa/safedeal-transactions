## Feature Registry & Permission Matrix — architecture upgrade

Goal: extend the existing permission stack (already backed by `internal_roles`, `permissions`, `role_permissions`, `user_permission_overrides`, `access_change_requests`) with the missing modules, granular actions, risk levels, row-state model, source tracking, and templates — without renaming any existing keys or roles.

### 1. Roles (no changes)
Reuse the 10 roles already seeded in `public.internal_roles` and mirrored in `permission-catalog.ts`. The matrix reads `internal_roles` directly instead of the local `INTERNAL_ROLES` constant so Users & Access remains the single source.

### 2. Modules & permissions (DB seed migration — additive)

Preserve every existing key. Add the missing modules and actions the spec calls for. New module keys:

| New key | Label | Actions |
|---|---|---|
| `analytics` | Analytics | view, export, configure |
| `payments` | Payments | view, update, export |
| `payouts` | Payouts | view, create (initiate), approve, reject, export |
| `refunds` | Refunds | view, create, approve, reject, export |
| `money_tracing` | Money Tracing | view, export |
| `users` | Users | view, update, suspend, reactivate, export |
| `investigations` | Investigations | view, create, update, assign, reassign, escalate, resolve, export |

Also extend existing modules where the spec adds actions:
- `disputes` → already has assign/reassign/resolve/escalate; no changes.
- `users_and_access` → add `reactivate`.
- `permissions` → add `manage_permissions` (already present) + `configure`.
- `audit_logs` → keep `view`, `export`.
- `platform_configuration` → already has `view`, `configure`.

`PermissionAction` union gains: `reactivate`, `initiate` (aliased via `create` on payouts/refunds to keep keys stable — spec's "Create/Initiate/Approve" pattern).

Every new row inserted into `public.permissions` in one migration, then `role_permissions` seeded for the appropriate roles (super_admin gets all; auditor read-only across new modules; finance_operator gets payouts.create/refunds.create; finance_approver gets .approve/.reject; compliance_officer gets money_tracing.view/export; dispute_manager/agent get investigations.*; etc.).

### 3. Risk levels (new)

Add `risk_level` column to `public.permissions`:
```
risk_level TEXT NOT NULL DEFAULT 'low'
  CHECK (risk_level IN ('low','medium','high','critical'))
```

Seed values in the same migration. Critical set (locked):
- `permissions.manage_permissions`, `users_and_access.manage_permissions`
- `users_and_access.create` (Super Admin promotion path)
- Any future `impersonation.*`
- `escrow.approve` (release funds), `payouts.approve`, `payouts.create`
- `refunds.approve`
- `audit_logs.view`, `audit_logs.export`
- `platform_configuration.configure`

High: exports of sensitive data, `.suspend`, `users_and_access.update`, `.reject` on financial modules, `permissions.view`.
Medium: `.update`, `.assign`, `.reassign`, `.resolve`, `.escalate`.
Low: `.view` on non-sensitive modules.

Deprecate `PRIVILEGED_ACTIONS` heuristic in `permission-catalog.ts` — read `risk_level` from DB instead. Keep `isPrivilegedPermission()` returning true for high+critical for backward compat.

### 4. Row-level permission states (new)

Replace the current cell computation used inside the drawers/row lists. Introduce a typed enum used only for **individual permission rows** (not module cells):

```ts
type PermissionRowState =
  | 'granted' | 'denied'
  | 'override_granted' | 'override_denied'
  | 'pending' | 'restricted';
```

Derivation (client-side, from data we already load):
- `restricted` — permission `risk_level='critical'` AND the viewer lacks `permissions.manage_permissions`.
- `pending` — the (user_id, permission_key) has an open row in `access_change_requests`.
- `override_granted` / `override_denied` — row exists in `user_permission_overrides` with `mode='grant'|'revoke'`.
- `granted` / `denied` — otherwise, based on `role_permissions` for the user's roles.

Module summary keeps `full / partial / none` (renamed labels: Full Access / Partial Access / No Access). Fraction badge stays on partial.

### 5. Permission source tracking (new)

Add source enum surfaced everywhere an effective permission is shown:

```ts
type PermissionSource =
  | 'system_default' | 'role_template'
  | 'direct_role' | 'user_override'
  | 'temporary_access' | 'system_restriction';
```

Backing data:
- `user_permission_overrides` gains `expires_at TIMESTAMPTZ NULL` — when set + still in future → source = `temporary_access`.
- New table `public.permission_templates` (id, name, description, created_by, created_at, updated_at) + `permission_template_items` (template_id, permission_key). When a role's grants exactly match a template snapshot → source = `role_template`; otherwise `direct_role`.
- `system_default` = seeded rows from migration (tracked via `permissions.is_system_default BOOLEAN`).
- `system_restriction` = critical permissions not granted to viewer's role AND viewer isn't super_admin.

### 6. Change sets (new)

New table `public.permission_change_sets`:
```
id, requested_by, target_scope ('role'|'user'|'template'),
target_key, before jsonb, after jsonb, status, applied_at, applied_by,
audit_ref (fk audit_logs), created_at
```

Bulk edits from the Matrix funnel through this instead of writing directly to `role_permissions`. On approval an atomic RPC diffs before/after and applies + writes to `audit_logs`.

### 7. Tables — final list & GRANTs

Reused (no schema change beyond noted columns):
- `internal_roles`, `permissions` (+ `risk_level`, `is_system_default`), `role_permissions`, `user_permission_overrides` (+ `expires_at`), `access_change_requests`, `audit_logs`.

New:
- `permission_templates`, `permission_template_items`, `permission_change_sets`.

For each new table:
```
GRANT SELECT ON ... TO authenticated;
GRANT ALL ON ... TO service_role;
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
```

RLS policies:
- SELECT: `has_internal_role(auth.uid(),'super_admin'|…)` OR viewer has `permissions.view`.
- INSERT/UPDATE/DELETE on templates & change_sets: viewer has `permissions.manage_permissions`. Approving a change_set requires super_admin.

Reuse existing `has_role`/`has_internal_role`/`internal_effective_permissions` — no recursive policies.

### 8. Repository interfaces (typed service seam)

New file `src/services/permission-repository.ts` — narrow read/write interfaces:

```ts
export interface PermissionRepository {
  listFeatures(): Promise<FeatureRow[]>;         // permissions + risk_level
  listRoles(): Promise<RoleRow[]>;               // from internal_roles
  listRoleGrants(): Promise<RoleGrantRow[]>;     // role_permissions
  listOverrides(): Promise<OverrideRow[]>;       // + expires_at
  listTemplates(): Promise<TemplateRow[]>;
  listChangeSets(status?): Promise<ChangeSetRow[]>;
  submitChangeSet(input): Promise<ChangeSetRow>;
  approveChangeSet(id, reason): Promise<void>;
  rejectChangeSet(id, reason): Promise<void>;
}
export const permissionRepo: PermissionRepository = new SupabasePermissionRepository();
```

`permission-workspace.service.ts` becomes a thin aggregator on top of the repo. Page and drawers import from the repo only — never `supabase` directly for permission data.

### 9. UI wiring (minimal, no visual regression)

- `permission-catalog.ts`: replace hardcoded `MODULES` with a runtime loader that hydrates from `permissions` table on first fetch and caches. Static fallback keeps the current list until the hydrate resolves.
- `PermissionStateCell` (module summary) — unchanged (Full/Partial/None).
- `FeatureRegistryTable` and `PermissionDetailsDrawer` — render the new 6-state pill for individual rows via a new `PermissionRowStateBadge`.
- Risk column already exists; swap heuristic for real `risk_level`. Add Critical (red) alongside existing Privileged/Standard.
- Source column on Override / Feature drawers — chip with the 6 sources.

### 10. Migrations plan (2 files)

1. `add_permission_matrix_architecture.sql`
   - `ALTER TABLE permissions ADD COLUMN risk_level`, `is_system_default`.
   - `ALTER TABLE user_permission_overrides ADD COLUMN expires_at`.
   - `CREATE TABLE permission_templates`, `permission_template_items`, `permission_change_sets` (+ GRANTs + RLS + policies).
2. `seed_permission_matrix_v2.sql`
   - `INSERT ... ON CONFLICT DO NOTHING` for the new module rows in `permissions`.
   - `UPDATE permissions SET risk_level = …` per the classification list.
   - `INSERT INTO role_permissions ... ON CONFLICT DO NOTHING` for baseline role grants on the new modules.

Both migrations are additive — no key rename, no role rename.

### 11. Out of scope
- Impersonation module (per prior instruction, deferred).
- UI theming changes beyond the new risk/source/state chips.
- Rewriting Users & Access screen — it continues to consume the same catalog.

### Implementation sequence
1. Migration #1 (schema).
2. Migration #2 (seed).
3. `permission-repository.ts` + swap workspace service to use it.
4. Runtime hydrate of `PERMISSION_MODULES` from DB with static fallback.
5. Row-state + source badges in Feature Registry, Overrides, Feature drawer.
6. Change-set write path from any bulk edit surface (initially just prep — approval UI already lives in Pending Approvals).