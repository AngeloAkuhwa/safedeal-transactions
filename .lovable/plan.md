# Role Matrix — honest completion check + polish plan

## Verdict: ~85% done, not 100%

The plan's structural spec landed: All Roles matrix with frozen first column + sticky headers, Compare mode with 2–4 role picker, filter toolbar, staging buffer, sticky submit footer, dependency + conflict analysis, read-only enforcement. Files exist and are wired in `RoleMatrix.tsx`.

### Still missing vs the approved plan

1. **URL sync** — `useRoleMatrixFilters` is pure `useState`. Nothing writes/reads `?q=&mods=&risk=&roles=&env=&mode=`, so links aren't shareable as promised.
2. **Environment switcher** — toolbar renders an Environment popover when `environmentSupported` is true, but there's no `onToggle` (`() => { /* wired in follow-up */ }`), no DB column, no filter application. Either finish B2 or hide the control entirely per the plan's own rule.
3. **Bulk module actions** — Grant all / Revoke all non-mandatory / Reset to role default with confirm dialog ("X permissions will change · Y users hold this role"). Not present on module header rows.
4. **Dependency data source** — `permission-dependencies.ts` is a hardcoded array. Plan called for a `permission_dependencies` table + `listPermissionDependencies()` repository reader. Skipped.
5. **Virtualisation** — no `@tanstack/react-virtual`. Fine while catalog < ~120 rows, but not implemented.
6. **Copy Permissions preview drawer** — currently uses `window.confirm()` with a text summary. Plan called for a preview drawer showing adds / removes / unchanged before staging.
7. **Unsaved-changes route guard** — staging survives in memory, but there's no "You have unsaved staged changes" prompt on navigation.
8. **Compare mode "differences only" respect** — toggle exists in toolbar, but Compare view ignores it (Compare is already diff-first, so behaviour is defensible — needs an explicit decision or hide the chip in Compare mode).

## Polish for the sections in your screenshots

Screenshots show Compare mode Sections rendering as flat `<details>` with title + count and cramped body content. Make them read like the Feature Registry cards.

**S1. Section shell**
- Replace `<details>/<summary>` with `PermissionPanel` (rounded-2xl, glass, subtle inner padding) + a header row: icon chip (tone-tinted), title, count pill, chevron on the right, optional right-slot ("Copy to…" quick action).
- Tone accents on the *icon chip only*, not on the whole card border, so Danger/Warn read as signal not noise.
- Kill the `border-t` divider between summary and body; use spacing.

**S2. Copy Permissions panel**
- Empty state today ("COPY PERMISSIONS" label with no body) looks broken. Replace with two-column controls: **From** role select · arrow · **To** role select · "Preview & stage" CTA that opens the new `CopyPermissionsPreview` drawer.
- Show a one-line hint: "Preview shows adds/removes before anything is staged."

**S3. Privileged permission differences table**
- Convert to card-row layout matching Feature Registry (no `<table>` borders): each row is a rounded hover surface with risk chip + label + `permission.key` on the left and a compact per-role check/× cluster on the right (icons in tinted circles: emerald tint for held, muted for not-held).
- Column headers become a lightweight sticky sub-header inside the card.

**S4. Unique to <Role> sections**
- Two-column responsive grid (`md:grid-cols-2`) of pill rows so 7 unique perms don't stretch as one long list.
- Add a right-aligned "Copy these to…" mini-menu (gated by `canWrite`) that pre-fills the Copy panel.

**S5. Missing dependencies + Conflicting responsibilities**
- Per-role subsections get a small header chip with the role name and count.
- Each row: leading tinted icon dot, then human sentence — "**Payouts — Approve** requires **Payouts — View**" — with the raw `permission.key` shown muted underneath, not inline `<code>` mid-sentence.
- Add a "Fix by staging" button on each row that stages the missing view grant (respect `canWrite` + protected role).

**S6. Shared by all selected roles**
- Collapsed by default is right. When open, render as a dense chip cloud (rounded-full muted pills, wrap) instead of a 3-col list — communicates "lots, unremarkable" better.

**S7. Empty-state polish**
- "No privileged permission differences." → centred icon + short sentence + subtle hint ("Selected roles have identical privileged access.").
- Same treatment for the other empty branches.

## Decisions before I build

1. **URL sync (item 1) + unsaved-changes guard (item 7)** — ship now, or defer? (Small; recommend ship.)
2. **Environment switcher (item 2)** — hide entirely for this pass, or land the B2 migration + `environment` column and filter now?
3. **Bulk module actions + Copy Preview drawer (items 3, 6)** — in-scope for this pass, or a follow-up? These are the two biggest gaps between "landed" and "spec complete".
4. **`permission_dependencies` table (item 4)** — migrate now with a seeded starter list, or keep the code-side array until the ruleset stabilises?
5. **Virtualisation (item 5)** — skip until catalog grows, or wire `@tanstack/react-virtual` now?

Approve the polish list + your calls on 1–5 and I'll execute in one build pass.
