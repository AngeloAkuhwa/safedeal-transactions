# Permission Matrix — Finish-line plan (v3)

Additive only. No key/role renames. v3 keeps every v2 item and adds a visual-language pass inspired by the reference screenshots: sectioned panels, no horizontal divider lines across rows or sections, pill-shaped state chips with generous padding.

---

## Part A — Original 10 gaps: status vs. remaining

| # | Item | Status | Remaining work |
|---|---|---|---|
| 1 | RLS/GRANTs on new tables | Done | — |
| 2 | Repository write surface | Done | — |
| 3 | Atomic apply RPC | Done | — |
| 4 | Workspace service → thin aggregator | Done | — |
| 5 | Real row-state derivation (`restricted`, `pending`, `is_system_default`) | Partial | Extract `derivePermissionRowState()` helper; load `access_change_requests` once at page level; feed `FeatureRegistryTable`, `PermissionDetailsDrawer`, `UserOverrideTable` |
| 6 | Source chips everywhere | Partial | Chip lives in drawer + override table. Still missing: `FeatureDetailsDrawer` per-role/user breakdown; role-vs-template auto-detection (`role_template` vs `direct_role`) |
| 7 | Templates via real tables | Partial | `PermissionTemplateTable` still uses `system_settings` fallback. Rewrite to repo CRUD + `submitChangeSet({target_scope:'template'})`; one-shot JSON→table migration on first load |
| 8 | Change-set write path from bulk edits | Not done | `RoleMatrix` is read-only; wire "Save changes" → `submitChangeSet` per role. Drawer add/remove override → `submitChangeSet({target_scope:'user'})`. Remove any direct writes to `role_permissions` / `user_permission_overrides` |
| 9 | Label rename (Full/Partial/No Access) | Done | — |
| 10 | Deprecate `PRIVILEGED_ACTIONS` | Partial | Sweep remaining callers → `getPermissionRisk(key)`; keep shim with `@deprecated` |

Plus: contract test `src/__tests__/permission-matrix.contract.test.ts` — asserts repo covers the interface and no non-repo file imports `supabase` for permission tables.

---

## Part B — Screenshot-driven UI items

### B1. Fix "Partial Access" chip padding + wrapping

Symptom: "Partial Access 1/2" wraps across two lines and sits unevenly next to Full/No Access.

Fix in `PermissionStateCell`:
- `inline-flex items-center gap-1.5 whitespace-nowrap`, `px-2.5 py-1`, min-height `h-7`.
- Fraction badge: `ml-1 rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] font-mono leading-none`.
- `<td>` gets `align-middle`; drop column `max-w` so the row height stays uniform and the table scrolls horizontally.
- Same treatment in `FeatureRegistryTable` and `FeatureDetailsDrawer`.

### B2. Environment switcher (Production / Staging / Development)

- Additive nullable `environment text` columns on `role_permissions`, `user_permission_overrides`, `permission_change_sets` (CHECK in `('production','staging','development')`, NULL = applies to all). Update `apply_permission_change_set` to carry env through.
- Repo: add `environment` filter to `listRoleGrantMap`, `listOverrides`, `submitChangeSet`.
- UI: replace the static "SOON" pill with a real segmented control `[Production | Staging | Development]` — persisted to `?env=` + `sessionStorage`, default `production`. Matrix, Feature Registry, User Overrides, Templates, Approvals all consume it; History adds an env column.
- Only super_admin or holders of `permissions.manage_permissions` may switch off production; others see the control disabled with a tooltip.

Out of scope: promotion/copy flow between environments.

---

## Part C — Visual language pass (new)

Reference: uploaded screenshots. Copy the **feel** (sectioned rounded panels, generous spacing, chip-based state, no divider lines between rows or sections) — do not port colors, copy, or component structure. All colors continue to come from existing semantic tokens.

### C1. Kill horizontal divider lines everywhere

Global rule for this screen: no `border-b`, no `divide-y`, no `<Separator />` between feature rows, between section headers, or between panels. Spacing replaces lines.

- `FeatureRegistryTable`, `RoleMatrix`, `UserOverrideTable`, History table:
  - Replace `border-b border-border/60` on rows with `space-y-1` (or `[&>tr]:my-1`) and give each row `rounded-lg bg-background/40` on hover only.
  - Section group headers (e.g. `DASHBOARD & ANALYTICS`) become uppercase muted labels with `pt-4 pb-2` spacing — no rule underneath.
  - `<thead>` uses `bg-transparent`; header cells rely on `text-[11px] uppercase tracking-wider text-muted-foreground` for separation, no bottom border.
- Panels (`How permissions work`, `Access State Definitions`, filter row, `Permission Matrix`, `Quick Actions`) stack with `gap-6`, each a self-contained card — no `<Separator />` between them.

### C2. Panel shell shared component

Introduce `PermissionPanel` wrapper used by every section on the page:
- `rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm p-5 md:p-6`
- Header row: optional icon tile (circular, `h-9 w-9 bg-primary/10 text-primary`), title (`text-base font-semibold`), subtitle muted, right-slot for actions.
- No internal divider between header and body — spacing `mt-4` handles it.
- Consumed by `HowPermissionsWorkPanel`, `AccessStateDefinitionsPanel`, `FiltersPanel`, `PermissionMatrixPanel`, `QuickActionsPanel`.

### C3. Redesigned "How permissions work" panel

Replaces the current thin band. Uses `PermissionPanel`.
- Header: `Info` icon tile, title `How permissions work`, subtitle "Overview of access states, roles and override behavior", collapse chevron on the right (state persisted to localStorage). Collapsed shows a one-line summary.
- Intro paragraph: `text-sm text-muted-foreground leading-relaxed max-w-3xl`.
- Legend: **3-column responsive grid** (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`) of legend cards. Each card:
  - `flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-3`
  - Reuses `PermissionRowStateBadge` so legend + table never drift.
  - Bold label + one-line muted description.
- Six cards: Full, Limited, None, Override, Restricted, Pending.

### C4. Access State Definitions panel (new, mirrors screenshot feel)

New sibling panel below "How permissions work" — a **6-up card grid** styled like the reference. Purely presentational, backed by `PermissionRowStateBadge` values so nothing forks:
- `grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3`
- Each cell: circular icon (`h-10 w-10`) in that state's tinted background, label under it, one-line description muted. No dividers between cells; only gap.
- No new colors; reuses the state palette already tokenised.

### C5. Filters row as a panel

Wrap the filters (Search / Role / Feature Group / Environment) in `PermissionPanel` with no header. Replace the "legend" (Full / Limited / None) inline chips with the same `PermissionRowStateBadge` mini-chips for consistency. No border below the panel.

### C6. Matrix body — chip cells, not filled rectangles

Match the reference chip aesthetic while keeping the fraction badge:
- Cell chip: `rounded-full`, `px-3 py-1`, tinted background (`bg-<state>/15 text-<state>-foreground`), no border.
- Rows separated by `space-y-1` and hover `bg-muted/30 rounded-lg`, not by a border.
- Group headers (`DASHBOARD & ANALYTICS` etc.) become uppercase muted section labels sitting inside the same panel with `pt-5 pb-2`, no underline.

### C7. Quick Actions panel

Optional (renders if page has slot content): 4-up grid of action cards — icon tile + title + subtitle — using `PermissionPanel` shell. No dividers between cards, just gap.

---

## Implementation sequence

1. C1 kill divider lines + C2 `PermissionPanel` shell (pure presentation, zero risk).
2. B1 chip padding + C6 chip cells.
3. C3 "How permissions work" redesign + C4 Access State Definitions panel + C5 filter panel.
4. Gap #5 row-state helper + `access_change_requests` page-level load.
5. Gap #6 role-vs-template detection + `FeatureDetailsDrawer` source chip.
6. Gap #7 template CRUD via repo + one-shot JSON migration.
7. Gap #8 `RoleMatrix` + drawer writes routed through `submitChangeSet`.
8. B2 environment column migration + repo/UI wiring.
9. Gap #10 sweep + contract test.

## Out of scope

- Impersonation module.
- Multi-environment promotion/copy flow.
- Users & Access screen rewrite.
- Any color/token additions — visual pass reuses existing tokens only.

## Technical details

- New shared components: `PermissionPanel`, `HowPermissionsWorkPanel`, `AccessStateDefinitionsPanel`, `EnvironmentSwitcher`, `derive-row-state.ts`.
- Migrations (additive): `role_permissions.environment`, `user_permission_overrides.environment`, `permission_change_sets.environment`; update `apply_permission_change_set` to carry env.
- Files touched: `src/pages/AdminPermissionMatrix.tsx`, `src/components/admin/permission-matrix/{PermissionStateCell,FeatureRegistryTable,FeatureDetailsDrawer,PermissionDetailsDrawer,UserOverrideTable,PermissionTemplateTable,RoleMatrix}.tsx`, `src/services/{permission-repository,permission-workspace.service,permission-catalog}.ts`.
