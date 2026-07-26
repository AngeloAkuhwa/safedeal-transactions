## Remaining gaps vs the finish-line plan

Audit of what's actually in the repo against the 18-item plan. Landed pieces are called out so we don't re-do them; everything else is a real gap.

### 1. Role Detail tab

- **Landed**: KPI header, 7 accordions, "Clone as template" and "Reset to default" buttons (with protected-role tooltip), inline Change History section, `?role=…` deep link to Access Control.
- **Gap 1a — No inline staging.** `RoleDetailPanel` still renders the Granted / Denied / Privileged lists as static chips. Nothing pushes into `useStagedPermissionChanges`, so `role-guardrails.checkRoleStageAllowed` never runs from this tab and the `StagedChangesFooter` stays empty when admins work from here.
- **Gap 1b — Clone button is a stub.** `onCloneAsTemplate` is an optional prop that the page doesn't pass an implementation for. There is no `CloneRoleAsTemplateDialog` component; nothing calls `permissionRepo.createTemplate` from Role Detail; no post-save tab switch to Templates.
- **Gap 1c — Reset to Default is a stub.** No diff against seeded catalog defaults, no confirm drawer, no change-set staging. Button currently does nothing beyond the disabled/tooltip state.
- **Gap 1d — "View Change History" top action.** Only the inline accordion exists. No top-action button that scrolls to it or opens `?tab=change-history&role=<key>`.

### 2. Feature Registry tab

- **Landed**: Dependencies + Conflicts multi-selects in `RegisterPermissionDialog`, key locked with `<Lock/>` icon in edit mode, Suspend / Reactivate / Deprecate buttons in `FeatureDetailsDrawer`, hard delete disabled, env filter via global `EnvironmentSwitcher`.
- **No open gaps.** This tab is done per the plan.

### 3. Permission Templates tab

- **Landed**: 10 system templates seeded (`is_system=true`, `status='active'`), archive/system-protection trigger, filters (search / scope / status), rich table with Modules chips / # perms / # privileged / status pills, per-row actions (View, Apply, Clone, Export, Archive), `ApplyTemplateDialog` with add/remove/privileged/user-impact/approval-required and staging via change set, `CloneTemplateDialog`, in-drawer view grouped by module.
- **Gap 3a — "Roles using it" column missing.** Table has no count of roles whose grant set matches (or is a superset of) the template. Requires a small aggregation over `role_permissions` per env.
- **Gap 3b — Compare Template action missing.** Plan calls for a "Compare Template" row action that reuses `CompareRolesMatrix` layout to diff template↔template or template↔role. No `TemplateCompareView` component exists.
- **Gap 3c — Dedicated `TemplateDetailsDrawer`.** Current viewer is an inline `ViewTemplateSheet` inside `PermissionTemplateTable.tsx`. Plan calls for a standalone `TemplateDetailsDrawer` with full metadata (source role, created/updated by, is_system, status history) plus the grouped permission list. Cosmetic-but-listed.
- **Gap 3d — Dependencies-affected line in Apply dialog.** Diff panel shows add/remove/privileged/users/approval, but does not surface which `permission_dependencies` are pulled in by the additions. Plan #13 lists this explicitly.

### 4. User Overrides tab

- **Landed**: Env-aware table with expiry column + tone, Extend and Revoke dialogs (guardrail-checked via `checkOverrideAllowed`), Source badge, "Open" deep link to Access Control, expired-vs-soon derivation client-side.
- **Gap 4a — Create Override drawer missing.** No `CreateOverrideDrawer`, no `OverrideImpactPreview`. Admins cannot create an override from this tab today; the only creation path is the Access Control user drawer.
- **Gap 4b — Column set is thin.** Missing: Employee ID, Override Type pill (Grant / Deny / Temporary — Temporary derived from `expires_at != null` + privileged), Effective Date column, Status pill (Active / Pending / Expired / Revoked), Requested By, Approved By. Only User / Role / Perm / Mode / Source / Expires / Reason are present.
- **Gap 4c — Filters missing.** No filters for type, status, module, role, or "expiring soon". Table renders the raw list.
- **Gap 4d — Review Override drawer missing.** No dedicated `ReviewOverrideDrawer` for pending items with approve / reject and full audit fields. Pending overrides currently only flow through the generic `ReviewChangesDrawer` on the Approvals tab.
- **Gap 4e — "View Audit History" row action missing.** No filtered `admin_actions` view scoped to `(user_id, permission_key)` from the overrides row.
- **Gap 4f — Row actions menu shape.** Extend and Revoke exist as inline buttons; plan asks for a unified actions menu including View User, Review Override, Extend, Revoke, View Audit History.

### 5. Cross-cutting / repository

- **Gap 5a — `applyTemplateToRole` repo method not exposed.** Apply flow goes through `stageApplyTemplateToRole` in the workspace service and calls `submitChangeSet` directly. Plan asked for a single `permissionRepo.applyTemplateToRole(id, role, env, {stage:true})` seam. Small refactor.
- **Gap 5b — `permission_templates.status` archived filter is client-side.** Repo `listTemplates` doesn't accept `{includeArchived}` yet; the table just filters after fetch. Fine for ~10 rows, but the plan called it out.
- **Gap 5c — Expiring-soon index on `user_permission_overrides`.** Plan asked for a partial index on `(expires_at) where expires_at is not null` to support the "expiring soon" filter (Gap 4c). Not created.

### Out of scope (already agreed)

- Server-side cron for auto-expiring overrides.
- Access Control route renaming.
- Virtualizing tables.

---

### Suggested execution order if you approve

1. Templates: 3a "Roles using it" column, 3d dependencies line in Apply dialog, 3b TemplateCompareView, 3c standalone TemplateDetailsDrawer.
2. Overrides: 4b columns + 4c filters + 4f actions menu (same file), then 4a CreateOverrideDrawer + OverrideImpactPreview, then 4d ReviewOverrideDrawer, then 4e audit history view.
3. Role Detail: 1b CloneRoleAsTemplateDialog wired to Templates tab, 1c ResetRoleToDefaultDialog + staged diff, 1a inline staging via `PermissionToggleRow`, 1d top-action button.
4. Repo/DB: 5a `applyTemplateToRole` seam, 5b `listTemplates({includeArchived})`, 5c partial index migration.

Approve to proceed and I'll implement in that order.