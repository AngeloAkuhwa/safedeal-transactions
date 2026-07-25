# Fix: Invited internal users land on Admin, not the Buyer/Seller picker

## What's happening today

When an invited teammate (e.g. a Support Agent) clicks their invite email and sets a password, they end up on **/role-selection** with the nested-redirect loop shown in the screenshot. Two things cause it:

1. `AcceptInvite.tsx` decides where to send them by client-querying `internal_user_roles`. If the query returns empty for any reason (session not fully hydrated on first tick after `updateUser`, transient RLS/session race, or Supabase reusing a `recovery` link that lands on `/` first), the fallback is `navigate("/role-selection")`.
2. `ProtectedRoute.tsx` only knows about `user_roles` (buyer/seller/admin consumer roles) via `getUserRoles`. Internal-only teammates have **zero** rows in `user_roles`, so any guarded route sends them to `/role-selection`, which itself compounds the redirect chain.
3. `RoleSelection.tsx` has no awareness of internal roles, so it renders the Buyer / Seller cards to a Support Agent.

## The correct flow for an invited internal user

```text
Invite email ─▶ /accept-invite ─▶ set password
              ─▶ detect internal role (server-trusted)
              ─▶ /admin/dashboard   (always, for any internal role_key)
```

Internal roles (`super_admin`, `senior_admin`, `support_agent`, `auditor`, `finance_ops`, `dispute_specialist`, …) are defined in `permission-catalog` and enforced by `internal_effective_permissions` / `has_any_internal_role`. They already carry their access level — the user should never see the buyer/seller picker.

## Changes

### 1. `src/pages/AcceptInvite.tsx` — trust the server, not a client query race
- Replace the direct `from("internal_user_roles").select(...)` check with an RPC call to `internal_effective_access_level(_user_id)` (or `has_any_internal_role` with the full set of internal keys). Both are `SECURITY DEFINER` and immune to RLS/session timing.
- If the RPC returns any internal access level → `navigate("/admin/dashboard", { replace: true })`.
- Only fall back to `/role-selection` when the user genuinely has no internal role (i.e. legacy consumer invite, which this screen won't normally serve).

### 2. `src/components/auth/ProtectedRoute.tsx` — internal users bypass the picker
- After `getUserRoles` returns empty (`roleNames.length === 0`), do a second check via the same `internal_effective_access_level` / `has_any_internal_role` RPC.
- If internal → set status to `"authenticated"` when the guarded route is `/admin/*`, else redirect to `/admin/dashboard`.
- Only redirect to `/role-selection` when the user is truly a consumer with no roles at all. This kills the nested-redirect loop.

### 3. `src/pages/RoleSelection.tsx` — hard guard against internal users
- On mount, check internal role via RPC. If internal, immediately `Navigate` to `/admin/dashboard` (replace). Prevents accidental exposure of Buyer/Seller cards even if someone deep-links the URL.

### 4. `src/hooks/useAuthState.ts` (light touch)
- Expose an `isInternal` boolean derived from the same RPC so downstream components (nav, dashboards) can render the correct workspace without another round-trip. Optional but keeps everything consistent.

## Technical notes

- Use `supabase.rpc("has_any_internal_role", { _user_id: uid, _roles: INTERNAL_ROLE_KEYS })`. `INTERNAL_ROLE_KEYS` already exists in `src/services/permission-catalog.ts` (`INTERNAL_ROLES.map(r => r.key)`).
- All checks stay client-side reads of `SECURITY DEFINER` functions; no schema changes, no new migrations, no edge functions.
- `AcceptInvite` still promotes `internal_users.status` from `invited` → `active` on first password set — unchanged.
- The `admin-invite-internal-user` edge function already sets `redirectTo: ${origin}/accept-invite` for both invite and recovery links — no change needed.

## Not in scope

- No changes to invite delivery, email template, role assignment, or the Access Control screen.
- No changes to `user_roles` / consumer flows — buyers and sellers still see the picker exactly as today.
