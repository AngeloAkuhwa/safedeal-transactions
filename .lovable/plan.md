# User Detail — Full Page (new) + Right-Side Drawer (kept as-is)

We are adding a brand-new, full-screen User Detail page that mirrors the attached `User Detail View.html` 1:1. The existing right-side quick-peek drawer is **NOT** being removed, refactored, or visually changed in any way. Both surfaces will coexist and serve different purposes.

---

## A. What stays exactly as it is (the right-side drawer)

The current quick-peek drawer is a small, fast preview. We are keeping every part of it untouched:

- File **`src/components/admin/users/UserDetailDrawer.tsx`** — no edits. Same component, same layout, same icons, same content (header, profile chips, Activity 3-stat block, Recent transactions list, Admin actions timeline, sticky bottom flag/suspend/fraud-workspace buttons).
- Mounted in **`src/pages/AdminUsers.tsx`** exactly where it is today (`<UserDetailDrawer userId={drawerUser} ... />`).
- All existing triggers for opening it keep working:
  - The drawer-mode route `/admin/users/:id` continues to open the drawer (driven by `useParams().id`).
  - The `?u=<id>` query param continues to open the drawer.
  - The current "open detail" handlers in the rows (`onOpenDetail` / `onOpen`) still call `setDrawerUser(id)` and open the drawer.
- Data source (`fetchUserDirectoryDetail` → `admin-user-detail` edge function) is unchanged. The drawer keeps reading the same fields it reads today; any new fields we add to the response are optional and ignored by the drawer.
- Flag / Suspend / Clear-flag flows from inside the drawer (`onFlag`, `onSuspend`, `onClearFlag` props feeding `ActionConfirmDialog`) — unchanged.
- Presence dots, animations, sticky internal header, and the bottom action bar inside the drawer — unchanged.

Net effect: a user clicking whatever opens the drawer today will see the exact same drawer they see today.

---

## B. What is new (the full-screen detail page)

A separate, deep, exhaustive page that lives at its own URL and is opened by clicking the **body of a row** in the users table.

### B1. Route

- New route in `src/App.tsx`: `path="/admin/users/:id/profile"` → `<AdminUserDetail />`.
- We deliberately use `:id/profile` (not `:id`) so it does NOT collide with the existing `/admin/users/:id` drawer-mode route.

### B2. Row click behavior (the only change on the list page)

In `src/components/admin/users/UsersTable.tsx` and `src/components/admin/users/UsersMobileFeed.tsx`:

- The **row body** (the avatar + name + identity area — the main content of each row/card) becomes a clickable target that calls `navigate(\`/admin/users/${row.user_id}/profile\`)` and opens the new full page.
- Every existing per-row control keeps its current behavior unchanged and calls `e.stopPropagation()` so it doesn't bubble up to the row click:
  - Flag / Unflag button → still triggers `onFlagToggle`.
  - Suspend button → still triggers `onSuspend`.
  - Any kebab/quick-view affordance that currently opens the drawer (`onOpenDetail` / `onOpen`) → still opens the drawer.
- We do not remove or rename any existing prop or handler. We only attach a new click handler to the row body container.

Result:
- Click row **body** → new full-screen page.
- Click row **quick-view / kebab / drawer trigger** → existing drawer (unchanged).
- Click row **action buttons** → existing flag/suspend dialogs (unchanged).

### B3. New page — `src/pages/AdminUserDetail.tsx`

Built with `AdminLayout` using `hideDefaultHeaders` + `fullBleed` so the admin sidebar is reused and this page owns its own header. Data via TanStack Query with the same key as the drawer (`["admin-user-detail", userId]`), so cache is shared — no duplicate network calls when navigating between drawer and page.

Structure matches the attached HTML exactly:

1. **Sticky page header** (`sticky top-0 z-20 bg-slate-900 border-b border-slate-800 px-8 py-6`) — content scrolls beneath it:
   - Back arrow → `navigate(-1)` (fallback `/admin/users`).
   - Title "User Investigation Hub" + subtitle "Complete user investigation and support center".
   - Right action buttons: Sanitized Export · Add Note · Impersonate · View Transactions. Wired to existing handlers where they exist; otherwise stubbed with a "Coming soon" toast and visibly labelled as such.
   - Embedded user summary card: avatar, full name, FLAGGED / VERIFIED chips, masked email & phone with eye-toggle reveal, User ID, joined date, role pills (Buyer / Seller / Premium when applicable), and inline Unflag/Flag + Add Note buttons (reusing the existing `performFlaggedAction` + `ActionConfirmDialog` flow already on the list page).

2. **Scrolling content** (`p-8 space-y-6`), in this exact order:
   - **3-column grid**: Profile Information · Verification Status (with the level progress bar) · Payout Account.
   - **4-column stat row**: Total as Buyer · Total as Seller · Disputes · Trust Score (Trust Score renders "—" until a reviews source exists; we never fabricate it).
   - **2-column grid**: Recent Transactions · Activity Log.
   - **Full-width**: Admin Notes & Flags.

3. **New presentational sub-components** under `src/components/admin/users/detail/` (page-only, do not touch the drawer):
   - `UserDetailHeader.tsx`
   - `ProfileInfoCard.tsx`
   - `VerificationStatusCard.tsx`
   - `PayoutAccountCard.tsx`
   - `UserStatCards.tsx`
   - `RecentTransactionsCard.tsx`
   - `ActivityLogCard.tsx`
   - `AdminNotesCard.tsx`

4. **Icon mapping**: FontAwesome icons from the reference HTML are swapped for the closest `lucide-react` equivalents while preserving the exact color tokens (`text-blue-400`, `text-emerald-400`, `text-purple-400`, `text-orange-400`, `text-yellow-400`, `text-red-400`).

5. **Mobile**: cards stack into a single column; the sticky header keeps the back arrow and condenses the action buttons into a "More" menu. No separate mobile mock was supplied, so we keep parity with desktop.

### B4. Backend — additive extension of `admin-user-detail`

The drawer keeps reading the same response it reads today. We only **add** optional fields so the new page has the data it needs from the same call (no new edge function, no schema changes, no migrations):

- `stats`: `{ as_buyer: { count, volume }, as_seller: { count, volume }, disputes: { total, active, filed, received } }` — derived from `transactions` and `disputes`.
- `payout_account`: `{ bank_name, account_type, masked_account_number, status, added_on } | null` — from `payout_accounts`.
- `profile_extra`: `{ last_login_at, last_login_ip } | null` — from `user_sessions` (most recent) or `auth.users.last_sign_in_at`. Fields we don't store (DOB, address) are simply omitted, never invented.
- `verification_detail`: `{ email, phone, identity_level, bank_status }` — derived from existing verification + `payout_account.status`.
- `admin_notes`: list of `admin_actions` of note/flag type for this user (`id, type, note, admin_name, created_at, priority`).

CORS unchanged. Reads only, service-role. The drawer continues to ignore these new fields.

### B5. Service layer

Extend the `UserDirectoryDetail` type in `src/services/admin-users-directory.service.ts` with the new optional fields. Existing callers (the drawer) are unaffected because the new fields are optional.

---

## C. Out of scope (explicit non-goals)

- The right-side drawer is **not** being removed, replaced, moved, or restyled.
- No changes to filters, presence dots, pagination, summary cards, bulk actions, or the existing list-page layout beyond attaching the new row-body click handler.
- No new tables, migrations, RLS, or grants.
- No fabricated data — fields the backend doesn't have (DOB, full address, trust score reviews) render "—" or are hidden.

## D. How to verify after build

- Drawer: open the users page, click whatever opens the drawer today → identical drawer appears, identical content, identical actions.
- New page: click the body of any row → navigates to `/admin/users/:id/profile` and shows the full investigation hub page from the HTML reference, with sticky header and content scrolling beneath.
- Row action buttons (flag, suspend, drawer trigger) still work and do NOT navigate to the new page.
- Refreshing `/admin/users/:id/profile` loads the page directly (deep-linkable).
