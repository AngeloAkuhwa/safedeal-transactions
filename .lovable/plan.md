## Review of the `/admin/users` wiring spec

The 26-item acceptance spec you pasted is **already implemented** in prior turns. Below is a status audit mapped to your numbered criteria, plus the small gaps that are still worth closing.

### Already done (no work needed)

| Spec section | Status | Where it lives |
|---|---|---|
| 2 — Route `/admin/users` | Done | `src/App.tsx` (also `/admin/users/:id`) |
| 3 — Uses `AdminLayout`, no sidebar copy | Done | `src/pages/AdminUsers.tsx` |
| 4 — Files created | Done | `src/components/admin/users/*`, `src/services/admin-users-directory.service.ts`, three edge functions |
| 5 — Backend sources, no direct table access from UI | Done | All queries via `admin-users-directory.service.ts` |
| 6 — Admin guard server-side | Done | `requireAdmin` in every edge function |
| 7–9 — URL params, drawer open via `?u=`, defaults | Done | `AdminUsers.tsx` |
| 10–13 — `admin-users-directory` contract + summary calcs | Done | `supabase/functions/_shared/users-directory-engine.ts` (`new_this_month`, `new_per_day_avg`, `id_verified_pct` already added) |
| 14–23 — Row contract, columns, status/verification/joined wiring | Done | `UsersTable.tsx` + engine |
| 24 — 7-button action row (Profile, Tx, Disputes, Investigation, Impersonate placeholder, Flag/Unflag, Export) | Done | `UsersTable.tsx` |
| 25 — Header bar with Live chip + total chip + Export + Add User toast | Done | `UsersHeaderBar.tsx` |
| 26 — Export uses current filters, NGN, CSV | Done | `admin-users-directory-export` |
| 27–30 — Drawer, sections, actions | Done | `UserDetailDrawer.tsx` + `admin-user-detail` |
| 31 — Fraud hook (flag/clear/suspend through `admin-flagged-users-action`, query invalidations) | Done | `AdminUsers.tsx` |
| 33–35 — Filters, search debounce, pagination, sorting | Done | `UsersFilters.tsx`, `AdminUsers.tsx` |
| 36 — Risk/trust icons | Done | `UsersTable.tsx` ring + badge logic |
| 38–40 — Loading skeletons, empty, error states | Done | `AdminUsers.tsx` |
| 41 — Reason/note required for sensitive actions | Done | `ActionConfirmDialog` |
| 42–43 — Impersonation + Add User placeholders | Done | Toast stubs |
| Mobile port (top bar, stats carousel, filters sheet, card feed) | Done | `UsersMobileTopBar.tsx`, `UsersMobileStatsScroll.tsx`, `UsersAdvancedFiltersSheet.tsx`, `UsersMobileFeed.tsx` |

### Remaining gaps to close (this is the only build work)

1. **Spec 32 — Deep links from Transaction Detail and Dispute Detail**
   - Add "Open Buyer in User Directory" / "Open Seller in User Directory" actions in `src/pages/AdminTransactionDetail.tsx` and `src/pages/AdminDisputeDetail.tsx`, routing to `/admin/users?u=<id>`.
   - Currently missing — users can navigate `users → transactions/disputes` but not the reverse.

2. **Spec 20 — Transactions column secondary value**
   - Reference shows "X resolved" when resolved count > 0, otherwise NGN volume. Engine returns `transactions.count` and `transactions.volume` but no `resolved` count. Add `resolved` to `UserDirectoryRow.transactions` in the engine, then surface in `UsersTable.tsx` and `UsersMobileFeed.tsx`.

3. **Spec 21 — Disputes column wording**
   - Reference uses "Active disputes" / "In progress" / "Clean record". `UsersTable.tsx` currently shows count + active badge only. Tighten the secondary label to match the three reference variants.

4. **Spec 22 status precedence — "Pending ID" detection**
   - Currently `status === "pending"` is shown when no ID; confirm the engine returns `pending` when verification.id is false AND `id_status` is `submitted`/`pending` (not when simply missing). Small engine guard.

5. **Spec 34 — Pagination footer text**
   - Reference: `Showing X–Y of Z users`. Verify the current footer in `UsersTable.tsx` mobile and desktop matches this exact wording.

6. **Spec 37 — Contact masking when admin lacks unmask permission**
   - We currently always return raw email/phone to any admin. If there is no separate "unmask" permission today, this is acceptable; flag as a future-phase item.

7. **Verification mini-icons (spec 19)**
   - Confirm `UsersTable.tsx` Verification column shows three mini icons (email/phone/ID) with green vs muted reflecting actual booleans, not just the overall badge.

### Plan for closing the gaps

1. Add `resolved` to `UserDirectoryRow.transactions` in `supabase/functions/_shared/users-directory-engine.ts` (count transactions where `status` is in the completed set per buyer/seller).
2. Update `src/services/admin-users-directory.service.ts` type to include `resolved`.
3. Update `UsersTable.tsx`:
   - Transactions cell: show `{resolved} resolved` when `resolved > 0`, else NGN compact volume.
   - Disputes cell: `Active disputes` (red) when `active>0`, `In progress` when `total>0 && active===0`, `Clean record` otherwise.
   - Verify mini-icons row (email/phone/ID).
4. Update `UsersMobileFeed.tsx` to mirror the same Transactions/Disputes secondary strings.
5. Add to `AdminTransactionDetail.tsx`: two menu items under the existing "Open in…" affordance → `/admin/users?u=<buyer_id|seller_id>`.
6. Add to `AdminDisputeDetail.tsx`: same pair.
7. Tighten engine status mapping so `pending` requires an actual pending identity_submission (not just a missing one — those stay `active` unverified).
8. Confirm pagination footer wording exactly matches `Showing {start}–{end} of {total} users` on both desktop table and mobile feed.

No new edge functions, no new routes, no schema changes. Deploy is automatic after the engine edit.

### Verification

- Reload `/admin/users` at 875px and ≥1024px — visuals unchanged, Transactions/Disputes secondary text now matches reference variants.
- Open an admin transaction → "Open Buyer in User Directory" routes to `/admin/users?u=<buyer_id>` and the drawer opens.
- Open an admin dispute → same for buyer and seller.
- A user mid-identity-review shows "Pending ID"; a user who simply never started ID stays "Active" with the Unverified mini-icons.
- Pagination footer reads `Showing 1–20 of 347 users`.
