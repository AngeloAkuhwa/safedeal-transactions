## Status of the Users & Access scope

Verified against the current files. **~95% done.** Everything in sections 1–10 is in place:

- Status vocabulary widened to the 6 values (`invited`, `pending_approval`, `active`, `suspended`, `locked`, `deactivated`) with matching labels and badge tones.
- 6 clickable summary cards with active-state highlight (`AccessSummaryCards.tsx`).
- 10 chip filters + advanced filters (role / department / status / access level) + Clear all (`UserAccessFilters.tsx`, `AdvancedFilters.tsx`).
- `TableToolbar` with sort, result count, rows-per-page, prev/next pagination.
- `fetchAccessDirectory` accepts `page`, `page_size`, `sort_by`, `sort_dir` and returns `{ summary, rows, total, page, page_size, departments }`; summary includes `pending_invites`, `pending_approvals`, `suspended_or_locked`, `privileged_users`.
- 9-column table with row-click → drawer and a `⋯` actions menu (View, Change Role, Review Permissions, View Access History, Resend Invitation, Suspend, Reactivate, Deactivate) with correct status-based visibility.
- `deactivateInternalUser` and `resendInternalUserInvite` service methods + `ActionConfirmDialog` wiring with reason capture and toasts.
- `LoadingSkeleton`, `EmptyState`, `NoResultsState`, `ErrorState` all rendered from the page based on `isLoading` / `isError` / `total === 0` / `hasAnyFilter`.

## What's still missing

Two small gaps against section 8 and section 7:

1. **`PermissionDeniedState` is built but never rendered.** `AdminAccessControl.tsx` only distinguishes `isLoading` / `isError` / empty. A Supabase `42501` (or any thrown "permission denied" from `fetchAccessDirectory`) falls into the generic `ErrorState` instead of the dedicated screen.
2. **"View Access History" opens the drawer but does not focus the history section.** `UserDetailsDrawer` renders an "Access history" block inline (no tabs), so today the user has to scroll. The spec says the action should land on that section.

## Fix plan

### 1. Wire `PermissionDeniedState` in `src/pages/AdminAccessControl.tsx`

- Pull `error` off the `useQuery` result alongside `isError`.
- Add a small helper `isPermissionDenied(err)` that checks for `err?.code === "42501"` or `/permission denied/i` on the message (covers both PostgREST and thrown Error shapes).
- Render order becomes: `isLoading` → skeleton, `isError && isPermissionDenied(error)` → `PermissionDeniedState`, `isError || !data` → `ErrorState`, else content.
- Import `PermissionDeniedState` at the top of the page.

### 2. Focus the Access History section from the actions menu

- Add an optional `initialFocus?: "history"` prop to `UserDetailsDrawer`.
- When set, on drawer open use a `useEffect` + `ref` on the "Access history" heading to `scrollIntoView({ behavior: "smooth", block: "start" })` after the drawer mounts.
- In `AdminAccessControl.tsx`, pass `initialFocus={historyUser ? "history" : undefined}` to the drawer so only the "View Access History" entry point scrolls; the row-body click and Quick preview stay at the top as today.

### 3. Verify

- `tsgo` typecheck.
- Manually click a row → drawer opens at top (unchanged). Open actions menu → "View Access History" → drawer opens scrolled to the history section.
- No other files touched; drawers, mutations, filters, and pagination stay exactly as they are.

No DB migration and no service changes required.
