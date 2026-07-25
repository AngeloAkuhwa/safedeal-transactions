## Status of the earlier plan

The 10-item Access Control finish plan is **100% built**:

- `ChangeRoleDrawer` — full rewrite with sticky diff panel and approval routing.
- `ReviewPermissionsDrawer` — inherited / overrides / temporary / restricted / pending sections + nested override request dialog.
- `SuspendUserDialog` — first-class dialog with duration, session revoke, task reassignment, consequences block, explicit ack.
- `ReactivateUserDialog` — new dedicated flow, separate from Suspend.
- `admin-access-control.service.ts` — `submitRoleChangeRequest`, `requestPermissionOverride`, `suspendUserAtomic`, session count + reassignment target helpers.
- `permission-catalog.ts` — `permissionsForRoles`, `PRIVILEGED_ACTIONS`, `isPrivilegedPermission`.
- `AdminAccessControl.tsx` — new mutations wired, row menu points at new drawers.
- `AdminAccessApprovals.tsx` — new route at `/admin/access-approvals`, allow-listed in `useAdminNav.ts`.
- Skipped contract tests `invite-validation.test.ts` and `employee-id-format.test.ts` added.
- Typecheck: clean.

## Why "Last Active" shows "Never"

The column reads `internal_users.last_active_at`. That column exists in the schema, but **nothing writes to it**:

- `usePresenceHeartbeat` only broadcasts on a Realtime channel — it doesn't touch the database.
- The row for `admin@safedeal.test` has `last_active_at = NULL`, so the UI correctly renders "Never".

Verified: `rg` for writes to `last_active_at` turns up only the read paths (directory engine, edge-function projections), no `UPDATE` / `UPSERT`.

## Fix plan — surface real last-active for internal users

Small, additive, no schema change.

1. **Service helper** — add `touchInternalUserLastActive()` to `src/services/admin-access-control.service.ts`:
   - `UPDATE public.internal_users SET last_active_at = now() WHERE id = auth.uid()`.
   - No-op (silent) for users that aren't in `internal_users` (buyers/sellers).
   - Throttled client-side to at most once per 60s using a `sessionStorage` timestamp so we don't hammer the API.

2. **Heartbeat hook** — extend `src/hooks/usePresenceHeartbeat.ts`:
   - On mount / on `SIGNED_IN` / when the tab becomes visible, call `touchInternalUserLastActive()`.
   - Also call it inside the existing heartbeat interval.
   - Keeps existing Realtime presence behavior untouched.

3. **RLS check** — confirm `internal_users` has (or add) a self-update policy scoped to `id = auth.uid()` and limited to the `last_active_at` column via a `WITH CHECK` clause. If the current policy only allows admins to write, add:
   ```sql
   CREATE POLICY "internal users self-touch last_active_at"
     ON public.internal_users FOR UPDATE
     TO authenticated
     USING (id = auth.uid())
     WITH CHECK (id = auth.uid());
   ```
   Column-level grant is enforced by only updating `last_active_at` in the service call.

4. **Backfill (one-off)** — set `last_active_at = coalesce(last_active_at, updated_at)` for existing `internal_users` rows so already-seeded admins show a plausible value on first paint instead of "Never".

5. **Verify** — after sign-in, reload `/admin/access-control`; the SafeDeal Admin row should show a relative time ("just now", "2m ago") and re-sort correctly under "Last Active".

### Files

- edit `src/services/admin-access-control.service.ts` — add `touchInternalUserLastActive`.
- edit `src/hooks/usePresenceHeartbeat.ts` — call the touch helper on signal points.
- migration — add RLS policy (if missing) + one-off backfill `UPDATE`.

### Out of scope

- No new columns, no changes to buyer/seller presence, no changes to the Realtime presence dot behavior.
