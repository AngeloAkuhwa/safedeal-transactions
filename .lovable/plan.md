
# SafeDeal Internal Role & Permission Foundation

Extends `/admin/access-control` with a real role/permission model backed by Supabase, first-class **multi-role assignments per user**, and a global admin footer.

## 1. Admin footer (all admin pages)

Add `src/components/admin/AdminFooter.tsx` rendered inside `AdminLayout` beneath the page body:

```
© {year} SafeDeal Admin Portal. All rights reserved.     Privacy Policy   Terms of Service   Support
```

- Left: copyright, muted foreground, 13px. Year is dynamic.
- Right: three link buttons routing to `/privacy`, `/terms`, `/support` (use existing routes if present, otherwise `#`).
- Full width, `border-t border-border bg-card/40`, matches spacing in the attached screenshot.

## 2. Role catalogue (10 roles)

Replace the current 6-role enum with the full SafeDeal set:

`super_admin`, `senior_admin`, `dispute_manager`, `dispute_agent`, `support_agent`, `identity_officer`, `finance_operator`, `finance_approver`, `compliance_officer`, `auditor`.

Each role stores: display name, one-line description, `protected` flag (edits to `super_admin` and `finance_approver` require privileged approval), `is_system` flag, and a default permission set (see §3).

## 3. Multi-role assignments per user (first-class)

Users can hold **any number of roles simultaneously**. A user's effective permissions = **union** of every assigned role's permissions, then adjusted by user-specific overrides (§5).

- Join table `internal_user_roles(user_id, role_key, assigned_by, assigned_at, is_primary bool)` — composite PK, no unique-per-user constraint on role count.
- Exactly one role per user is flagged `is_primary` (used for the "primary role" column, avatar tint, and default landing screen). Changing primary is an audited action.
- Guardrails:
  - `super_admin` can only be combined with `super_admin` alone (enforced in DB trigger + UI).
  - `finance_operator` + `finance_approver` on the same user is blocked (segregation of duties) — trigger raises, UI warns.
  - Assigning/removing a role always writes an `audit_logs` entry with before/after role sets.
- UI treatment:
  - `InternalUsersTable` role column shows the primary role badge + `+N` chip; hover/tap reveals the full list.
  - Filters (`Admins`, `Agents`, `Finance`, `Compliance`, `Identity`, `Auditors`) match if **any** assigned role qualifies.
  - Search matches on any role label.

## 4. Permission catalogue (modules × actions)

Typed catalogue grouped by module:

Dashboard · Transactions · Escrow · Disputes · Identity Verification · Task Orchestration · Agent Performance · Flagged Users · Users & Access · Permission Management · Financial Controls · Audit Logs · Reports & Exports · Platform Configuration

Granular actions (only emitted where meaningful per module): `view`, `create`, `update`, `assign`, `reassign`, `approve`, `reject`, `resolve`, `escalate`, `suspend`, `export`, `configure`, `manage_permissions`.

Keys are `module.action` (e.g. `disputes.assign`, `financial_controls.approve`, `permissions.manage_permissions`). Catalogue lives in `src/services/permission-catalog.ts` as the single source of truth for UI and seed migration.

## 5. Derived Access Level (never user-picked)

Access Level is computed from effective permissions, not editable:

- **Full** — `super_admin` role present.
- **High** — any of: `permissions.manage_permissions`, `financial_controls.approve`, `users.suspend`, `platform_configuration.configure`, `compliance.*` approve/configure.
- **Standard** — has any `create/update/assign/resolve` operational permission but nothing High.
- **Limited** — only `*.view` / `*.export`.

Implemented as pure fn `deriveAccessLevel(perms: string[]): AccessLevel` used by:
- UI badge on table + drawer (read-only pill).
- DB function `internal_effective_access_level(_user_id)` mirroring the TS derivation for server-side filtering.

Access Level `<Select>` removed from `AddUserDrawer` and `ChangeRoleDrawer`.

## 6. Database (Lovable Cloud)

Single migration adds, with GRANTs + RLS + `has_role` gating:

- `internal_roles(key text pk, name, description, protected bool, is_system bool)`
- `permissions(key text pk, module text, action text, label, description)`
- `role_permissions(role_key fk, permission_key fk, composite pk)`
- `internal_users(id uuid pk → auth.users, display_id, full_name, email, department, status, two_factor_enabled, last_active_at, created_by)`
- `internal_user_roles(user_id, role_key, is_primary bool, assigned_by, assigned_at, composite pk)` — **multi-role, one primary**
- `user_permission_overrides(user_id, permission_key, mode enum grant|revoke, reason, granted_by, composite pk)`
- `access_change_requests(id, target_user_id, requested_by, change_type enum role|permission|suspend|reactivate, payload jsonb, status enum pending|approved|rejected, reviewed_by, reviewed_at, reason)`
- Reuse existing `audit_logs` for all mutations.

SQL helpers (SECURITY DEFINER, `search_path = public`):
- `internal_effective_permissions(_user_id uuid) returns text[]` = union of role_permissions across all assigned roles, plus `grant` overrides, minus `revoke` overrides.
- `internal_effective_access_level(_user_id uuid) returns text` mirrors §5.
- Triggers enforce the multi-role guardrails in §3 and the single-primary invariant.

Extend the existing `app_role` enum with the 10 role keys via `ALTER TYPE ... ADD VALUE` in the same migration so `has_role()` continues to be the sole RLS gate.

RLS:
- `super_admin` and `senior_admin` read/write `internal_*` tables.
- `finance_approver` required to approve finance-scoped `access_change_requests`; `super_admin` required to approve protected-role changes.
- `auditor` gets read-only on `permissions`, `role_permissions`, `audit_logs`.
- All new tables deny anon.

Seed migration inserts the 10 roles, the full permission catalogue, and default role→permission mappings described in §2/§4.

## 7. Service layer refactor

Rewrite `src/services/admin-access-control.service.ts` against Supabase (mock store removed):
- `fetchAccessDirectory` — server-side filter/search, returns per-user `roles: string[]`, `primary_role`, effective permissions, derived access level.
- `inviteInternalUser` → edge fn `admin-invite-internal-user` (service-role auth create, insert `internal_users`, seed initial role(s), send invite email, audit).
- `updateUserRoles({ user_id, roles, primary_role, reason })` — edge fn that replaces role set atomically; when any protected role is added/removed it queues an `access_change_requests` row instead of applying immediately.
- `updatePermissionOverrides`, `suspendInternalUser`, `reactivateInternalUser` — audited edge fns.
- `listAccessChangeRequests`, `reviewAccessChangeRequest(id, approve|reject, reason)` — new endpoints.
- All mutations funnel through the existing `logAdminAction` helper (IP + UA + JSONB diff).

## 8. UI updates

- `AddUserDrawer`: **multi-select** role chips (all 10 roles), one marked primary; Access Level field removed, replaced by derived read-only pill preview; validation for the segregation guardrails.
- `ChangeRoleDrawer` renamed to `ManageRolesDrawer`: same multi-select + primary picker + reason; banner "This change requires Super Admin approval" when a protected role is involved.
- `ReviewPermissionsDrawer`: renders full module catalogue; each row shows Base (from union of roles) vs Override (grant/revoke) as a tri-state control; `super_admin` still locked to wildcard.
- `InternalUsersTable`: primary role badge + `+N` role chip; Access Level pill is read-only; filter chips extended with `Finance`, `Compliance`, `Identity`, `Auditors`.
- New **Approvals** tab on `AdminAccessControl` page — pending `access_change_requests` with Approve/Reject (visible only to Super Admin / Finance Approver).
- `UserDetailsDrawer`: shows every assigned role, primary indicator, effective permission count, and links to the Approvals tab when a pending request exists for that user.

## 9. Out of scope

- Building Privacy / Terms / Support marketing pages.
- Rolling the new permission checks into every existing admin edge function — this plan installs the model + console; per-module enforcement is a follow-up.
- Impersonation (still deferred).

## Implementation order

1. Migration: enum extension, tables, RLS, GRANTs, seed roles/permissions/mappings, effective-permission + guardrail functions and triggers.
2. `permission-catalog.ts` + `deriveAccessLevel` + unit tests.
3. Edge functions: invite, update-roles, update-overrides, suspend/reactivate, list/review approval requests.
4. Refactor `admin-access-control.service.ts` to call the above.
5. Update drawers (multi-role picker + primary) + table + Approvals tab.
6. Add `AdminFooter` and mount in `AdminLayout`.
7. Typecheck + extend `admin-auth.contract.test.ts` for the new edge functions.
