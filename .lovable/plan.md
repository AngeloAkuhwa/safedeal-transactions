# Users & Access finalization — remaining work

**Not 100% done.** Roughly 70% complete. Below is exactly what's left, mapped to the original plan's numbering.

## Gap analysis (against the plan)

### §1 Safeguards
- [x] a — requester ≠ approver (in `reviewAccessChangeRequest`)
- [ ] **b — grantor must hold the permission**: helper `assertCallerHoldsPermissions` exists but is NOT called on the raise path (`requestPermissionOverride`, `updatePermissionOverrides`)
- [x] c — outrank check (`assertOutranksTarget`)
- [x] d — last super admin (`assertNotLastSuperAdmin`)
- [x] e — cannot self-escalate
- [ ] **f — work-impact warning**: service helper `fetchAssignedWorkImpact` exists but no drawer renders the yellow panel or the "I understand" checkbox
- [x] g — finance paranoid check (`assertFinanceParanoidCheck`)
- [ ] **h — reason enforcement**: consistent on review, inconsistent on raise (some paths still allow empty reason)
- [ ] **`requiresApproval()` router**: not centralised — routing logic still scattered across `requestRoleChange`, `requestPermissionOverride`, `updateUserRoles`, `updatePermissionOverrides`

### §2 Approvals page
- [x] Tabs (Pending/Approved/Rejected/Cancelled)
- [x] Review drawer with payload + deep-link
- [ ] **Before → After diff panel** (roles/permissions/suspend payload rendered side-by-side, not raw JSON)
- [ ] **Impact panel** in the drawer (open tasks, last-super-admin flag)
- [ ] **Inline safeguard hints** — Approve button greying out with the specific failing rule name when a–g would block

### §3 Unified audit trail
- [x] New `admin_action_type` enum values migrated
- [x] Canonical `writeAudit()` writes to `admin_actions` + mirrors `audit_logs`
- [ ] **Edge functions**: `admin-access-control-mutate` and `admin-access-review-request` NOT built — client writes directly, so IP / User-Agent are never captured
- [ ] **`result` and `entity_ref` fields**: not persisted on audit rows (payload includes them loosely; not queryable)

### §4 Routes & nav
- [x] `/admin/task-orchestration`, `/admin/agent-performance` Coming Soon pages
- [x] All admin routes registered in `BUILT_ROUTES`
- [ ] **`/admin/permissions` alias route** — not wired; redirect to `/admin/permission-matrix` missing
- [x] `UserDetailsDrawer` contextual buttons (approval, tasks, agent perf, audit logs)
- [x] `AccessHistoryTimeline` "View in audit logs" link
- [ ] **`ReviewPermissionsDrawer` → Manage Role Template** (Super Admin only) — not added

### §5 Drawer QA polish
- [x] `useDrawerSafety` + `useMutationOnce` hooks exist
- [ ] **Not wired into any drawer** — `AddUserDrawer`, `UserDetailsDrawer`, `ChangeRoleDrawer`, `ReviewPermissionsDrawer`, `SuspendUserDialog`, `ReactivateUserDialog`, Approval Detail all still use bare `saving` booleans and skip dirty-check
- [ ] Loading skeletons + error/empty state audit not done consistently
- [ ] Mobile full-screen sheet conversion not verified

### §6 Verification
- [ ] `access-safeguards.contract.test.ts` — missing
- [ ] `access-audit.contract.test.ts` — missing
- [ ] Manual QA pass — not run

---

## Finish plan (build-mode order)

Split into three batches so you can approve incrementally.

### Batch 1 — Service safeguards & approval-page polish (small, low-risk)
1. Add rule **b** guard to `requestPermissionOverride` + `updatePermissionOverrides`.
2. Enforce **h** (non-empty `reason`) uniformly on every raise path.
3. Introduce `requiresApproval(action, payload, caller, target)` in `admin-access-control.service.ts`; refactor the four raise paths to call it.
4. Extend `AdminAccessApprovals` `ReviewDrawer` with:
   - Structured Before → After diff renderer (per change_type)
   - Impact panel (calls `fetchAssignedWorkImpact` + `assertNotLastSuperAdmin` in preview mode)
   - Inline safeguard hint (runs safeguards a–g client-side before enabling Approve)

### Batch 2 — Drawer QA + rule f UI + missing nav
5. Add `/admin/permissions` route as a redirect to `/admin/permission-matrix`.
6. Add "Manage Role Template" button (Super Admin only) to `ReviewPermissionsDrawer`.
7. Wire `useDrawerSafety` + `useMutationOnce` into all seven drawers/dialogs.
8. Add rule f warning panel to `ChangeRoleDrawer` and `ReviewPermissionsDrawer` (yellow card + required "I understand" checkbox when `fetchAssignedWorkImpact.open_items > 0`).
9. Audit loading skeletons / empty / error / permission-denied states across the seven surfaces.

### Batch 3 — Edge-function pipeline + contract tests
10. Ship `admin-access-control-mutate` edge function (branches: role_update, permission_apply, suspend, reactivate, deactivate, invite_resend, session_revoke, task_reassign). Each branch calls `logAdminAction` with `ip`, `userAgent`, before/after diff, `approval_reference`, `result` (`success | blocked_by_safeguard | failed`), `entity_ref`.
11. Ship `admin-access-review-request` edge function; move review-time safeguards + audit writes into it.
12. Migrate client service methods to thin `supabase.functions.invoke` wrappers; drop direct table writes for these paths.
13. Add `result` + `entity_ref` columns to `admin_actions` (or store in `action_notes` JSON with a check) and expose them in the audit logs UI.
14. Add `src/__tests__/access-safeguards.contract.test.ts` — one case per rule a–h asserting the typed error code.
15. Add `src/__tests__/access-audit.contract.test.ts` — every mutation path produces exactly one canonical `admin_actions` row with the expected fields.

## Out of scope (unchanged)
- Task Orchestration / Agent Performance real dashboards
- New role definitions
- Non-admin flows

## Suggested next action
Approve **Batch 1** to close the safeguard + approvals-page gaps first — it's the highest-value, lowest-risk slice and unblocks the UI hints for rules a–g. Batches 2 and 3 can follow independently.
