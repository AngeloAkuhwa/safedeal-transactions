

# Fix: Email Verification Status Not Syncing to Profile Page

## Root Cause

The user confirmed their email (auth.users.email_confirmed_at = 2026-04-10 12:14:38), but `account_verifications.email_verified` is still `false`. There is **no mechanism** to sync auth confirmation status to the `account_verifications` table. The `handle_new_user` trigger inserts all verifications as `false`, and nothing ever updates them.

## Solution

Two-pronged fix: derive `email_verified` from the source of truth (`auth.users`) at read time, and keep `account_verifications` for non-auth verification statuses only.

### 1. Update `buyer-profile` edge function — derive email_verified from auth

Instead of reading `email_verified` from `account_verifications`, check `auth.users.email_confirmed_at` (which the admin client can access). This is the authoritative source.

**File**: `supabase/functions/buyer-profile/index.ts`

In the GET handler, after authenticating the user, use `userData.user.email_confirmed_at` to set `email_verified`:

```typescript
const verification = verificationResult.status === "fulfilled" && verificationResult.value.data
  ? {
      ...verificationResult.value.data,
      email_verified: !!userData.user.email_confirmed_at, // override from auth
    }
  : { email_verified: !!userData.user.email_confirmed_at, phone_verified: false, identity_verified: false, payout_verified: false };
```

### 2. Same fix for `seller-profile` edge function

**File**: `supabase/functions/seller-profile/index.ts`

Apply identical logic — override `email_verified` from `userData.user.email_confirmed_at`.

### 3. (Optional) Migration: sync existing data

Run a one-time migration to update `account_verifications.email_verified = true` for all users who already confirmed their email. This keeps the table consistent even though the edge functions no longer read it for email status.

```sql
UPDATE public.account_verifications av
SET email_verified = true
FROM auth.users au
WHERE av.user_id = au.id AND au.email_confirmed_at IS NOT NULL AND av.email_verified = false;
```

## Files Modified

| File | Change |
|---|---|
| `supabase/functions/buyer-profile/index.ts` | Override `email_verified` from `auth.users.email_confirmed_at` |
| `supabase/functions/seller-profile/index.ts` | Same override |
| Migration | Sync existing confirmed users' `email_verified` flag |

No frontend changes needed — the UI already displays whatever the API returns.

