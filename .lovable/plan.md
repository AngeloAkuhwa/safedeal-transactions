## Permission Matrix — completion audit

### Already done
- All 7 tabs implemented (Role Matrix, Role Detail, Feature Registry, User Overrides, Templates, Pending Approvals, Change History).
- Summary cards, glass hero, tinted state pills with fraction badges, sticky-column fade, zebra rows, role icons, pill tabs.
- Filters (role/module/risk/search), URL-synced tab + role.
- Drawers: Feature details, Permission override details, Review changes.
- Templates persisted to `system_settings` (with localStorage fallback).
- Header CTAs: History → tab; "Manage in Users & Access" → `/admin/access-control`.
- Recent Changes (24h) card deep-links Change History with `since=24h`.
- Mobile fallback (Role Detail on < 1024 px).

### Broken (visible in screenshots)
1. **User Overrides tab** — `column user_permission_overrides.created_at does not exist`.
2. **Change History tab** — `column admin_actions.admin_id does not exist`.

Live schema (confirmed via `information_schema`):
- `user_permission_overrides` → `user_id, permission_key, mode, reason, granted_by, granted_at` (no `id`, no `created_at`).
- `admin_actions` → `id, admin_user_id, target_user_id, action_type, action_notes, created_at` (no `admin_id`, no `description`, no `metadata`).

### Fix (single file: `src/services/permission-workspace.service.ts`)

1. `fetchOverrides`
   - Select `user_id, permission_key, mode, reason, granted_by, granted_at`.
   - Order by `granted_at desc`.
   - Map `granted_at` → `OverrideRow.created_at`.

2. `fetchWorkspaceSummary`
   - Overrides head-count uses `user_id` (no `id` column exists).

3. `fetchChangeHistory`
   - Select `id, admin_user_id, target_user_id, action_type, action_notes, created_at`.
   - Map `admin_user_id` → `actor_id`, `action_notes` → `summary`, `metadata: null`.
   - Keep the `sinceHours` filter and action-type filter unchanged.

No DB migration, no UI change, no behavior change beyond making both tabs load.

### After fix — remaining polish (optional, not blocking 100%)
- The "How permissions work" legend lists Override / Restricted / Pending states that the matrix cells don't render yet (matrix uses full/partial/none only). Can be dropped or wired later; not required for the plan as approved.