## Add Live Presence Indicators to Admin User Directory

Show which users are currently online (app open) using Supabase Realtime presence, with a green/gray dot on each avatar and an "X online · Y offline" chip in the header.

### 1. Global presence broadcaster (new)
Create `src/hooks/usePresenceHeartbeat.ts` and mount it once in `src/App.tsx` (inside the authenticated tree). When a user is signed in, it joins a shared Realtime channel `presence:users` and tracks `{ user_id }`. On unmount / sign-out / tab close it untracks, so Supabase Realtime presence naturally reports them as offline.

This means any authenticated user with the app open broadcasts presence — no DB writes, no extra tables, no polling.

### 2. Admin presence subscriber (new)
Create `src/hooks/useOnlinePresence.ts` for admin screens. It subscribes to the same `presence:users` channel in observer mode and returns:
- `onlineIds: Set<string>` — currently tracked user IDs
- `isOnline(userId): boolean`
- `onlineCount: number`

Single channel instance, cleaned up on unmount (per cloud-realtime rules).

### 3. UI changes on Admin Users page only
- **`src/components/admin/users/UsersTable.tsx`** — wrap each avatar in a relative container and render a small dot (bottom-right): green (`bg-emerald-500`) if online, gray (`bg-slate-500`) if offline, with a subtle ring for contrast. Tooltip: "Online now" / "Offline".
- **`src/components/admin/users/UsersMobileFeed.tsx`** — same avatar dot treatment.
- **`src/components/admin/users/UsersHeaderBar.tsx`** — next to the existing "Live · N total users" chip, add a compact chip: green dot + `{onlineCount} online` · gray dot + `{rows.length - onlineCount} offline` (computed against the currently loaded page so it stays cheap). Hidden on small screens to avoid clutter.
- **`src/components/admin/users/UsersMobileTopBar.tsx`** — add the same compact chip below the title.
- **`src/pages/AdminUsers.tsx`** — call `useOnlinePresence()` once, pass `isOnline` / `onlineCount` down to the table, mobile feed, and header bars.

### 4. No backend / schema changes
Realtime presence is ephemeral and lives entirely in the Realtime service — no migrations, no new tables, no edge function edits. The existing `last_active_at` field is untouched.

### Technical notes
- Channel name: `presence:users`. Presence key: `user_id`. Payload: `{ user_id, joined_at }`.
- Heartbeat hook only mounts when `useAuthState().isAuthenticated` is true; tears down on logout.
- Subscriber hook uses `channel.on('presence', { event: 'sync' }, …)` to rebuild the `Set` from `channel.presenceState()`.
- Dot styling: `absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-slate-950` with emerald/slate fill.
- Counts reflect users visible on the current page (matches the realtime cost model — we only know about users whose tabs are open, regardless of pagination).

### Out of scope
- Persisting last-seen timestamps to the DB.
- Presence on non-admin screens.
- "Idle" tri-state — just online/offline.
