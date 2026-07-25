## Support Agent RBAC — Finalization Plan (6 Gaps)

Close the remaining gaps from the Support Agent access + nested-route authorization spec so it hits 100%.

### 1. Route map — explicit leaf entries
File: `src/services/admin-route-permissions.ts`

Add leaf-first entries so nested action routes are gated independently of their parent detail page:
- `/admin/transactions/:id/update` → `transactions.update`
- `/admin/disputes/:id/resolve` → any of [`disputes.resolve_all`, `disputes.resolve_assigned`, `financial_controls.approve`]
- `/admin/disputes/:id/escalate` → `disputes.escalate`
- `/admin/flagged-users/:id/remove-flag` → `flagged_users.remove_flag`

Confirm `permissionForPath` matches most-specific first; add unit fixtures for each.

### 2. Server-side escalation policy
File: `supabase/functions/admin-transaction-actions/index.ts` (`resolve_dispute` branch)

Before allowing a `support_agent` to resolve:
- Load transaction: `amount`, `risk_level`, `compliance_flag`.
- Load platform setting `support_agent_resolution_cap` (₦, default e.g. 500,000) via `get_effective_setting`.
- Force escalation (return `escalation_required` + reason) when any of:
  - `risk_level in ('high','critical')`
  - `compliance_flag = true`
  - `amount > cap`
  - actor lacks `disputes.resolve_all` / `financial_controls.approve` and target is not assigned to actor.
- Only `financial_controls.approve` or `disputes.resolve_all` holders bypass the cap.
- Emit `admin_actions` row with reason code for audit.

Add `support_agent_resolution_cap` to system settings seed if absent.

### 3. Frontend hide/disable gating
Wire `useAdminPermissions().has(...)` on:
- `src/pages/AdminTransactionDetail.tsx` — hide/disable Update, Resolve Dispute, Escalate, Add Note, Request Info buttons per matching permission.
- `src/pages/AdminDisputeDetail.tsx` (or equivalent drawer) — Resolve, Escalate, Request Evidence, Update Status, Internal Note.
- `src/pages/AdminFlaggedUsers.tsx` row actions — Suspend vs Remove Flag split.
- Show a tooltip ("Requires escalation" / "Insufficient permission") on disabled controls.

### 4. Export gating in `admin-run-export`
File: `supabase/functions/admin-run-export/index.ts`

Map each export `type` to a required permission and enforce via `requirePermission`:
- `users_directory` → `users_and_access.export`
- `flagged_users` → `flagged_users.export`
- `transactions` → `transactions.export`
- `audit_logs` → `audit_logs.export`
- `escrow` → `escrow.export`

Reject with `403 { error: 'permission_denied', permission: '...' }` on miss.

### 5. Decision: `users_and_access.suspend` vs `flagged_users.suspend`
Recommendation: **keep `flagged_users.suspend`** for suspensions initiated from the Flagged Users queue (contextual, already wired), and reserve `users_and_access.suspend` for suspensions from the Users & Access directory. Both map to the same DB mutation but audit with distinct source.

Action:
- Leave `admin-flagged-users-action` on `flagged_users.suspend`.
- Ensure directory-side suspend endpoint (`admin-suspend-user` or equivalent) checks `users_and_access.suspend`.
- Document the split in `src/services/permission-catalog.ts` comments.

### 6. Tests + QA
- **Contract tests** (`src/__tests__/support-agent.contract.test.ts`):
  - Positive: support_agent can call `admin-transaction-detail`, `admin-dispute-transition` (update_status on assigned), `admin-transaction-actions` (add_internal_note, request_info), `admin-flagged-users-action` (remove_flag).
  - Negative: support_agent rejected on escalate without `disputes.escalate`, resolve over cap, export without `*.export`, suspend from directory without `users_and_access.suspend`.
- **Unit test** for `permissionForPath` covering all new leaf routes.
- **Manual QA pass** logged in as support_agent: dashboard → transactions → disputes → flagged users; verify hidden/disabled buttons and 403 shapes.

### Deploy
Redeploy: `admin-transaction-actions`, `admin-run-export`, and any directory suspend function touched.

### Next actions (execution order)
1. Route map leaves + `permissionForPath` unit test.
2. `admin-run-export` gating + deploy.
3. Escalation policy in `admin-transaction-actions` + deploy.
4. Frontend gating on 3 detail pages.
5. Directory suspend permission wiring.
6. Contract test suite + QA walk-through.
