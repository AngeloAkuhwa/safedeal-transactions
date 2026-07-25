## Scope
Complete the Users & Access screen with the full filter/search/sort/pagination surface, the requested statuses, and the row-level action menu. Keeps the existing drawers (Quick preview, Change Role, Review Permissions, Suspend) intact.

## 1. Status model — widen to 6 values

`internal_users.status` is a plain `text` column (verified — no enum, no CHECK). Extend the vocabulary:

- `invited` — invite sent, never signed in.
- `pending_approval` — awaiting a Super Admin decision (new).
- `active` — normal.
- `suspended` — temporarily blocked.
- `locked` — auto-locked (e.g. failed auth / security).  *(new)*
- `deactivated` — permanently disabled, retained for audit.  *(new — replaces "delete")*

Update: `InternalUserStatus` type, `STATUS_LABEL`, `STATUS_STYLES` in `badges.tsx`, and the `passesFilter` matrix. No DB migration needed for the column itself; the seed migration will only add a comment documenting the vocabulary.

## 2. Summary cards → 6 clickable KPI tiles

Rebuild `AccessSummaryCards.tsx` to render six equal cards on `xl:grid-cols-3` / `md:grid-cols-2`:

| Card | Filter applied on click |
|---|---|
| Active Admins | `admins` |
| Active Agents | `agents` |
| Pending Invitations | `invited` |
| Pending Access Approvals | `pending_approval` |
| Suspended or Locked Users | `suspended_or_locked` |
| Privileged Access Users | `privileged` (full + high) |

`AccessSummary` gains: `pending_invites`, `pending_approvals`, `suspended_or_locked`, `privileged_users`. Computed inside `fetchAccessDirectory` from the same in-memory set. Cards accept `onSelect` and highlight when the active filter matches.

## 3. Filter chips (10)

Replace the current 5 chips in `UserAccessFilters.tsx` with:

`All Users · Admins · Operational Agents · Finance · Compliance · Auditors · Pending Invitations · Pending Approval · Suspended · Privileged Access`

`AccessFilter` union grows to include `agents` (= operational agents), `finance`, `compliance`, `auditors`, `invited`, `pending_approval`, `suspended_or_locked`, `privileged`. Existing `identity` filter is retained internally but is not exposed as a top-level chip (identity officers are counted under Agents / can still be reached via role dropdown).

## 4. Advanced filter bar

New collapsible row under the chips with:

- **Search** — name, email, employee ID (`display_id`), or role label. Debounced 250 ms.
- **Role** select — multi-select combobox listing all 10 roles.
- **Department / team** select — populated from distinct `internal_users.department` values in the current result.
- **Status** select — the 6 status values.
- **Access level** select — full / high / standard / limited.
- **Clear all** button — resets chip filter + search + all advanced filters.

All filters compose with the chip filter (chip = broad slice, advanced = fine-grain).

## 5. Sort + pagination + rows-per-page + result count

New `TableToolbar` component above the table renders:

- Sort dropdown: Name (A→Z), Role, Status, Access Level, Last Active (default). Toggle asc/desc.
- Result count: `Showing 11–20 of 47 users`.
- Rows per page: 10 / 25 / 50 / 100.
- Prev / Next pagination with page number.

`fetchAccessDirectory` gains `page`, `pageSize`, `sortBy`, `sortDir` params and returns `{ summary, rows, total }`. Filtering/sorting/pagination is done in memory today (internal user set is small); the signature is server-ready so a future RPC can drop straight in.

## 6. Table columns (9)

`InternalUsersTable.tsx` rebuilt to:

| # | Column | Source |
|---|---|---|
| 1 | User | avatar + full_name |
| 2 | Employee ID | `display_id` |
| 3 | Email | `email` |
| 4 | Department / Team | `department ?? "—"` |
| 5 | Primary Role | `RoleBadge` + `+N` chip |
| 6 | Effective Access Level | `AccessLevelPill` |
| 7 | Status | `StatusBadge` (6 tones) |
| 8 | Last Active | `relativeTime` |
| 9 | Actions | dropdown menu (see §7) |

Entire row remains clickable → opens `UserDetailsDrawer` (quick preview). Clicks inside the actions cell stop propagation.

## 7. Actions menu (accessible)

Replace the inline icon buttons with a single `⋯` menu ( `DropdownMenu`) that always renders:

- View User
- Change Role
- Review Permissions
- View Access History (opens drawer on the Access History tab)
- Resend Invitation — visible only when `status === "invited"`
- Suspend User — visible when status is `active`
- Reactivate User — visible when status is `suspended` / `locked`
- Deactivate User — visible for any status except `deactivated`; destructive styling

Every trigger has a `title`/`aria-label`. `Resend Invitation` calls `admin-invite-internal-user` with a `resend: true` flag (already accepted by the existing edge function; if not, will add). `Deactivate User` calls a new service method that sets status = `deactivated` and writes an audit entry — **never deletes**.

## 8. State screens

Extend the state components already added last turn:

- `LoadingSkeleton` — used while `isLoading`.
- `EmptyState` — when the base directory returns zero rows.
- New `NoResultsState` — when filters/search yield zero of a non-empty base; includes a "Clear filters" button.
- New `PermissionDeniedState` — surfaced when the query throws a Supabase 42501 / `permission denied`. Includes a link back to `/admin` and an explanation.
- `ErrorState` — already exists; will keep its `Retry` button and trigger `refetch()`.

`AdminAccessControl.tsx` selects the appropriate state based on `isLoading` / `isError` / `error.code` / `rows.length` / whether any filters are applied.

## 9. Toasts

All mutations (invite, resend, role change, permission override, suspend, reactivate, deactivate, approve/reject request) surface success + failure via the existing `useToast` hook already wired on the page — same pattern as today, plus new toasts for `resend` and `deactivate`.

## 10. Files touched

- `src/services/admin-access-control.service.ts` — types (`InternalUserStatus`, `AccessFilter`, `AccessSummary`, `AccessDirectoryQuery`, `AccessDirectoryResponse`), `fetchAccessDirectory` (paging/sort/summary), new `deactivateInternalUser`, `resendInternalUserInvite`, updated `passesFilter`, `STATUS_LABEL`.
- `src/components/admin/access-control/AccessSummaryCards.tsx` — 6 clickable cards, active-state highlight, `onSelect` prop.
- `src/components/admin/access-control/UserAccessFilters.tsx` — 10 chip surface + advanced filter row + Clear all.
- `src/components/admin/access-control/AdvancedFilters.tsx` — new: role/department/status/access-level popovers.
- `src/components/admin/access-control/TableToolbar.tsx` — new: sort, result count, rows-per-page, pagination.
- `src/components/admin/access-control/InternalUsersTable.tsx` — 9 columns, actions menu with 8 items, tooltips, row click.
- `src/components/admin/access-control/badges.tsx` — 6-status style map + new "Locked" and "Deactivated" tones; add "Pending Approval" label.
- `src/components/admin/access-control/NoResultsState.tsx` + `PermissionDeniedState.tsx` — new.
- `src/pages/AdminAccessControl.tsx` — state selection, wiring for card→filter click, advanced filters, sort, pagination, new mutations (`deactivate`, `resend`), open-drawer-on-tab helper.

No database migration is required. `internal_users.status` already accepts arbitrary text; `deactivateInternalUser` is a plain `UPDATE`. If we want a hard guarantee, a follow-up migration can add a CHECK constraint — flagged but not part of this pass.
