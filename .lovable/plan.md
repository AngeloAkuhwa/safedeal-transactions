# Adopt global SafeDeal admin implementation rules

Store your rules as permanent project memory so every future change is checked against them before any code is written.

## What gets saved

A new memory entry `Admin implementation rules` containing:

1. Inspect existing admin codebase, database schema, auth setup, permission hooks, shared components and routes before changing anything.
2. Preserve the existing dark admin design system: sidebar, typography, spacing, colours, tables, cards, drawers, dialogs, badges, loading states, responsive behaviour.
3. Reuse existing components, hooks, route patterns, services, database tables and permission keys.
4. No second permission system, no parallel mock-data source.
5. Never rename or replace roles already stored in the system.
6. Stable role IDs and permission keys internally; display labels never control authorization.
7. Authorization enforced in both the UI (navigation and action visibility) and backend/database policies, so direct URLs or API calls cannot bypass it.
8. Viewing a parent module never implies a mutation permission.
9. Every important mutation: confirmation where appropriate, loading and disabled states, success and failure feedback, audit logging, idempotency protection.
10. Never delete or overwrite production-style data; any backfill ships with a validation/dry-run report first.
11. No placeholder buttons, "coming soon" text, dead links, blank pages or console errors.
12. Error boundaries so a failing drawer, query or child component cannot unmount the whole admin page.
13. Report after each implementation: files changed, migrations added, permission changes, automated tests added, manual scenarios tested, anything still blocked.
14. Every task starts with a short implementation plan naming the specific components, tables, services and routes to be modified.

A short line is also added to the always-in-context Core rules so the constraint applies even before the detailed file is opened.

## Technical detail

- New memory file `mem://rules/admin-implementation-rules` (type: preference).
- `mem://index.md` updated: one Core bullet plus a Memories reference.
- No application code, database or permission changes in this step.

## Applying it going forward

Each subsequent correction prompt will begin with a short plan listing the exact components, tables, services and routes touched, then implementation, then the required report.