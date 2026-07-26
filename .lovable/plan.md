## Feature Registry / Permission Matrix — finish-line plan (all 4 tabs)

Rewrites the earlier plan to cover Role Detail, Feature Registry, Permission Templates and User Overrides in one pass.

---

### 1. Role Detail tab — remaining gaps

1. **Inline staging from Role Detail.** Granted / Denied / Privileged lists become toggleable when `canManage`. Every change routes through `useStagedPermissionChanges` + `role-guardrails.checkRoleStageAllowed`, so guardrail messages (Super Admin mandatory keys, Auditor read-only, Finance SoD, ops-agent platform lock) show inline and the shared `StagedChangesFooter` picks them up.
2. **Clone as Template action.** Opens a `CloneRoleAsTemplateDialog` prefilled with the role's granted keys → writes via `permissionRepo.createTemplate` and switches to the Templates tab.
3. **Reset to Default action.** Diffs current role bag against seeded defaults from `permission-catalog`; opens a confirm drawer that stages the diff as a change set. Disabled for protected roles.
4. **View Change History button.** Top-action button scrolls to the inline history section and also links to `?tab=change-history&role=<key>`.
5. **View Assigned Users route.** Keep `/admin/access-control?role=…` (canonical alias in this project); no route rename.

### 2. Feature Registry tab — remaining gaps

6. **Register / Edit form gains Dependencies + Conflicting permissions.** Two multi-select fields backed by the current catalog; on submit call new `permissionRepo.setPermissionDependencies` and `setPermissionConflicts`.
7. **Permission key is immutable after creation.** In edit mode the key input is disabled with a lock icon + tooltip.
8. **Deprecate / Suspend / Reactivate actions.** Added to `FeatureDetailsDrawer` header (Super Admin only), wired to `updatePermission({ status })`. Hard delete stays disabled.
9. **Environment filter.** Already satisfied globally via `EnvironmentSwitcher` — call it out, don't duplicate.

### 3. Permission Templates tab — new work

10. **Seed the 10 system templates** via migration: System Super Administrator, Senior Operations Administration, Dispute Management, Dispute Agent, Customer Support, Identity Verification, Finance Operations, Finance Approval, Compliance Review, Read-Only Audit. Each row: `is_system=true`, `status='active'`, description, and a permission_key set derived from the role catalog.
11. **Table columns.** Name, Description, Included modules (chips), # permissions, # privileged, Roles using it, Last updated, Status pill, Actions menu. Add filters: status (active / archived), scope (system / custom), search.
12. **Actions menu per row.**
    - **View Template** → `TemplateDetailsDrawer` with full metadata + permission list grouped by module.
    - **Compare Template** → side-by-side vs another template or a role (reuses `CompareRolesMatrix` layout).
    - **Clone Template** → creates an editable custom copy (`is_system=false`).
    - **Apply Template to Role** → opens `ApplyTemplateDialog` (see #13).
    - **Export Template** → downloads JSON `{name, description, permissions[], modules[]}`.
    - **Archive Custom Template** → sets `status='archived'`. System templates cannot be deleted or archived; buttons disabled with tooltip.
13. **Apply Template to Role dialog.** Shows: permissions being added, permissions being removed, privileged permissions introduced (highlighted), dependencies affected (from `permission_dependencies`), number of users affected (via `fetchRoleUserCounts`), and whether approval is required (any privileged add → true). Submitting **stages** a change set via `apply_permission_change_set` in draft mode; never writes production directly. Guardrails run per delta.

### 4. User Overrides tab — new work

14. **Table columns.** User (name + avatar), Employee ID, Primary Role, Override Type (Grant / Deny / Temporary), Permission (key + label), Module, Effective Date, Expiry Date, Status (Active / Pending / Expired / Revoked), Requested By, Approved By, Actions menu. Filters: type, status, module, role, expiring-soon.
15. **Create Override drawer.** Required: user (searchable), permission (searchable), reason (min 20 chars), effective date. Optional/required: expiry date — **required** when override introduces a privileged permission (Temporary Privileged Access). Fields:
    - Override type radio (Grant / Deny / Temporary).
    - Live "Impact preview" panel showing: current role-based value for that user+permission (from `RoleGrantMap`), proposed effective value, dependencies auto-pulled in, any SoD conflicts, whether approval is required.
16. **Guardrail enforcement.** Reuses `role-guardrails.checkRoleStageAllowed` semantics adapted to overrides: blocks overrides that would bypass mandatory Super Admin keys, Auditor write lock, Finance SoD, or platform-security-for-ops-agents. Blocks are hard; approval-required cases route through the existing change-set queue.
17. **Row actions menu.**
    - **View User** → `/admin/access-control?tab=role-access&user=<id>` (Role and Access tab in Users & Access).
    - **Review Override** → drawer with full audit fields + approve/reject if pending.
    - **Extend Temporary Access** → date picker; writes new `expires_at`, appends audit entry.
    - **Revoke Override** → sets `status='revoked'`, captures reason.
    - **View Audit History** → filtered admin_actions list for `(user_id, permission_key)`.
18. **Expiry lifecycle.** A lightweight client-side derivation flags `expires_at < now()` as `Expired`; a follow-up cron (out of scope this pass) will hard-flip status server-side.

---

### Technical details

- **DB additions**
  - Migration seeds 10 system templates into `permission_templates` + `permission_template_items` with `is_system=true`.
  - `permission_templates` gains `status` (active / archived) if not already present; system rows have delete/archive blocked by trigger.
  - `user_permission_overrides` already has `mode`, `expires_at`, `reason`, `created_at`; no schema change needed. Add index on `(expires_at) where expires_at is not null` for expiring-soon queries.
- **Repository (`permission-repository.ts`)**
  - `setPermissionDependencies(key, requires[])`, `setPermissionConflicts(key, entries[])`.
  - `listTemplates({includeArchived})`, `getTemplate(id)`, `cloneTemplate(id, name)`, `archiveTemplate(id)`, `applyTemplateToRole(id, role, environment, {stage:true})`.
  - `listOverrides({filters})`, `createOverride(payload)`, `extendOverride(id, expires_at)`, `revokeOverride(id, reason)`.
- **New components**
  - `CloneRoleAsTemplateDialog`, `ResetRoleToDefaultDialog`.
  - `TemplateDetailsDrawer`, `ApplyTemplateDialog`, `TemplateCompareView`.
  - `CreateOverrideDrawer`, `OverrideImpactPreview`, `ReviewOverrideDrawer`, `ExtendOverrideDialog`.
- **Guardrails** unified in `role-guardrails.ts`: add `checkOverrideAllowed(userRole, permissionKey, mode)` reusing existing rule constants.
- **Feature Registry drawer** gets `Deprecate` / `Suspend` / `Reactivate` buttons; `RegisterPermissionDialog` locks the key field in edit mode and adds deps/conflicts multi-selects.
- **Role Detail** switches list rows to `PermissionToggleRow` when `canManage`, pushing into the shared staging buffer.

### Out of scope

- Server-side cron for auto-expiring overrides.
- Rewriting the Access Control users route naming.
- Virtualizing tables (catalog still ~90 keys).

---

Approve to implement in one pass: Role Detail gaps (1–5), Feature Registry gaps (6–8), Templates tab (10–13), Overrides tab (14–18).