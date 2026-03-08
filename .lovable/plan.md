

# Fix: Auth-Aware Header + Persist User Sessions on Login

## Two Issues

### 1. Header always shows Log In / Sign Up buttons
The landing page `Header.tsx` has no auth state awareness. After login, it should show a "Dashboard" button instead.

### 2. Login doesn't create a `user_sessions` row
`LoginForm.tsx` calls `invalidate_old_sessions` (which revokes old sessions) but never inserts a new session record into the `user_sessions` table. The table requires `user_id` and `session_token_hash` (NOT NULL).

## Changes

### `src/components/landing/Header.tsx`
- Import `supabase` client, add `useEffect` + `useState` to track auth state via `onAuthStateChange`
- When `user` exists: replace Log In / Sign Up with a single "Dashboard" button linking to `/role-selection` (both desktop and mobile)
- When no user: keep current Log In / Sign Up buttons

### `src/components/auth/LoginForm.tsx`
After `invalidate_old_sessions` succeeds, insert a new row into `user_sessions`:
```ts
await supabase.from("user_sessions").insert({
  user_id: data.user.id,
  session_token_hash: data.session.access_token.slice(-32), // hash/truncate for storage
  ip_address: null, // not available client-side
  is_active: true,
});
```
This creates the active session record that enforces one-device-at-a-time policy.

### Files Modified

| File | Change |
|---|---|
| `src/components/landing/Header.tsx` | Add auth state listener, conditional button rendering |
| `src/components/auth/LoginForm.tsx` | Insert `user_sessions` row after invalidating old sessions |

No database migrations needed — table and RLS policies already exist.

