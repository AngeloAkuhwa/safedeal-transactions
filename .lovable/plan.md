## 1. Footer copyright — stop hardcoding the year

`src/components/admin/AdminFooter.tsx` currently prints `© 2024 SafeDeal Admin Portal`. Replace with a computed year so it always tracks the current date.

```tsx
const year = new Date().getFullYear();
// …
<div>© {year} SafeDeal Admin Portal</div>
```

Same footer already links `Privacy Policy`, `Terms of Service`, `Support` — layout stays unchanged.

## 2. Is the internal role / permission foundation done 100%?

Short answer: **yes, the foundation is in place** — verified against the current tree:

- **Tables (migration `20260725182513_…`)**: `internal_users`, `internal_roles`, `permissions`, `role_permissions`, `internal_user_roles`, `user_permission_overrides`, `access_change_requests` — all created with GRANTs + RLS. `audit_logs` already existed and is reused.
- **10 seeded roles**: super_admin, senior_admin, dispute_manager, dispute_agent, support_agent, identity_officer, finance_operator, finance_approver, compliance_officer, auditor — inserted with `protected` flag on super/senior/finance_approver.
- **14 modules** in `src/services/permission-catalog.ts`: Dashboard, Transactions, Escrow, Disputes, Identity Verification, Task Orchestration, Agent Performance, Flagged Users, Users & Access, Permission Management, Financial Controls, Audit Logs, Reports & Exports, Platform Configuration.
- **Granular actions** covered: view, create, update, assign, reassign, approve, reject, resolve, escalate, suspend, export, configure, manage_permissions.
- **Role permissions vs user overrides** stored in separate tables (`role_permissions` + `user_permission_overrides`); effective set computed by SQL fn `internal_effective_permissions` and mirrored client-side.
- **Access Level is derived, never picked**: `internal_effective_access_level` in SQL + `deriveAccessLevel` in TS. `AddUserDrawer` / `ChangeRoleDrawer` only expose role checkboxes + primary star — no Access Level control anywhere.
- **Guardrails**: `enforce_internal_role_rules` DB trigger + `validateRoleSet` client-side (super_admin exclusive; finance_operator vs finance_approver mutually exclusive; ≥1 role required).
- **Privileged approvals**: `access_change_requests` table + service layer route protected-role edits through it.
- **Multi-role assignments**: `internal_user_roles` (many-to-many) with `is_primary` — enforced across UI and DB.

### Small polish worth cleaning up (not blocking)

`HIGH_PERMISSIONS` in `permission-catalog.ts` references two keys that don't exist in the catalog:
- `compliance.approve`
- `compliance.configure`

There is no `compliance` module — compliance duties are covered by `audit_logs.*`, `flagged_users.*`, `financial_controls.approve`. These two stray keys never match, so they're dead entries. I'll remove them and keep `financial_controls.approve/configure`, `platform_configuration.configure`, `permissions.manage_permissions`, `users_and_access.suspend/manage_permissions` as the High-Access triggers.

## Files touched

- `src/components/admin/AdminFooter.tsx` — dynamic year.
- `src/services/permission-catalog.ts` — drop the two stray compliance keys from `HIGH_PERMISSIONS`.

No DB migration required.
