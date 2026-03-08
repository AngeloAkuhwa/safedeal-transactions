

# Buyer Dashboard API Review -- Issues Found & Fixes

## Issues Identified

### 1. `getClaims()` is unreliable in Edge Functions
The edge function uses `userClient.auth.getClaims(token)` which is a newer method with known issues (returns null with valid JWTs per community reports). The standard, battle-tested approach is `supabase.auth.getUser(token)`.

**Fix**: Replace `getClaims` with `getUser` in the edge function.

### 2. No version pin on supabase-js import
`import { createClient } from "https://esm.sh/@supabase/supabase-js@2"` resolves to whatever latest `@2.x` is available. A breaking minor release could silently break the function.

**Fix**: Pin to `@2.49.1` or similar known-good version (matching the project's `^2.98.0`).

### 3. ProtectedRoute doesn't enforce buyer role for `/dashboard`
`ProtectedRoute requireRole` only checks "has any role" -- a seller could navigate to `/dashboard` and hit the buyer-specific edge function, getting a 403. The user sees a broken error screen instead of a proper redirect.

**Fix**: Pass the required role to `ProtectedRoute` (`requireRole="buyer"`) and check the specific role before rendering.

### 4. Edge function `.not("status", "in", ...)` syntax risk
The filter `'("completed","cancelled","timed_out")'` is correct PostgREST syntax, but if any status value contains special characters or the enum changes, it breaks silently. Should also include `"expired"` and `"refunded"` if those exist, to avoid counting them as "active."

**Fix**: Verify against actual enum values and ensure all terminal states are excluded.

### 5. `sellersResult` type casting is fragile
Line 205: `(sellersResult.value as any).data` -- the ternary on line 178-183 returns `Promise.resolve({ data: [] })` which doesn't match the Supabase response shape. `Promise.allSettled` wraps it as `{ status: "fulfilled", value: { data: [] } }` which works, but the `as any` casts hide potential runtime errors.

**Fix**: Normalize the empty case to avoid type confusion.

## Plan

### File: `supabase/functions/buyer-dashboard/index.ts`

1. **Replace `getClaims` with `getUser`**: Use `adminClient.auth.getUser(token)` (service role client can verify any user's token). Extract `userId` from the returned user object.

2. **Pin import version**: Change to `https://esm.sh/@supabase/supabase-js@2.49.1`

3. **Fix seller profiles fetch**: Replace the ternary with a proper guard so the `Promise.allSettled` array has consistent types.

4. **Add `currency_code` to recent transactions query**: The current select on line 94 doesn't include `currency_code` from transactions table (it comes from `transaction_pricing` instead, which is correct -- no change needed here).

### File: `src/components/auth/ProtectedRoute.tsx`

Update to accept `requireRole` as a string (e.g., `"buyer"`) instead of boolean. When set, check that the user has that specific role before allowing access. Redirect to `/role-selection` if role is missing entirely, or to `/` (with toast) if user has a different role.

### File: `src/App.tsx`

Change `<ProtectedRoute requireRole />` to `<ProtectedRoute requireRole="buyer" />`.

## Files Summary

| File | Action |
|---|---|
| `supabase/functions/buyer-dashboard/index.ts` | Fix auth method, pin version, clean up types |
| `src/components/auth/ProtectedRoute.tsx` | Accept specific role string |
| `src/App.tsx` | Pass `requireRole="buyer"` |

No database changes needed.

