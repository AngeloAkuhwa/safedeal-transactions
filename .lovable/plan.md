## Feature Registry & Permission Matrix — aesthetic pass + gap closure

### Part A — What the original plan is still missing

Verified against the shipped implementation:

1. **Templates persistence** — plan called for storing templates as a JSON snapshot on `system_settings` (key `permissions.templates`) so they sync across teammates. Current code writes to `localStorage` only, so templates are per-browser and invisible to other admins.
2. **Save Changes button** — currently just navigates to `/admin/access-control`. Plan called for it to be enabled only on dirty edits and gated on `permissions.manage_permissions`. There is no inline-edit surface yet, so the button is decorative. Fix: relabel to "Manage in Users & Access" (with `ArrowUpRight`) so it doesn't imply an unsaved-changes workflow, and keep the RBAC gate.
3. **Filter legend + Environment placeholder** — plan called for a legend chip row and a disabled Environment selector. Legend dots are present inline but not called out; Environment placeholder is missing.
4. **Deep-link from summary cards** — "Recent Changes (24h)" opens History tab but does not filter to last 24h. Add a `since=24h` param honored by the History query.
5. **Pending count in sticky sub-header** already works; History deep-link works.

Everything else in the original plan (tabs, URL sync, RBAC gating, mobile fallback, drawers, service layer, no schema churn beyond templates) is implemented.

### Part B — Aesthetic upgrade (visual language only, no logic changes)

The screens feel flat and dense: uniform dark cards, low contrast headings, oversized KPI tiles that dwarf the tabs, and pill cells that don't breathe. Tighten the hierarchy so the matrix — the actual product — leads.

**1. Hero band replaces the giant 6-card KPI row**

- Compact 3-up hero: Security posture (level + pending pill + last-change timestamp), Coverage donut (privileged vs standard permissions), Activity spark (recent changes 24h/7d).
- The remaining metrics (Active Roles, Registered Permissions, User Overrides, Pending Approvals) collapse into a slim inline chip strip above the tabs — click still deep-links to the right tab. Removes the "wall of tiles" feeling in the screenshots.

**2. Softer surface + accent system**

- Introduce a subtle gradient on the page background (`bg-[radial-gradient(...)]` using `--primary/5` at top-left, `--background` fill) so cards read as elevated instead of drifting on a flat black plane.
- Card surface: `bg-card/60` with `backdrop-blur`, `border-border/60`, `shadow-[0_1px_0_hsl(var(--border)/0.4)_inset]` for a glass feel matching the reference HTML.
- Add a 1px inner top highlight on primary CTAs and state pills for depth.

**3. Refined state pills (`PermissionStateCell`)**

- Replace full-width solid blocks with rounded rectangular chips (h-7, min-w 88px) using tinted backgrounds instead of saturated fills:
  - Full → `bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30`
  - Limited → `bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30` + fraction rendered as a monospaced badge on the right
  - None → `bg-muted/40 text-muted-foreground ring-1 ring-border`
  - Override / Restricted / Pending → primary / destructive / amber-outline variants.
- Uniform ring instead of shadow so alignment reads cleanly across the grid.

**4. Matrix polish**

- Sticky first column gets a right-edge gradient fade so horizontal scroll is discoverable.
- Zebra rows at 3% opacity, row-hover at 6%. Module label typography: 13px semibold + 11px muted "N permissions" (already close, just tighten leading).
- Column headers use small-caps 11px `tracking-wider`, role abbreviations wrap at 2 lines with `text-balance`.
- Add tiny role-icon glyph before each role name (Shield, Gavel, LifeBuoy, Wallet, etc.) sourced from a `ROLE_ICON` map — matches the reference HTML.

**5. Tabs**

- Move tab bar into a pill container that floats over the matrix (like the reference), with active tab using `bg-primary/10 text-primary ring-1 ring-primary/30` instead of solid primary — reduces visual weight.
- Counts render as `text-[10px]` monospaced badges.

**6. How permissions work panel**

- Collapse the 6 state cards into a single 2-row legend (label + colored dot + one-line description) inside the panel; removes the huge glass-tile section visible in screenshot 1.

**7. Filters**

- Group into a single toolbar strip (search left, three selects right, legend chips far right). Add the missing Environment select (disabled with "Production" default + tooltip).
- Reduce padding, use `h-9` controls.

**8. Typography + spacing tokens**

- Page vertical rhythm: `space-y-6` between hero / tabs / matrix (currently `space-y-4`).
- Section headings 15px semibold with 12px muted subtitles; body 13px.
- Add `text-balance` on long descriptive lines.

No new routes, no schema changes beyond a tiny `system_settings` upsert for templates, no changes to Users & Access, edge functions, or the RBAC context.

### Files touched

- `src/pages/AdminPermissionMatrix.tsx` — hero band, chip strip, background gradient, spacing, Save-changes relabel, `since=24h` param wire.
- `src/components/admin/permission-matrix/PermissionSummaryCards.tsx` → split into `PermissionHeroBand.tsx` + `PermissionMetricStrip.tsx`.
- `src/components/admin/permission-matrix/PermissionStateCell.tsx` — new chip visuals.
- `src/components/admin/permission-matrix/RoleMatrix.tsx` — sticky-column fade, zebra, role icons, header type.
- `src/components/admin/permission-matrix/PermissionWorkspaceTabs.tsx` — pill container styling.
- `src/components/admin/permission-matrix/HowPermissionsWorkPanel.tsx` — condensed legend.
- `src/components/admin/permission-matrix/PermissionFilters.tsx` — Environment placeholder, legend chips, tightened toolbar.
- `src/services/permission-workspace.service.ts` — templates read/write via `system_settings` (fallback to localStorage if RPC missing), History query accepts `sinceHours`.

### Out of scope

Users & Access, edge functions, database schema, RBAC logic, existing role seed data.
