# Permission Matrix — Finish-line plan (10 gaps)

Additive only. No key/role renames. No visual regressions beyond the new chips.

## 1. Verify + patch RLS/GRANTs on new tables (spec §7)

Run a read query against `information_schema` + `pg_policies` for `permission_templates`, `permission_template_items`, `permission_change_sets`. If anything is missing, ship one migration:

- `GRANT SELECT` to `authenticated`, `GRANT ALL` to `service_role` on all three.
- `ENABLE ROW LEVEL SECURITY` on all three.
- Policies (using existing `has_internal_role` / `internal_effective_permissions`, non-recursive):
  - SELECT: viewer has `permissions.view` OR is super_admin.
  - INSERT/UPDATE/DELETE on templates + change_sets: viewer has `permissions.manage_permissions`.
  - `permission_change_sets` UPDATE to `status='approved'|'applied'`: super_admin only (enforced in the RPC in §3, but also gated at policy level).

## 2. Repository — complete the write surface (spec §6, §8)

Extend `SupabasePermissionRepository` in `src/services/permission-repository.ts`:

- `approveChangeSet(id, reason)` → calls new RPC `apply_permission_change_set(id, reason)`.
- `rejectChangeSet(id, reason)` → updates `status='rejected'`, stamps `applied_by=auth.uid()`, writes `audit_logs` row.
- Template CRUD: `createTemplate`, `updateTemplate`, `deleteTemplate`, `setTemplateItems(template_id, keys[])` — the last as an atomic delete+insert inside a transaction via RPC `set_permission_template_items`.

## 3. Atomic apply RPC (spec §6)

New security-definer function `public.apply_permission_change_set(_id uuid, _reason text)`:

1. Load change set; assert `status='pending'`; assert caller is super_admin via `has_internal_role`.
2. Branch on `target_scope`:
   - `role` — diff `before` vs `after` (arrays of permission_keys). Delete removed grants and insert added grants in `role_permissions` for `target_key`.
   - `user` — diff overrides; upsert/delete `user_permission_overrides` rows for `target_key` (user id).
   - `template` — replace `permission_template_items` for `target_key`.
3. Insert `audit_logs` row (action_type: config change, actor, before/after JSONB, reason); store its id in `permission_change_sets.audit_ref`.
4. Mark `status='applied'`, `applied_at=now()`, `applied_by=auth.uid()`.

## 4. Workspace service → thin aggregator (spec §8)

Refactor `src/services/permission-workspace.service.ts` so every DB call routes through `permissionRepo`:

- Replace direct `supabase.from("user_permission_overrides")` with `permissionRepo.listOverrides()`.
- Replace direct reads of `internal_roles`, `role_permissions`, `access_change_requests`, `audit_logs` with repo methods (add `listApprovals`, `listHistory` to the repo).
- Keep the existing `OverrideRow` / `ApprovalRow` shapes so callers don't change.
- Keep the aggregator's join/derivation logic (user names, primary role, permission label) here — the repo returns raw rows only.

## 5. Real row-state derivation (spec §4)

Move state derivation out of `FeatureRegistryTable` into a shared helper `derivePermissionRowState({ permission, viewer, roleGrantMap, overrides, pendingRequests })`:

- `restricted` — `risk_level='critical'` AND viewer lacks `permissions.manage_permissions`.
- `pending` — `(target_user_id, permission_key)` present in `access_change_requests` with status `pending`.
- `override_granted` / `override_denied` — from `user_permission_overrides.mode`.
- `granted` / `denied` — fall back to role grants.

Load `access_change_requests` (already read for the Approvals tab) once at the page level, index by `permission_key`, and pass into the table and drawers. In the Feature Registry (which is not user-scoped) collapse `pending`/`override_*` counts into a single per-row summary; per-user state stays in `UserOverrideTable` and `PermissionDetailsDrawer`.

Also: implement `is_system_default` consumption in the same helper — a permission with `is_system_default=true` and no user override contributes `source='system_default'`.

## 6. Source chips everywhere effective permissions render (spec §5, §9)

Add a `PermissionSourceBadge` component (6 chips: System Default / Role Template / Direct Role Config / User Override / Temporary Access / System Restriction).

Wire it into:

- `PermissionDetailsDrawer` — show source next to Mode.
- `FeatureDetailsDrawer` — show source in the per-role/per-user breakdown row.
- `UserOverrideTable` — new column between "Mode" and "Reason".

Add role-vs-template detection: compare each role's grant set (sorted keys) to every template's items. Exact match → `role_template` with the template name; otherwise `direct_role`. Compute once per page load and pass down.

## 7. Templates persisted against real tables (spec §5)

Rewrite `PermissionTemplateTable` to read/write via the repo:

- List from `permissionRepo.listTemplates()` (already implemented).
- Create/rename/delete via new repo methods (§2).
- "Save items" runs through `submitChangeSet({ target_scope: 'template', target_key: templateId, before, after })` so template edits are audited too.
- Remove the `system_settings` JSON fallback path.

Data migration (one-shot): if a `system_settings` row with the templates JSON exists, migrate it into `permission_templates` + `permission_template_items` on first load of the page (idempotent, keyed by name), then leave the JSON in place for one release cycle.

## 8. Change-set write path from bulk edits (spec §6)

Any surface that mutates role grants funnels through `submitChangeSet`:

- `RoleMatrix` "Save changes" — build `before` from current `roleMap`, `after` from the edited state, submit one change set per role touched with `target_scope='role'`.
- `PermissionDetailsDrawer` / `UserOverrideTable` add/remove — `target_scope='user'`.
- Show a toast "Submitted for approval" and refresh the Approvals tab.

Direct writes to `role_permissions` / `user_permission_overrides` from UI paths are removed; only the apply RPC (§3) writes to those tables going forward.

## 9. Module-summary label rename (spec §4)

Rename `PermissionStateCell` labels: `Full` → "Full Access", `Partial` → "Partial Access", `None` → "No Access". Fraction badge and colors unchanged.

## 10. Deprecate `PRIVILEGED_ACTIONS` heuristic (spec §3)

- Audit callers of `PRIVILEGED_ACTIONS` and `isPrivilegedPermission()`; switch any risk-based UI decision to `getPermissionRisk(key)` returning the 4-tier value.
- Keep `isPrivilegedPermission()` as a shim returning `risk in ('high','critical')` for backward compat, with a `@deprecated` JSDoc.

---

## Implementation sequence

1. RLS/GRANT audit + patch migration (§1).
2. Apply-RPC + repository writes (§2, §3).
3. Workspace service → repo aggregator (§4).
4. Row-state helper + `is_system_default` (§5).
5. Source badge + role-vs-template detection (§6).
6. Templates CRUD via repo + one-shot JSON migration (§7).
7. Change-set write path from RoleMatrix + drawers (§8).
8. Label rename + `PRIVILEGED_ACTIONS` cleanup (§9, §10).
9. Contract test: `src/__tests__/permission-matrix.contract.test.ts` — asserts repo interface is fully implemented and no non-repo file imports `supabase` for permission tables.

## Out of scope (unchanged)

- Impersonation module.
- Any theming beyond the new chips.
- Users & Access screen rewrite.

## Technical details

- New RPC: `public.apply_permission_change_set(uuid, text)` — SECURITY DEFINER, `SET search_path = public`, super_admin guard via `has_internal_role`.
- New RPC: `public.set_permission_template_items(uuid, text[])` — SECURITY DEFINER, `permissions.manage_permissions` guard.
- Files touched: `src/services/permission-repository.ts`, `src/services/permission-workspace.service.ts`, `src/services/permission-catalog.ts`, `src/components/admin/permission-matrix/{FeatureRegistryTable,PermissionDetailsDrawer,FeatureDetailsDrawer,PermissionTemplateTable,UserOverrideTable,RoleMatrix,PermissionStateCell}.tsx`, plus new `PermissionSourceBadge.tsx` and `derive-row-state.ts`.
- Migrations: two additive SQL files (RLS patch + RPCs). No column drops, no key renames.
