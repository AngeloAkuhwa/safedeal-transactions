## Problem
Two related bugs on `/admin/access-control`:
1. After the invited Support Agent accepted the invite and signed in, the row still shows **Invited** instead of **Active**.
2. The summary stat cards don't reflect reality either — that same signed-in Support Agent isn't counted in **Active Agents** (shows `0`), and **Pending Invitations** still counts them (shows `1`).

Both stem from the same root cause: `internal_users.status` is never flipped from `invited` → `active` reliably after first sign-in.

## Root cause (to confirm on entering build mode)
Promotion currently only runs inside `src/pages/AcceptInvite.tsx` via a client `UPDATE internal_users` after `updatePassword` succeeds. It fails silently when:
- The recovery link lands the user already-authenticated and they bypass the password form.
- RLS on `internal_users` blocks the self-`UPDATE` from the user's own JWT.
- The invited user was an already-existing auth user (recovery flow) and skipped the AcceptInvite screen entirely.

Presence heartbeat writes `last_active` on a separate path, which is why the row can show "Just now" while `status` stays `invited`.

Confirm with `supabase--read_query` before writing code: inspect the Support Agent's `internal_users` row + matching `auth.users.last_sign_in_at` to prove the row is stuck at `invited` despite a real sign-in.

## Fix plan

### 1. Server-authoritative promotion (source of truth)
Extend `admin-me` (already called on every admin page load) with a small, idempotent step:
- Look up `internal_users` row for `auth.uid()`.
- If `status = 'invited'` **and** `auth.users.last_sign_in_at IS NOT NULL`, update to:
  - `status = 'active'`
  - `invitation_status = 'accepted'`
  - `activated_at = now()` (new nullable column, additive)
- Write one `admin_audit_logs` entry: `action = 'internal_user.activated'`, `actor_id = self`, `reason = 'invite_accepted'`. Idempotent because the update is gated on `status = 'invited'`.

### 2. Keep AcceptInvite as a fast path
Leave the existing client update in place so the badge flips instantly after password-set for users who go through that flow. The server path in step 1 is the guarantee.

### 3. Backfill existing stuck rows
One-time migration: for every `internal_users` row where `status = 'invited'` AND matching `auth.users.last_sign_in_at IS NOT NULL`, set `status='active'`, `invitation_status='accepted'`, `activated_at = coalesce(activated_at, last_sign_in_at)`. Resolves the Support Agent row visible in the screenshot without waiting for their next login.

### 4. Stat cards on `/admin/access-control`
The card values come from the same directory dataset — once the underlying `status` flips, the cards recompute correctly on next fetch. Additionally:
- Audit `admin-access-control` (or the equivalent stats query) to confirm the six cards use these definitions and fix any mismatch found:
  - **Active Admins** — `status='active'` AND role bucket ∈ admin family.
  - **Active Agents** — `status='active'` AND role bucket ∈ operational agents (support agent, ops agent, etc.).
  - **Pending Invitations** — `status='invited'` (i.e. never signed in).
  - **Pending Access Approvals** — pending rows in the approvals queue.
  - **Suspended or Locked Users** — `status IN ('suspended','locked')`.
  - **Privileged Access Users** — role bucket ∈ privileged set (super admin, owner, etc.).
- If the cards are currently cached separately, ensure they refetch after `admin-me` promotes the row (invalidate the relevant query keys on the access-control page load).

### 5. UI
No component redesign — cards and table already render `status`/counts from the dataset. Only the numeric values will change.

### 6. Verification
- Pre/post `supabase--read_query` on `internal_users` + `auth.users` for the Support Agent row.
- Sign in as an invited user (or curl `admin-me` with their JWT) and confirm the row flips and one audit log is written.
- Reload `/admin/access-control` and confirm: table row → **Active**, **Active Agents** → `1`, **Pending Invitations** → `0`.

## Technical notes
- New column: `internal_users.activated_at timestamptz null`. Additive, safe.
- No changes to invite-send / accept-link URLs, RBAC, or route guards.
- No frontend behavior changes beyond values updating.
