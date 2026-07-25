## Problem

- A newly invited internal user (e.g. Angelo Akuhwa in the screenshot) shows **Active** in the Users & Access table even though the invitee has never accepted the invite. Root cause: the `admin-invite-internal-user` edge function hard-codes `status: "active"` on insert.
- There's no way to **delete** an invited user to re-invite from scratch.
- There's no way to **extend access** when `access_expires_at` has passed (or reset it after expiry).

## Fix Plan

### 1. Correct initial status on invite (edge function)
`supabase/functions/admin-invite-internal-user/index.ts`
- On the initial insert (line ~450), set `status` based on `shouldSend`:
  - `shouldSend === true` → `status: "invited"` (matches the existing `InternalUserStatus` value + indigo `StatusBadge` styling).
  - `shouldSend === false` → keep `status: "invited"` too (row exists but no email sent yet) with `invitation_status: "not_invited"`.
- Keep `invitation_status` logic as-is (`sent` / `failed` / `not_invited`).

### 2. Auto-promote to Active on first sign-in
Add a lightweight promotion step so the badge flips once the invitee actually accepts:
- Extend `src/pages/AcceptInvite.tsx` (or a small `admin-accept-invite` edge function) so that once the invitee sets a password and Supabase session is established, we PATCH `internal_users` where `id = auth.uid()` and `status = 'invited'` → `status: 'active'`, `invitation_status: 'accepted'`, and stamp `accepted_at` (existing column if present, else skip).
- Write one `audit_logs` entry: `access_user_activated` (already in `ADMIN_ACTION_TYPES`).

### 3. Add "Delete invited user" action (hard delete, gated)
- Service: new `deleteInvitedInternalUser({ user_id, reason })` in `src/services/admin-access-control.service.ts` calling a new edge function `admin-delete-internal-user`.
- Edge function `supabase/functions/admin-delete-internal-user/index.ts`:
  - Auth-gate (super_admin / access_admin only, reuse `assertOutranksTarget`).
  - **Guard:** only allow when target `status IN ('invited','deactivated')` AND no `audit_logs` rows reference the user as actor (safety). Otherwise return `409 delete_blocked` → UI should suggest Deactivate instead.
  - Delete `internal_user_roles`, `internal_users` row, then `auth.admin.deleteUser(userId)`.
  - Emit audit event `user_deactivated` with `metadata.mode = "hard_delete"` (reuses existing enum; no schema change needed).
- Table row menu (`InternalUsersTable.tsx`): show **"Delete invited user"** (red) only when `u.status === "invited"`. Confirm dialog reuses the existing `ConfirmDialog` pattern with a required reason.
- After delete, invalidate directory query so the row disappears — user can immediately re-invite via **Add User** with the same email.

### 4. Reinvite for expired invitations
- The **Resend Invitation** menu item already exists but is gated on `u.status === "invited"`. Broaden the gate to also show when `invitation_status === "expired"` OR when `status === "invited"` AND `access_expires_at < now()`.
- No backend change needed — existing `resendInternalUserInvite` already regenerates the invite link and email.

### 5. Extend access for expired users
- Service: new `extendInternalUserAccess({ user_id, new_expires_at, reason })` in `admin-access-control.service.ts`. Direct table update with RLS-safe wrapper:
  - Updates `access_expires_at`; if `status === 'suspended'` due to expiry auto-lock, keeps status untouched (separate re-activate flow already exists).
  - Writes audit entry `permission_override_approved` with `metadata = { field: "access_expires_at", before, after }` (reuses existing enum).
- New drawer/dialog `ExtendAccessDialog.tsx`: date picker (default +90 days), required reason textarea.
- Table row menu: add **"Extend access"** item, shown when `access_expires_at` is set AND (`access_expires_at < now()` OR within 14 days of expiry). Icon: `CalendarClock`.

### 6. Access-history / audit visibility
No changes needed — the three new actions (`user_activated`, `user_deactivated` w/ hard_delete, `permission_override_approved` for expiry extension) already surface in the existing Access History timeline.

## Files touched
- `supabase/functions/admin-invite-internal-user/index.ts` (status fix)
- `supabase/functions/admin-delete-internal-user/index.ts` (new)
- `src/pages/AcceptInvite.tsx` (post-accept promotion)
- `src/services/admin-access-control.service.ts` (2 new service fns, broaden resend gate helper)
- `src/components/admin/access-control/InternalUsersTable.tsx` (2 new menu items + gating)
- `src/pages/AdminAccessControl.tsx` (wire delete + extend dialogs, mutations, toasts)
- `src/components/admin/access-control/ExtendAccessDialog.tsx` (new)

## Out of scope
- No enum/schema migrations (all statuses and audit action types already exist).
- Impersonation and bulk actions remain untouched.
