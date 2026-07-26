## Goal

Bring the **Role Detail** and **Feature Registry** tabs on `/admin/permission-matrix` up to the spec. Role Detail becomes a full read/stage surface for one role. Feature Registry becomes a real searchable catalog with per-feature governance metadata (status, owner, approval, environments) and a rich details drawer that Super Admins can extend by registering new permissions.

Everything sits inside the existing workspace (URL-synced tabs, staged-changes footer, environment scope). No new tab, no new page.

---

## 1. Database migration — extend `permissions` + add supporting tables

Current `permissions` has `key, module, action, label, description, sort_order, created_at, risk_level, is_system_default`. We add the governance columns and support tables.

**`permissions` — new columns**
- `status text not null default 'active'` with check `('active','suspended','deprecated')`
- `approval_required boolean not null default false`
- `owner_role text` (nullable FK-lookup to `internal_roles.key`; free-form label if role deleted)
- `updated_at timestamptz not null default now()` + update trigger
- Data backfill: leave existing rows at `active` / `approval_required=false`.

**`permission_environments`** (join table — a permission may be enabled in a subset of envs)
```
permission_key text references permissions(key) on delete cascade
environment    text check in ('production','staging','development')
primary key (permission_key, environment)
```
Backfill every existing permission with all three environments.

Grants + RLS: authenticated read; insert/update restricted to `super_admin` via existing `has_internal_role` helper. Deletes on `permissions` blocked once the key appears in `role_permissions`, `user_permission_overrides`, `permission_change_sets`, or `admin_actions` (trigger — never hard-delete assigned/audited keys; use `status='deprecated'` instead).

**`admin_action_type` enum** — add: `permission_registered`, `permission_updated`, `permission_status_changed`, `permission_deprecated`.

**Repository (`permission-repository.ts`)** — extend `FeatureRow` with the new columns; add:
- `createPermission(input)`
- `updatePermission(key, patch)` (blocks changing `key`, `module`, `action` post-creation)
- `setPermissionEnvironments(key, envs[])`
- `listPermissionEnvironments()` → `Map<key, PermissionEnvironment[]>`

Each write records an entry in `admin_actions` via existing `logAdminAction` helper.

---

## 2. Role Detail tab — full redesign (`RoleDetailPanel.tsx`)

Replace the current 87-line placeholder with a proper detail surface. Keeps the top role `<select>` but adds:

**Header card**
- Role name, description, protected-role badge (`Shield` when `isProtectedRole(key)`)
- Derived access level pill (`deriveAccessLevel(perms, [key])`)
- KPI strip (compact, 5-up): Active users, Granted permissions, Privileged permissions, Pending changes, Last modified (date + actor)
- Right-side action cluster:
  - **Compare Role** → sets `tab=role-matrix&mode=compare&roles=<key>,<other>` via router
  - **Clone as Template** → opens existing template dialog pre-filled with role perms (reuses `cloneRoleAsTemplate`)
  - **Reset to Default** → stages a change set that reverts to `is_system_default` snapshot (disabled for `super_admin`)
  - **View Assigned Users** → navigates to `/admin/users-access?role=<key>`
  - **View Change History** → sets `tab=change-history&target_scope=role&target_key=<key>`

**Sections (accordion, borderless-card aesthetic per project memory)**
1. **Module Access** — reuse `computeCell` per module with `Full / Partial / None` pill + counts
2. **Granted Permissions** — grouped by module, risk chip, source badge
3. **Denied Permissions** — everything not in the bag (collapsed by default)
4. **Privileged Permissions** — filter of Granted where `getPermissionRisk in {high, critical}`
5. **Users with this Role** — list from `internal_user_roles` join `internal_users`; each row links to `/admin/users/:id/profile`; overflow → "View all in Users & Access"
6. **Pending Changes** — rows from `permission_change_sets` where `target_scope='role' and target_key=<key> and status='pending'`, with inline Approve/Reject for authorised admins (reuses existing `apply_permission_change_set`)
7. **Change History** — last 20 `admin_actions` where target maps to this role

**Staging**
- Each permission row inside Granted / Denied has a compact stage toggle when `canWrite` and role is not `super_admin`-protected on mandatory keys. Wires into the existing `useStagedPermissionChanges` (same footer already mounted on Role Matrix). To keep one staging buffer, hoist the hook up in `AdminPermissionMatrix.tsx` and pass `staged` + `stageMany` down to both `RoleMatrix` and `RoleDetailPanel`; render `StagedChangesFooter` once at page level.

**Protected-role guardrails (client-side; also enforced by DB triggers)**
- `super_admin`: mandatory keys (`permissions.manage_permissions`, `users_and_access.manage_permissions`, `audit_logs.view`) are locked. If a stage attempt would leave zero active Super Admins with the critical set, toast blocks with "Last active Super Admin — critical access cannot be reduced".
- `auditor`: any stage that adds a non-read action (regex `.(create|update|approve|reject|configure|suspend|reactivate|manage_permissions|escalate|resolve|assign|reassign)$`) is blocked with a warning.
- `finance_operator`: staging `financial_controls.approve` / `payouts.approve` / `refunds.approve` is blocked (initiator ≠ approver).
- `finance_approver`: staging `financial_controls.create` / `payouts.create` / `refunds.create` is blocked.
- Operational roles (`dispute_agent`, `dispute_manager`, `support_agent`, `identity_officer`): staging any `platform_configuration.*` or `permissions.manage_permissions` shows a "requires Super Admin approval" warning and forces `approval_required` reason on the change set.

All guardrails live in a new `role-guardrails.ts` service so the same rules run in `RoleDetailPanel`, `RoleMatrix`, and the change-set enforcement RPC-side later if needed.

---

## 3. Feature Registry tab — expand table + filters (`FeatureRegistryTable.tsx`, `PermissionFilters.tsx`)

**Columns** (drop the current 6-col table for a 10-col one, condensed rows):
1. Permission — label + mono key + `Deprecated`/`Suspended` badge when applicable
2. Module
3. Action
4. Description (truncate + tooltip)
5. Risk
6. Approval Required (Yes/No pill)
7. Status (Active / Suspended / Deprecated)
8. Environments (three-dot indicator: prod, staging, dev)
9. Owner (role label chip or `—`)
10. Roles Using / Overrides / Last Updated (compact stacked column)
11. Actions (`⋯` menu: Open details, Edit metadata, Change status, Deprecate — gated to `permissions.manage_permissions`)

**Filters** (extend `PermissionFilters` state to include `action`, `status`, `approval`, `env`; sync to URL). Also keep search across label / key / description.

- Module (existing)
- Action (from the catalog’s distinct actions)
- Risk (existing)
- Status (Active / Suspended / Deprecated / All)
- Approval Required (Any / Yes / No)
- Environment (Any / Prod / Staging / Dev) — filters rows whose `permission_environments` don't include the selection; also drives which environment’s role grants power the "Roles Using" count

Row click opens the drawer.

---

## 4. Feature Details drawer — rebuild (`FeatureDetailsDrawer.tsx`)

Replace the current thin sheet with sections (using the shared `PermissionPanel` card):

- **Header**: label, mono key, status badge, risk chip, environment dots
- **Description** (from `permissions.description`)
- **Module / Action** stack
- **Governance**: approval-required, owner, last updated, created_at, `is_system_default`
- **Dependencies**: from `PERMISSION_DEPENDENCIES`, each row shows the required key + note; missing-dependency warning if enabled for a role that lacks the required key
- **Conflicting permissions**: from `PERMISSION_CONFLICTS`
- **Roles using**: existing role list, but tinted by whether the permission is in that role's grant for the current environment
- **Users via override**: join `user_permission_overrides` → `internal_users`; link to `/admin/users/:id/profile`
- **Pending changes**: `permission_change_sets` where the payload references this permission key (search JSONB `after`/`before`)
- **Change history**: `admin_actions` filtered to this key (metadata JSON contains `permission_key`)

**Footer actions (Super Admins only)**: Edit metadata · Change status · Deprecate.

---

## 5. Register-permission dialog (Super Admins only)

New component `RegisterPermissionDialog.tsx` opened from a **+ Register Permission** button in the Feature Registry toolbar. Form fields:

- Display name (`label`)
- Stable permission key (`module.action`) — regex-validated `^[a-z_]+\.[a-z_]+$`; live uniqueness check against `permissions.key`; read-only after save
- Module (existing catalog + free-form for new module)
- Action (typed against enum, allow new via free-form)
- Description (required, min 20 chars)
- Risk level (radio: low / medium / high / critical)
- Approval required (toggle)
- Dependencies (multi-select of existing keys)
- Conflicting permissions (multi-select of existing keys)
- Supported environments (three checkboxes, default all)
- Owner (role select, optional)

On submit: `createPermission` → inserts dependency + conflict rows → sets environments → writes `admin_actions` with `action_type='permission_registered'`. Toast + refetch.

Editing an existing permission opens the same dialog with `key/module/action` fields disabled.

---

## 6. Wiring in `AdminPermissionMatrix.tsx`

- Hoist `useStagedPermissionChanges()` here; pass to both `RoleMatrix` and `RoleDetailPanel`; render one `StagedChangesFooter` at page level.
- Extend `useQuery` set with:
  - `["perm-workspace", "role-users", env]` → grouped counts + users list per role
  - `["perm-workspace", "permission-envs"]`
  - `["perm-workspace", "pending-by-role", env]` and `["perm-workspace", "pending-by-key", env]`
- Add `permission-registered` refetch on dialog success.

---

## 7. Technical notes

**Files created**
- `supabase/migrations/<ts>_permission_governance.sql` (columns + envs table + admin_action_type enum values + triggers)
- `src/services/role-guardrails.ts`
- `src/components/admin/permission-matrix/RegisterPermissionDialog.tsx`

**Files edited**
- `src/services/permission-repository.ts` (new methods + extended `FeatureRow`)
- `src/services/permission-catalog.ts` (hydrator reads `status`, `approval_required`, `owner`, `environments`)
- `src/services/permission-workspace.service.ts` (add `fetchRoleUsers`, `fetchPermissionEnvironments`, `fetchPendingByRole`, `fetchPendingByPermission`)
- `src/hooks/useRoleMatrixFilters.ts` (add `action`, `status`, `approval`, `env` filters + URL sync)
- `src/components/admin/permission-matrix/PermissionFilters.tsx` (new filter chips)
- `src/components/admin/permission-matrix/RoleDetailPanel.tsx` (full redesign)
- `src/components/admin/permission-matrix/FeatureRegistryTable.tsx` (new columns + row menu)
- `src/components/admin/permission-matrix/FeatureDetailsDrawer.tsx` (full redesign)
- `src/pages/AdminPermissionMatrix.tsx` (hoisted staging, new toolbar button, extra queries)
- `src/pages/AdminUsersAccess.tsx` — read `?role=` query param and pre-apply the role filter (small change so **View Assigned Users** lands filtered)

**Deferred / not in this plan**
- Server-side enforcement of guardrails inside `apply_permission_change_set` (currently client-only; DB triggers still block role delete + last-super-admin). Can land in a follow-up if you want defence-in-depth.
- Bulk permission edit from Feature Registry (row menu still opens the dialog per row).
