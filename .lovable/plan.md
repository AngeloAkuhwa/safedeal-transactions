## Feature Registry / Permission Matrix — finish-line plan status

All 18 items across the 4 tabs are implemented. Nothing outstanding from this plan.

### Verified against the codebase

**Role Detail (1–5)**
- `PermissionToggleRow` renders inline in `RoleDetailPanel` for Granted/Denied/Privileged lists when `canManage`, routing through the hoisted `useStagedPermissionChanges` buffer and `role-guardrails.checkRoleStageAllowed`.
- `CloneRoleAsTemplateDialog` and `ResetRoleToDefaultDialog` are present and wired.
- View Change History scroll + `/admin/access-control?role=…` link both in place.

**Feature Registry (6–9)**
- `RegisterPermissionDialog` has Dependencies + Conflicts multi-selects and locks the key field in edit mode.
- `FeatureDetailsDrawer` exposes Deprecate / Suspend / Reactivate for Super Admin.
- Environment filter served globally by `EnvironmentSwitcher`.

**Templates (10–13)**
- 10 system templates seeded via migration into `permission_templates` / `permission_template_items`.
- `PermissionTemplateTable` has the full column set, status/scope/search filters, and the row action menu (View, Compare, Clone, Apply, Export, Archive with system-row lock).
- `ApplyTemplateDialog` shows adds/removes, privileged highlights, dependencies pulled in, user-impact count, and stages via `apply_permission_change_set`.
- `TemplateCompareDialog` covers template↔template and template↔role compare.

**Overrides (14–18)**
- `UserOverrideTable` has the full column set + type/status/module/role/expiring-soon filters and expiry-derived status.
- `CreateOverrideDrawer` covers user/permission search, reason (≥20 chars), effective/expiry dates (expiry required for privileged), Grant/Deny/Temporary radio, and live Impact preview.
- `checkOverrideAllowed` in `role-guardrails.ts` enforces Super Admin mandatory keys, Auditor lock, Finance SoD, and ops-agent platform lock.
- Row actions: View User, Review Override (approve/reject in `PermissionDetailsDrawer`), Extend, Revoke, and `ViewOverrideAuditDialog` for `(user_id, permission_key)` history.

### Still out of scope (as declared in the original plan)
- Server-side cron to hard-flip expired overrides.
- Users route rename.
- Table virtualization.

No new work required. Approve to close this plan out, or point me at a specific screen you want polished next.
