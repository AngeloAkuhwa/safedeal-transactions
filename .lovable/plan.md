
# User Investigation Hub — Remaining Work

Scope: only items still pending from the original plan. The approved HTML design, the right-side Quick Peek drawer, and existing directory behavior remain untouched.

---

## 1. Routing alignment (§1)

`src/App.tsx`:
- Change `/admin/users/:id` to render `AdminUserDetail` (full hub) instead of `AdminUsers`.
- Keep `/admin/users` → `AdminUsers` (directory + `?u=<id>` drawer).
- Convert `/admin/users/:id/profile` and `/admin/users/:id/hub` into permanent redirects to `/admin/users/:id` (using a small `<Navigate replace>` wrapper) so old in-app links and the drawer "Open Full Investigation Hub" button still work.
- Update `UsersTable.tsx`, `UsersMobileFeed.tsx`, and `UserDetailDrawer.tsx` to navigate to `/admin/users/:id` (no `/profile` suffix).

Result: every "View Buyer/Seller/Profile" link app-wide lands on the full hub; the drawer is only reached from the directory `?u=` flow.

---

## 2. New edge functions (§4, §5)

### 2a. `supabase/functions/admin-user-detail-export/index.ts`
- `GET ?user_id=<id>&export_type=sanitized|activity|transactions|disputes|compliance&reason=<text>`
- Admin gate via `has_role`. `compliance` additionally requires `compliance` or `super_admin` and a non-empty `reason`.
- Returns `text/csv` with `Content-Disposition: attachment`.
- Field whitelists per export type — never includes raw account number, full email/phone, NIN/BVN, raw document URLs, or raw AML payloads.
- `transactions` and `disputes` types respond with a 302 to existing list export endpoints filtered by `?user=<id>`.
- On success, inserts an `admin_actions` row: `action_type='export_user_detail'`, metadata `{ export_type, exported_by, user_id, reason }`.

### 2b. `supabase/functions/admin-reveal-user-field/index.ts`
- `POST { user_id, field: 'email'|'phone'|'account_number', reason? }`
- Admin gate; `account_number` requires `compliance` or `super_admin` and a `reason`.
- Returns `{ value }` for the single requested field only.
- Inserts `admin_actions` row: `action_type='reveal_user_field'`, metadata `{ field, reason }`.

### 2c. Extend `admin-user-detail`
- Add AML row to `verification_detail` (`status: not_screened|clear|review|hit`, `last_screened_at`, `provider`). When `aml_screenings` table is absent, return `not_screened`.
- Add `verification.progress_percent` = `email 20 + phone 20 + identity 30 + aml 20 + payout 10` (payout only counted for sellers/vendors; denominator adjusts accordingly).
- Add `address` row (from `identity_submissions` or `profiles` if present, else `not_provided`).
- Add `available_actions` flags: `{ can_flag, can_unflag, can_suspend, can_unsuspend, can_impersonate:false, can_review_payout }`.

Both new functions follow project CORS/JWT-in-code conventions and use `npm:@supabase/supabase-js@2` + `cors` headers.

---

## 3. Service layer (§6) — `src/services/admin-users-directory.service.ts`

Add (no Supabase client imports leak to components):
- `exportUserDetail(userId, exportType, reason?) → Blob`
- `revealUserSensitiveField(userId, field, reason?) → { value: string }`
- `addUserNote(userId, { note, type, priority, linked_transaction_id?, linked_dispute_id? })`
- `reviewPayoutAccount(userId, { decision, note })` — decision ∈ `approve_override|reject|request_new|rerun_resolution`
- Thin wrappers: `flagUser`, `clearFlag`, `suspendUser`, `unsuspendUser` — all call existing `admin-flagged-users-action` with `source_type: 'user_detail'`.

Wrap PATCH/DELETE calls in direct `fetch` per project edge-function convention.

---

## 4. Component breakdown (§7)

Create `src/components/admin/users/detail/` and extract from the current monolithic `AdminUserDetail.tsx`:

```
UserDetailHeader.tsx           sticky header + action buttons
UserSummaryPanel.tsx           avatar, masked contact, badges, Flag/Add Note
ProfileInfoCard.tsx            full name, DOB, location, status, last login, IP
VerificationStatusCard.tsx     email/phone/identity/AML/bank/address + progress
PayoutAccountCard.tsx          Nigerian fields, recipient code, match status
UserStatsCards.tsx             4 NGN stat cards
RecentTransactionsCard.tsx     list + View All
UserActivityLogCard.tsx        timeline with linked nav
AdminNotesFlagsCard.tsx        notes list + Add Note button
UserActionModals.tsx           Flag / Unflag / Suspend / Unsuspend / Add Note / Impersonate
UserExportMenu.tsx             DropdownMenu with 5 export options
PayoutAccountReviewModal.tsx   approve override / reject / request new / re-run
UserDetailSkeleton.tsx         full-layout skeleton
UserDetailErrorState.tsx       403 / 404 / generic error variants
```

`AdminUserDetail.tsx` shrinks to: route param parsing, react-query data fetch, modal state, and composition of the above presentational components. No visual change.

---

## 5. Verification card data wiring (§8)

- Render the AML row and the address row added in §2c.
- Render `progress_percent` in the header circle/bar using server-supplied value (remove any client-side approximation).
- Each row uses the documented empty-state copy when its status is missing.

---

## 6. Sticky header re-validation (§16)

- Audit `AdminLayout` ancestors: confirm no `overflow-hidden` / `overflow-auto` between `<main>` and the hub root. If `AdminLayout` wraps `<main>` in a flex/overflow container, set the hub root to participate in the page-level scroll (drop any inner scroll container).
- `UserDetailHeader` uses `sticky top-0 z-40` with solid `bg-slate-900` and a thin bottom border.
- Verify on desktop and mobile breakpoints in the preview after the refactor.

---

## 7. Action modals (§11)

In `UserActionModals.tsx`, build five modals using the existing `ActionConfirmDialog` primitive:
1. **Flag User** — reason select, severity, note → `flagUser`.
2. **Unflag User** — required note → `clearFlag`; toast warning if active risk signals remain.
3. **Suspend / Unsuspend** — confirmation + note → `suspendUser` / `unsuspendUser`.
4. **Add Note** — note text, type (info/warning/flag), priority, optional linked transaction/dispute → `addUserNote`.
5. **Impersonate** — informational only: "Impersonation is not enabled yet."

After each mutation, invalidate: `admin-user-detail`, `admin-users-directory`, `admin-flagged-users`, plus `admin-payouts` / `admin-identity-verification` where relevant.

---

## 8. Export menu (§12)

Replace the single "Sanitized Export" button with `UserExportMenu` (DropdownMenu):
- Sanitized User Export (default)
- Activity Timeline Export
- Transactions Export (delegates to existing endpoint)
- Disputes Export (delegates)
- Compliance Export — role-gated, opens a Reason modal first

All options call `exportUserDetail(...)`, then `URL.createObjectURL` + click. Audit row written server-side by the new function. Remove the existing client-only CSV builder.

---

## 9. Sensitive-field reveal (§14)

- Add an eye-toggle next to each masked field (email, phone, account number).
- On click, call `revealUserSensitiveField(...)`; on success, display the value in place until toggled off (no persistence, no caching across navigations).
- Account-number reveal opens a small Reason modal first.
- IP renders masked (first two octets) or `—`.

---

## 10. Remaining navigation in (§9)

Wire one-line nav additions in:
- `AdminFlaggedUsers.tsx` — "View Profile" → `/admin/users/:id`.
- `AdminEscrow.tsx` — buyer/seller name → `/admin/users/:id`.
- Identity Verification page (if it exists) — applicant link → `/admin/users/:id`.
- Refunds page (if it exists) — user link → `/admin/users/:id`.

Pages that don't exist render a toast "Coming soon" rather than navigate.

---

## 11. Remaining navigation out (§10)

Replace the remaining `stub()` toasts on the hub with real navigation:
- Header **View Transactions** → `/admin/transactions?user=<id>`
- Recent Transactions **View All** → same
- Payout Account **View Payouts** → `/admin/payouts?seller=<id>`
- Payout Account **Review** → opens `PayoutAccountReviewModal`
- Verification **View KYC Details** → `/admin/identity-verification?user=<id>` (toast fallback)
- Verification **Review AML** → `/admin/compliance/aml?user=<id>` (toast fallback)
- Flag badge / Notes → `/admin/flagged-users?user_id=<id>`

Add `?user=<id>` filter parsing to `AdminTransactions.tsx` and `AdminDisputes.tsx` query builders (additive — no other changes).

---

## 12. States (§13)

- `UserDetailSkeleton` mirrors the actual layout (header + summary + 3 column grid + lists).
- `UserDetailErrorState` variants: `403` ("You do not have permission to view this user."), `404` ("User not found.") + back link, `generic` with Retry button.
- Per-card empty-state copy per spec §27 (e.g. "No recent transactions", "No activity recorded", "No notes or flags").

---

## 13. Acceptance verification

After build:
- `/admin/users/:id` opens the full hub (not the drawer); `/admin/users?u=:id` still opens the drawer.
- Sticky header stays pinned while body scrolls under it on desktop and mobile.
- Verification card shows AML row + address row + server-supplied progress percent.
- Every export option downloads a CSV and writes an `admin_actions` audit row server-side.
- Eye-toggle reveals each masked field and writes a reveal audit row.
- Flag / Unflag / Suspend / Unsuspend / Add Note / Impersonate modals work and invalidate the right queries.
- All header buttons and card-level "View" links navigate correctly; transactions/disputes monitors honor `?user=` filter.
- `AdminFlaggedUsers`, `AdminEscrow`, and (if present) Identity Verification / Refunds link to the hub.
- No `$`, no Chase Bank, no fabricated trust score, no hardcoded sample data.

---

## Out of scope (unchanged)

- Right-side Quick Peek drawer (`UserDetailDrawer.tsx`).
- Directory filters, presence dots, summary cards, pagination, bulk actions.
- DB schema migrations — none required; new server logic reads existing tables and writes only to `admin_actions`.
- Creating AML dashboard, refunds page, or impersonation backend — hub degrades gracefully when those routes are absent.
