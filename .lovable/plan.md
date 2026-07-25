
# Support Agent access + nested-route authorization

## Goal
Make the Support Agent role able to fully investigate transactions, disputes and flagged users (including all read-only nested tabs and detail routes), while keeping every sensitive action (financial approvals, escrow release, payouts, suspensions, exports, config, impersonation, restricted identity docs, permission mgmt) gated behind explicit permissions. Rules must be role-driven — no per-email hardcoding.

## Current state (verified)
- `support_agent` seed grants: `dashboard.view`, `transactions.view`, `disputes.view`, `disputes.escalate`, `flagged_users.view`, `identity_verification.view`. (migration `20260725182513…`)
- Route map (`src/services/admin-route-permissions.ts`) is prefix-based — `/admin/transactions/:id` already inherits `transactions.view`, and the admin dispute/flagged detail pages live under the same prefixes. So parent view already unlocks nested tabs at the router level, but the map has no explicit metadata for action routes (`export`, `update`, `resolve`, `remove_flag`, `suspend`).
- Permission catalog (`src/services/permission-catalog.ts`) lacks the granular actions the spec asks for: `disputes.view_assigned`, `disputes.add_internal_note`, `disputes.request_information`, `disputes.request_evidence`, `disputes.update_status`, `disputes.resolve_assigned`, `disputes.resolve_all`, `flagged_users.remove_flag`, `users.suspend` (as a distinct key).
- Edge functions already use `requirePermission`: `admin-transaction-detail` → `transactions.view`, `admin-transactions-monitor` → `transactions.view`, `admin-disputes-queue` → `disputes.view`, `admin-flagged-users` / `admin-flagged-user-detail` → `flagged_users.view`, `admin-transaction-actions` → `transactions.update`, `admin-dispute-transition` → `disputes.update`, `admin-flagged-users-action` → `flagged_users.update`. Good baseline.
- `AdminDisputeDetail.tsx` loads dispute + full transaction detail via `admin-transaction-detail` (currently `transactions.view`). Support Agent already has that grant, so the detail page works — but conceptually a dispute-scoped viewer should also succeed via `disputes.view`.

## Changes

### 1. Permission catalog (`src/services/permission-catalog.ts`)
- Add new actions to `PermissionAction`: `view_assigned`, `add_internal_note`, `request_information`, `request_evidence`, `update_status`, `resolve_assigned`, `resolve_all`, `remove_flag`.
- Extend module action lists:
  - `disputes`: add `view_assigned`, `add_internal_note`, `request_information`, `request_evidence`, `update_status`, `resolve_assigned`, `resolve_all` (keep existing `resolve` as alias / deprecated).
  - `flagged_users`: add `remove_flag`.
  - `users_and_access`: `suspend` already present — used as `users_and_access.suspend`. Add a friendly alias key `users.suspend` (or standardize the route map to `users_and_access.suspend`; pick the latter to avoid a new module).
- Add labels in `ACTION_LABEL`.

### 2. Seed migration (new file `supabase/migrations/…_support_agent_perms.sql`)
Rewrite `role_permissions` rows for `support_agent`:
```
dashboard.view
transactions.view
disputes.view
disputes.view_assigned
disputes.add_internal_note
disputes.request_information
disputes.request_evidence
disputes.update_status
disputes.resolve_assigned
disputes.escalate
flagged_users.view
```
Remove `identity_verification.view` (spec says restricted identity docs are separate). Same migration inserts the new permission keys into `permissions` catalog and refreshes `role_permissions` for support_agent (delete + reinsert scoped to that role only).

### 3. Route-permission map (`src/services/admin-route-permissions.ts`)
Convert the map to explicit entries per path (still longest-first), and add action routes as their own gated entries:
```
/admin/transactions/export        → transactions.export
/admin/transactions/:id/update    → transactions.update
/admin/transactions/:id           → transactions.view   (fallback prefix)
/admin/disputes/:id/resolve       → disputes.resolve_assigned
/admin/disputes/:id/escalate      → disputes.escalate
/admin/disputes/export            → disputes.export
/admin/disputes/:id               → disputes.view       (fallback prefix)
/admin/flagged-users/:id/remove-flag → flagged_users.remove_flag
/admin/flagged-users/export       → flagged_users.export
/admin/flagged-users/:id          → flagged_users.view  (fallback prefix)
```
Update `permissionForPath` matcher so an exact leaf path (e.g. `.../export`, `.../update`, `.../resolve`) wins over the parent-view fallback, while unknown nested read tabs still inherit the parent’s `*.view`. Document this rule in the file header: "Parent view unlocks all nested read tabs. Sensitive actions must be listed explicitly and never inherit view."

### 4. Backend enforcement
- `admin-transaction-detail`: accept `transactions.view` OR `disputes.view` OR `flagged_users.view` (support agents opening a case from Disputes/Flagged should not be forced into `transactions.view`). Implement by trying `requirePermission("transactions.view")` first, falling through to the alternates on `permission_denied`.
- `admin-dispute-transition`: split gating by action:
  - `resolve` → require `disputes.resolve_assigned` when the caller is the assigned agent, else `disputes.resolve_all`.
  - `escalate` → `disputes.escalate`.
  - `add_internal_note` → `disputes.add_internal_note`.
  - `request_information` / `request_evidence` → matching keys.
  - `update_status` → `disputes.update_status`.
  - Refunds/releases/payout-touching outcomes stay behind `financial_controls.approve` (enforced in-function).
- `admin-flagged-users-action`: gate `remove_flag` on `flagged_users.remove_flag`, `suspend` on `users_and_access.suspend`, others stay on `flagged_users.update`.
- `admin-transactions-monitor` export path: gate CSV/export branches on `transactions.export`.
- Add a shared helper `requireAnyPermission(req, keys[])` in `_shared/auth.ts` for the fallback pattern; keep 403 payload shape identical to existing `permission_denied`.

### 5. Frontend hide/disable
- In `AdminDisputeDetail.tsx`, `AdminTransactionDetail.tsx`, `AdminFlaggedUsers` detail: swap conditional rendering to use `useAdminPermissions().has(...)` with the granular keys. Buttons the user lacks: hide by default; where context matters (e.g. Resolve button on an assigned case), render disabled with a tooltip: “Requires <permission label>”.
- Sidebar (`AdminSidebar`) already filters by `canVisit`; no change needed beyond the new seed.

### 6. Escalation rules (server-side, in `admin-dispute-transition`)
Reject `resolve` from Support Agent (even with `resolve_assigned`) and force escalate when any of these hold on the case:
- outcome type implies refund / payout / escrow release,
- dispute `risk_level ∈ {high, critical}`,
- either party has `compliance_flag` / suspension / active investigation,
- amount exceeds `system_settings.support_agent_resolution_cap` (new platform setting, default ₦0 = always escalate financial outcomes).
Return `{ error: "escalation_required", reason }` — surface as an inline banner in the resolve dialog.

### 7. Tests (`src/__tests__/admin-auth.contract.test.ts`)
- Add a positive-path suite for `support_agent`: expect 200 from `admin-dashboard`, `admin-transactions-monitor`, `admin-transaction-detail`, `admin-disputes-queue`, `admin-flagged-users`, `admin-flagged-user-detail`.
- Add a negative-path suite for `support_agent`: expect 403 (`permission_denied`) from `admin-transaction-actions?type=release_funds`, `admin-transactions-monitor?export=csv`, `admin-flagged-users-action` remove_flag/suspend, `admin-payouts-*`, `admin-reconciliation-*`, `admin-settings-*`, `admin-invite-internal-user`, `admin-reveal-user-field`, `admin-user-detail-export`, `admin-audit-logs`, `admin-access-*`.
- Add a route unit test for `permissionForPath` covering the new leaf-vs-parent precedence.

### 8. QA checklist to run in build mode (signed in as Support Agent)
- Sidebar shows only Dashboard, Transactions, Disputes, Flagged Users.
- `/admin/transactions` opens; row click opens detail; every read-only tab (Overview, Parties, Timeline, Payment, Escrow, Related dispute, History) opens.
- `/admin/disputes` opens; detail + Evidence, Timeline, Communications, Notes tabs open. Add-note, Request info/evidence, Update status, Escalate all succeed. Resolve is allowed only on assigned cases within authority; otherwise the UI shows an escalation-required banner.
- `/admin/flagged-users` opens; detail + history tabs open. Remove-flag / Suspend buttons hidden.
- Direct URL to `/admin/settings`, `/admin/payouts`, `/admin/access-control`, `/admin/audit-logs`, `/admin/transactions/export`, `/admin/reconciliation` → `AdminAccessDenied` page.
- Post-login redirect preserves the originally requested permitted path.

## Not in scope
- Impersonation (deferred, separate feature).
- New nested `/admin/transactions/:id/timeline` sub-routes as literal URLs — current UI keeps tabs inside the detail page; the route map still documents them semantically for future refactors but no new React routes are added in this pass.
