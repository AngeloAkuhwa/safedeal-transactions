
# User Investigation Hub — Backend Wiring & Cross-Screen Connectivity

This plan keeps the **approved HTML design** intact, keeps the **right-side Quick Peek drawer** intact, and focuses on making `/admin/users/:userId/profile` a fully wired, real-data investigation hub.

No redesign. No fabricated data. Every field either renders real data or shows the documented empty/dash state.

---

## 1. Route alignment

Current:
- `/admin/users` → directory + drawer via `?u=`
- `/admin/users/:id` → drawer route
- `/admin/users/:id/profile` → new full page (built last turn)

Change in `src/App.tsx`:
- Keep `/admin/users` (list + `?u=` drawer).
- Add `/admin/users/:userId` → `AdminUserDetail` (full page).
- Keep `/admin/users/:id/profile` as a permanent redirect to `/admin/users/:id` so old links still work.

This matches the spec's URL rule:
- list: `/admin/users`
- list + drawer: `/admin/users?u=<id>`
- full hub: `/admin/users/:userId`

---

## 2. Sticky header fix

Root issue: the page uses `AdminLayout` with `fullBleed`, and the hub header sits inside the scrolling `<main>`, so it scrolls away.

Fix in `AdminUserDetail.tsx`:
- Wrap the hub header in `<div class="sticky top-0 z-30 bg-slate-900 border-b border-slate-800">` containing both the title row and the user summary card.
- Ensure no ancestor sets `overflow-hidden` on the scroll container. `AdminLayout` (non-`fullHeight` mode) lets the page scroll on `<main>`, so `position: sticky` will pin to the viewport top.
- On mobile, the same sticky block; the back button + title row collapse into a single line with overflow menu for the right-side action buttons.

---

## 3. Edge function: `admin-user-detail`

Expand the response to the contract in the brief. All new fields are additive; the existing drawer ignores unknown fields.

Sources:
- `profiles`, `auth.users` → identity, masked email/phone, created_at, last_sign_in_at.
- `user_sessions` → last_login_at, ip, city/state/country (already wired).
- `identity_submissions` / `user_verifications` → KYC status, provider, reviewed_at, rejection_reason.
- `aml_screenings` if table exists; otherwise return `status: "not_screened"` with label `Not Screened` (no fake data).
- `payout_accounts` → bank_name, masked acct, name match, recipient code/status, verification_status.
- `transactions` + `transaction_pricing` → buyer/seller volumes, counts, recent 5.
- `disputes` → totals, active, filed vs received.
- `admin_actions` → activity log + notes/flags split by `action_type`.
- `reviews` (if present) → trust score, else `null`.

Add `available_actions` flags computed from the caller's admin role + target user state (flagged/suspended booleans).

Add `verification.progress_percent` using the documented formula (email 20, phone 20, identity 30, aml 20, payout 10 for sellers/vendors).

Return `403` with `{ error: "admin_required" }` when not admin; the frontend renders a permission state.

---

## 4. Sanitized export function

New edge function: `admin-user-detail-export`.

- `GET ?user_id=<id>&export_type=sanitized|activity|transactions|disputes|compliance`
- Requires admin; `compliance` requires `compliance` or `super_admin` role + a `reason` query param.
- Returns CSV (`text/csv`) with masked fields only (no full account number, NIN, BVN, raw doc URLs, raw AML payloads).
- After success, inserts `admin_actions` row: `action_type='export_user_detail'`, metadata `{ export_type, exported_by, user_id }`.
- `transactions` / `disputes` export types delegate by 302 to existing list export endpoints with `?user=<id>` (no duplicate logic).

---

## 5. Sensitive-field reveal

New edge function: `admin-reveal-user-field` (`POST { user_id, field: "email"|"phone"|"account_number", reason }`).
- Permission gate (admin role; `account_number` requires compliance).
- Inserts an `admin_actions` audit row per reveal.
- Returns only the one requested field.

Frontend eye-toggle next to each masked field calls this on click, then displays the value until the user toggles back off (no persistence).

---

## 6. Service layer (`src/services/admin-users-directory.service.ts`)

Add (no Supabase imports in components):
- `fetchUserDirectoryDetail(userId)` — already exists, expand return type to `AdminUserDetail`.
- `exportUserDetail(userId, exportType, reason?)` → `Blob`.
- `addUserNote(userId, { note, type, priority, linked_transaction_id?, linked_dispute_id? })`.
- `revealUserSensitiveField(userId, field, reason?)` → `{ value }`.
- `reviewPayoutAccount(userId, { decision: 'approve_override'|'reject'|'request_new'|'rerun_resolution', note })`.
- `flagUser` / `clearFlag` / `suspendUser` / `unsuspendUser` — thin wrappers over the existing `admin-flagged-users-action` function with `source_type: 'user_detail'`.

---

## 7. Component breakdown

Refactor `src/pages/AdminUserDetail.tsx` into the structure in the brief:

```
src/pages/AdminUserDetail.tsx                  (route + data + state)
src/components/admin/users/detail/
  UserDetailHeader.tsx                         (sticky header + action buttons)
  UserSummaryPanel.tsx                         (avatar, masked contact, badges, Flag/Add Note)
  ProfileInfoCard.tsx                          (Full Name, DOB, Location, Status, Last Login, IP)
  VerificationStatusCard.tsx                   (Email, Phone, Identity, AML, Bank, Address + progress)
  PayoutAccountCard.tsx                        (Nigerian fields, Recipient Code, match status)
  UserStatsCards.tsx                           (4 stat cards in NGN)
  RecentTransactionsCard.tsx                   (list + View All)
  UserActivityLogCard.tsx                      (timeline w/ linked navigation)
  AdminNotesFlagsCard.tsx                      (notes + Add Note)
  UserActionModals.tsx                         (Flag / Unflag / Suspend / Add Note / Impersonate)
  UserExportMenu.tsx                           (dropdown: 5 export options)
  PayoutAccountReviewModal.tsx                 (approve override / reject / request new / re-run)
  UserDetailSkeleton.tsx
  UserDetailErrorState.tsx
```

All components are presentational and receive typed data from the page.

---

## 8. Data wiring per section

| Section | Source field |
|---|---|
| Header title/subtitle | static "User Investigation Hub" / "Complete user investigation and support center" |
| User summary | `user.*`, `roles`, `badges` |
| Profile Info | `user.full_name`, `date_of_birth`, `location_label`, `account_status_label`, `last_login_label`, `last_login_ip_masked` |
| Verification | `verification.email/phone/identity/aml/address` + `progress_percent` |
| Payout Account | `payout_account.*` (Nigerian schema, no routing numbers) |
| Stats — Buyer | `stats.buyer.total_amount` (₦) + `transaction_count` |
| Stats — Seller | `stats.seller.total_amount` (₦) + `transaction_count` |
| Stats — Disputes | `stats.disputes.total_count` / `active_count` / `filed_count`,`received_count` |
| Stats — Trust | `stats.trust_score.score` or `—` + `review_count` |
| Recent Transactions | `recent_transactions[]` |
| Activity Log | `activity_log[]` |
| Admin Notes & Flags | `admin_notes[]` |

Missing data renders `—` or the documented empty-state copy. No hardcoded values, no Chase Bank, no US locations, no `$`, no 4.8/5.0.

---

## 9. Navigation in (entry points)

Wire row/button handlers in these files (one-line nav additions, no other change):

| From | File | Action |
|---|---|---|
| User Directory row → Profile button | `UsersTable.tsx`, `UsersMobileFeed.tsx` | nav `/admin/users/:id` |
| User Directory drawer | `UserDetailDrawer.tsx` | Add "Open Full Investigation Hub" footer link |
| Flagged Users | `AdminFlaggedUsers.tsx` | "View Profile" → `/admin/users/:id` |
| Transaction Detail | `AdminTransactionDetail.tsx` | Buyer/Seller name → `/admin/users/:id`; secondary "Open in Directory" → `/admin/users?u=:id` |
| Dispute Detail | `AdminDisputeDetail.tsx` | Buyer/Seller card → `/admin/users/:id` |
| Payouts | `AdminPayouts.tsx` | Seller name → `/admin/users/:sellerId` |
| Escrow | `AdminEscrow.tsx` | Buyer/seller names → user detail |
| Identity Verification (if page exists) | applicant link → user detail |
| Refunds (if page exists) | user link → user detail |

For pages that don't currently exist (AML dashboard, refunds page), the hub gracefully degrades — links show a toast "Coming soon" instead of breaking.

---

## 10. Navigation out (buttons on the hub)

| Button | Behavior |
|---|---|
| Back arrow | `navigate(-1)` if `history.length > 1`, else `/admin/users` |
| View Transactions (header) | `/admin/transactions?user=<id>` |
| Recent Transactions → View All | same |
| Transaction row | `/admin/transactions/:transactionId` |
| Disputes stat card | `/admin/disputes?user=<id>` |
| Activity item (linked) | route by type (tx/dispute/payout/refund/verification) |
| Payout Account → View Payouts | `/admin/payouts?seller=<id>` |
| Payout Account → Review | opens `PayoutAccountReviewModal` |
| Verification → View KYC Details | `/admin/identity-verification?user=<id>` (toast fallback if route missing) |
| Verification → Review AML | `/admin/compliance/aml?user=<id>` or toast fallback |
| Flag badge / Notes → Open in Flagged Users | `/admin/flagged-users?user_id=<id>` |

Transaction monitor and disputes pages must accept `?user=<id>` filter — small additive change in their existing query parsing.

---

## 11. Action modals

`UserActionModals.tsx` hosts five modals reused from existing `ActionConfirmDialog` pattern:

1. **Flag User** — reason select, severity, note → `flagUser(...)`.
2. **Unflag User** — required note → `clearFlag(...)`. Toast warns if active risk signals remain.
3. **Suspend / Unsuspend** — confirmation + note → `suspendUser/unsuspendUser`.
4. **Add Note** — note text, type (info/warning/flag), priority, optional linked transaction/dispute → `addUserNote(...)`.
5. **Impersonate** — informational modal: "Impersonation is not enabled yet." (No real impersonation route in the codebase.)

After every mutation: invalidate `admin-user-detail`, `admin-users-directory`, `admin-flagged-users`, plus `admin-payouts` / `admin-identity-verification` when relevant.

---

## 12. Export menu

`UserExportMenu.tsx` is a `DropdownMenu` triggered by the header "Sanitized Export" button:
- Sanitized User Export (default download)
- Activity Timeline Export
- Transactions Export (delegates)
- Disputes Export (delegates)
- Compliance Export (role-gated, requires reason modal)

All downloads call `exportUserDetail(...)` then `URL.createObjectURL` + click; audit row written server-side.

---

## 13. States

- **Loading**: `UserDetailSkeleton` mirrors the full layout.
- **403**: `UserDetailErrorState` with copy "You do not have permission to view this user."
- **Not found (404)**: dedicated copy + back link.
- **Generic error**: copy + Retry button.
- **Empty per-card copy**: as specified in §27 of the brief.

---

## 14. Privacy & masking

- Email/phone/account number masked by default in all renders.
- Reveal flow requires explicit click → audited via `admin-reveal-user-field`.
- IP renders masked (first 2 octets) or `—` if missing.
- Compliance-only data (raw NIN/BVN, raw doc URLs, raw AML payload) is never returned by the standard endpoint.

---

## 15. Out of scope / preserved

- Right-side **Quick Peek drawer** (`UserDetailDrawer.tsx`) — untouched.
- Directory filters, presence dots, summary cards, pagination, bulk actions — untouched.
- No schema migrations required; all new server logic reads existing tables and writes only to `admin_actions`.
- AML table / compliance dashboard / refunds page — not created here; the hub gracefully degrades when those routes are absent.

---

## 16. Acceptance check (will verify after build)

- Header stays pinned while body scrolls under it.
- Every stat card displays NGN values or the documented empty state.
- Recent Transactions populate from `recent_transactions[]` with rows clickable.
- Activity Log populates from `admin_actions`; "No activity recorded" otherwise.
- Admin Notes & Flags populate from filtered `admin_actions`; Add Note round-trips and refreshes.
- All header buttons function (export downloads, add note opens modal, impersonate shows informational modal, view transactions navigates).
- Flag/Unflag/Suspend persist and invalidate related queries.
- Entry-point pages route to `/admin/users/:id` correctly.
- No `$`, no Chase Bank, no 4.8/5.0, no hardcoded sample user data anywhere on the hub.
