## Feature Registry & Permission Matrix — production upgrade

Rebuild the existing `/admin/permission-matrix` page into a full workspace styled after the supplied Feature Registry HTML, while reusing SafeDeal's sidebar, header, theme, RBAC context and existing DB tables (`internal_roles`, `role_permissions`, `permissions`, `user_permission_overrides`, `access_change_requests`, `admin_actions`). No new app shell, no duplicate roles, no hardcoded records — all data comes from the same services that Users & Access already uses.

### Route & shell
- Keep `/admin/permission-matrix` as canonical. `/admin/permissions` continues to redirect there (already wired in `App.tsx`).
- Continue using `AdminLayout`. Title → **"Feature Registry & Permission Matrix"**, subtitle → **"Configure platform features, role permissions, individual overrides and privileged access controls."**
- Sticky sub-header inside the page hosts: Security Level badge (derived from viewer role), History button (deep-links Change History tab), Save Changes (enabled only when dirty edits + user has `permissions.manage_permissions`).

### Information architecture (tabs)
Tabs live in a new `PermissionWorkspaceTabs` component, URL-synced via `?tab=`:
1. **Role Matrix** — desktop grid (features × roles) fed by `role_permissions`. Horizontal scroll confined to matrix container. Cells render via `PermissionStateCell` (Full / Partial / None / Override / Restricted / Pending) matching the reference palette.
2. **Role Detail** — single-role deep view (default on tablet/mobile). Role picker + grouped feature list with per-action toggles. Used as the mobile fallback for the matrix.
3. **Feature Registry** — table of every module/permission from `PERMISSION_MODULES` joined with live `permissions` rows; shows risk (`isPrivilegedPermission`), roles granting it, override count. Row → `FeatureDetailsDrawer`.
4. **User Overrides** — reads `user_permission_overrides` joined with `internal_users`; filters by user/role/permission/mode. Row → `PermissionDetailsDrawer` (reuses existing override edit path in `admin-access-control.service.ts`).
5. **Permission Templates** — CRUD over a new lightweight `permission_templates` concept stored as JSON snapshots on `system_settings` (key `permissions.templates`) so we avoid new tables; Clone Template button in header hydrates from here.
6. **Pending Approvals** — reads `access_change_requests` where `status='pending'` scoped to permission/role changes; opens `ReviewChangesDrawer` (reuses existing approval RPC).
7. **Change History** — reads `admin_actions` filtered to `role_changed`, `permission_override_*`, `role_change_*`; rendered via `PermissionHistoryTable` with diff drawer.

### Overview & summary
- Replace the giant "Permission System Overview" + "Access State Definitions" blocks with one collapsible **"How permissions work"** panel (persist dismissed state in `localStorage: safedeal.permMatrix.helpDismissed`). Collapsed by default once dismissed.
- New `PermissionSummaryCards` row (6 cards, same glass-card styling as reference):
  - Active Roles → filters Role Matrix by non-empty roles
  - Registered Permissions → opens Feature Registry
  - Privileged Permissions → Feature Registry pre-filtered `risk=privileged`
  - User Overrides → opens User Overrides tab
  - Pending Approvals → opens Pending Approvals tab (with count badge)
  - Recent Changes → opens Change History tab (last 24h)
- Counts sourced from a single `usePermissionWorkspaceSummary` hook (parallel queries, cached via React Query).

### Filters
`PermissionFilters` row (View Mode, Role Filter, Feature Group, Environment placeholder disabled for now, plus legend). Shared across Role Matrix / Feature Registry / User Overrides via a small Zustand-less context.

### Components (all new under `src/components/admin/permission-matrix/`)
PermissionSummaryCards, PermissionWorkspaceTabs, PermissionFilters, RoleMatrix, RoleDetailPanel, FeatureRegistryTable, UserOverrideTable, PermissionTemplateTable, PendingApprovalTable, PermissionHistoryTable, PermissionStateCell, PermissionRiskBadge, ReviewChangesDrawer, PermissionDetailsDrawer, FeatureDetailsDrawer, EmptyState, ErrorState, LoadingSkeleton.

Drawers reuse `useDrawerSafety` and existing services — no duplicate mutation paths.

### Data & services
- New `src/services/permission-workspace.service.ts` wraps existing queries: role map, override list, approvals, admin_actions history, templates read/write via `system_settings`. No new client-side Supabase calls in components.
- All mutations go through existing `admin-access-control.service.ts` and `admin-log-access-action` edge function so audit + safeguards (self-lock, outrank checks) stay intact.
- RBAC: page-level gate `permissions.view`; edit affordances gated on `permissions.manage_permissions` via `useAdminPermissions()`; unauthorized viewers get read-only cells + hidden Save button.

### Responsive rules
- ≥`lg`: full Role Matrix with matrix-only horizontal scroll (`overflow-x-auto` inside a `max-w-full` container; page itself uses `overflow-x-hidden`).
- `<lg`: `PermissionWorkspaceTabs` swaps Role Matrix tab for Role Detail automatically; other tables become stacked cards.
- Summary cards: 6/3/2/1 columns across breakpoints.

### Visual fidelity
- Tokens from reference: surface `hsl(var(--card))`, borders `hsl(var(--border))`, blue accent = existing `--primary`, success/warning/danger reuse existing semantic tokens. State pill colors mapped: Full=success, Partial=warning, None=muted, Override=primary, Restricted=destructive, Pending=warning-outline.
- Inter font already global; icons via `lucide-react` (no FontAwesome).

### Out of scope (not touched)
- Users & Access screens, existing role seed data, existing edge functions' logic.
- No schema changes beyond storing template JSON in `system_settings` (no migration needed if key already usable; otherwise one tiny insert).

### Implementation sequence
1. Scaffold folder + shared types + `permission-workspace.service.ts` + summary hook.
2. Build `PermissionSummaryCards`, collapsible help panel, tab shell with URL sync.
3. Port RoleMatrix (from current page) into new `PermissionStateCell` styling; add filters.
4. RoleDetailPanel + mobile fallback.
5. FeatureRegistryTable + FeatureDetailsDrawer.
6. UserOverrideTable + PermissionDetailsDrawer (wired to existing override service).
7. PermissionTemplateTable (Clone Template action in header hooks here).
8. PendingApprovalTable + ReviewChangesDrawer (reuses approval service).
9. PermissionHistoryTable (admin_actions query + diff view).
10. Wire summary card clicks → tab/filter deep links; add empty/error/loading states everywhere; verify horizontal-overflow discipline and RBAC gating.