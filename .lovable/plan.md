
## Status of the previous plan

Not 100%. What's shipped:
- Departments catalog, server-side Employee ID + immutability trigger, RoleSummaryCard, new types/validation in `admin-access-control.service.ts`, AddUserDrawer rewrite (sectioned), UserDetailsDrawer rewrite (5 tabs), expanded AccessHistoryTimeline, `useInternalPermissions` gating hook, `assigned-work.service.ts`.

Still open from the original plan:
1. `AdminAccessControl.tsx` wiring for the two new mutations — `deactivateUser` and `resendInvitation` — with audit-log writes and toast feedback.
2. Permission-gated **hide** (not disable) for footer actions using `useInternalPermissions` (Change Role, Review Permissions, Suspend/Reactivate, Deactivate, Resend Invitation).
3. Privileged-role branch: on invite of a `full`/`high` role, create an `access_change_requests` row and force `status = pending_approval` (currently drawer submits but doesn't route through the request table).
4. Tests: extend `access-level.test.ts` + add `invite-validation.test.ts` + `employee-id-format.test.ts`.
5. Reporting-manager helper line under primary role showing `"Reports to: <name> · <role>"` (data is fetched; the inline hint under the role picker isn't rendered yet).

## This turn — Add User drawer polish + Team dropdown

### A. Team becomes a dropdown backed by a catalog

No `teams` table exists and `internal_users.team` has no historical values, so there is nothing to populate a dynamic dropdown from. Introduce a small managed catalog analogous to departments, scoped per department so the picker only shows relevant teams.

- New `src/services/teams.catalog.ts`:
  - `TEAMS_BY_DEPARTMENT: Record<DepartmentKey, string[]>` with sensible defaults, e.g.
    - `trust_and_safety`: High-Value Cases, Fraud Ops, Account Integrity
    - `disputes`: Tier 1 Disputes, Tier 2 Disputes, Escalations
    - `finance`: Payouts, Reconciliation, Refunds
    - `compliance`: Regulatory, Policy, Audit
    - `identity_verification`: KYC Review, Appeals
    - `support`: Buyer Support, Seller Support, Partner Success
    - `engineering`: Platform, Reliability, Data
    - `executive`: Leadership
    - `other`: (empty → free-text fallback)
  - Helper `getTeamsForDepartment(dep)`.
- `AddUserDrawer.tsx`:
  - Replace the free-text Team input with shadcn `Select` populated from `getTeamsForDepartment(selectedDepartment)`.
  - Disabled until a department is chosen (helper text: "Select a department first").
  - Include a final `"Other…"` option that reveals a small inline input so operators can still type a bespoke team; the typed value is what gets saved.
  - When department changes, reset `team` to empty to avoid stale mismatches.
- `UserDetailsDrawer` / Overview tab: no schema change — team is still stored as free text on `internal_users.team`, so existing records keep rendering as-is.

No DB migration needed for teams.

### B. Aesthetic pass on the Add User drawer

Goal: make it feel like the rest of the admin (Audit Logs / Access Control cards) — calmer spacing, clearer section separation, better visual hierarchy on the right-hand Role Summary. All changes are presentational; no logic or service edits.

- **Drawer shell**
  - Widen to `sm:max-w-[980px]` and give the body a 2-column grid: left = form (min-w-0), right = sticky Role Summary card (`lg:sticky lg:top-4 self-start`).
  - Fixed header with title + subtitle + close, thin divider, subtle `bg-muted/30` header strip.
  - Fixed footer bar (border-t, `bg-background/95 backdrop-blur`) holding the "Send invitation immediately" switch on the left and the primary/secondary CTAs on the right; scroll only happens in the middle.
- **Section styling**
  - Replace the ALL-CAPS `IDENTITY / PLACEMENT / ACCESS` labels with a reusable `SectionHeader` (icon in a 6x6 tinted square + title + one-line helper). Icons: `IdCard`, `Building2`, `KeyRound`, `Send`.
  - Wrap each section in a soft `rounded-xl border border-border/60 bg-card/40 p-4` panel; consistent 12px gap between fields, 16px between sections.
  - Field labels: `text-xs font-medium text-muted-foreground uppercase tracking-wide`, inputs `h-10`.
- **Employee ID field**
  - Read-only styled pill: mono font, lock icon on the right, subtle dashed border, and helper text with an `Info` icon. Matches the screenshot the user shared.
- **Email field**
  - Inline availability indicator: spinner while checking, green check + "Available" or red x + "Already invited" (data already returned by `checkEmailAvailability`).
- **Reporting manager**
  - Under the select, render the promised helper: `Reports to: <full_name> · <primary_role>` in `text-xs text-muted-foreground`, only when a value is selected.
- **Role Summary card (right column)**
  - Sticky, `rounded-xl border bg-card p-4 space-y-4`.
  - Header row: role name (semibold) + access-level badge (color-coded: full=red, high=amber, standard=sky, limited=slate).
  - Sections with tiny dividers: Description, Modules (chip cloud), Important Permissions (green check chips), Notable Restrictions (red x chips), and a footer note "Access changes are logged to the audit trail" with a shield icon.
  - Empty state when no role picked: muted illustration line "Pick a role to preview its access footprint."
- **Roles picker**
  - Keep the existing `RolePicker` but wrap each tile in `rounded-lg border` with `hover:border-primary/40 transition`, and highlight the primary with a filled star chip in the corner.
- **Motion / feedback**
  - `transition-colors` on inputs, `focus-visible:ring-2 ring-primary/40`, and a subtle `animate-in fade-in-50` on the Role Summary when a role is chosen.
  - Toast on submit already exists; add a success toast that surfaces the assigned Employee ID once the invite returns.

### Files

```
add    src/services/teams.catalog.ts
edit   src/components/admin/access-control/AddUserDrawer.tsx        (Team → Select, layout/aesthetic rewrite, sticky footer, sticky Role Summary)
edit   src/components/admin/access-control/RoleSummaryCard.tsx      (visual polish: badges, chip clouds, empty state)
```

No DB, service, or route changes in this turn.

### Follow-up (still tracked, not in this turn unless you say so)

The 5 open items from the previous plan (deactivate/resend mutations, hide-based permission gating, privileged-role approval routing, three test files, reporting-manager hint under the primary-role picker) remain queued.

### Technical notes

- Team stays a free-text column in `internal_users`; the catalog is only a UI convenience so we can add/remove teams without a migration.
- The "Other…" escape hatch keeps the field forward-compatible when a real `teams` table is introduced later — swapping the catalog import for a `useTeams()` hook is a one-line change.
- All visual changes use existing shadcn primitives and semantic tokens (`bg-card`, `border-border`, `text-muted-foreground`) — no hardcoded colors, dark-mode safe.
