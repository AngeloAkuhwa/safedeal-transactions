

# Batch 1: Buyer Verification Foundation — Full Implementation Plan

## Overview

Transform verification from a cosmetic profile section into a backend-enforced permission engine. After this batch, a buyer with only email verified cannot complete a protected payment, open a dispute, or hold an active purchase.

---

## 1. Database Migration

**New enum types:**
```sql
CREATE TYPE public.verification_level_type AS ENUM ('unverified', 'basic_verified', 'trusted_buyer', 'high_trust_buyer');
```

**Alter `account_verifications` table — add column:**
```sql
ALTER TABLE public.account_verifications
  ADD COLUMN verification_level public.verification_level_type NOT NULL DEFAULT 'unverified';
```

**New table: `phone_otp_codes`**
```sql
CREATE TABLE public.phone_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.phone_otp_codes ENABLE ROW LEVEL SECURITY;
-- No client-side RLS policies — service role only
CREATE INDEX idx_phone_otp_user ON public.phone_otp_codes (user_id, created_at DESC);
CREATE INDEX idx_phone_otp_phone ON public.phone_otp_codes (phone, created_at DESC);
```

**New database function: `compute_verification_level`**
```sql
CREATE OR REPLACE FUNCTION public.compute_verification_level(_user_id uuid)
RETURNS verification_level_type
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _email_confirmed boolean;
  _phone_verified boolean;
  _identity_verified boolean;
  _has_location boolean;
BEGIN
  SELECT email_verified, phone_verified, identity_verified
  INTO _email_confirmed, _phone_verified, _identity_verified
  FROM account_verifications WHERE user_id = _user_id;

  SELECT (state_name IS NOT NULL AND city_name IS NOT NULL)
  INTO _has_location
  FROM profiles WHERE id = _user_id;

  IF _identity_verified AND _phone_verified AND _email_confirmed AND _has_location THEN
    RETURN 'trusted_buyer';
  ELSIF _email_confirmed AND _phone_verified AND _has_location THEN
    RETURN 'basic_verified';
  ELSE
    RETURN 'unverified';
  END IF;
END;
$$;
```
(Note: `high_trust_buyer` exists in the enum but won't be auto-computed in Batch 1 — reserved for future platform-history-based promotion.)

---

## 2. New Edge Function: `verify-phone`

**File:** `supabase/functions/verify-phone/index.ts`

Two actions via POST:

**`send_otp`** (body: `{ action: "send_otp", phone: string }`):
- Validate phone format: must start with `+234` or `0`, 10-11 digits after prefix
- Rate limit: query `phone_otp_codes` — max 3 codes created for this phone in last 60 minutes; max 1 in last 60 seconds (resend cooldown)
- Invalidate all previous unverified codes for this user (`UPDATE ... SET expires_at = now()`)
- Generate 6-digit random code
- Hash with SHA-256 before storing
- Insert into `phone_otp_codes` with `expires_at = now() + interval '10 minutes'`
- Save raw phone to `profiles.phone` (so it's captured even before verification)
- **Dev mode:** return the OTP in the response body with `// TODO: integrate Termii/Africa's Talking for real SMS`
- Return `{ success: true, expires_in: 600, message: "OTP sent" }`

**`verify_otp`** (body: `{ action: "verify_otp", code: string }`):
- Validate code is exactly 6 digits
- Find latest unexpired, unverified code for this user
- If none found: return 400 "No pending OTP. Request a new code."
- If `attempts >= max_attempts`: return 400 "Too many attempts. Request a new code."
- Increment `attempts` on every try
- Compare SHA-256 hash of submitted code against stored `code_hash`
- On mismatch: return 400 "Invalid code"
- On match:
  - Set `verified_at = now()` on the OTP record
  - Update `account_verifications SET phone_verified = true`
  - Recompute and update `verification_level` using `compute_verification_level(user_id)`
  - Return `{ success: true, phone_verified: true, verification_level: "..." }`

---

## 3. Update `buyer-profile` Edge Function

**File:** `supabase/functions/buyer-profile/index.ts`

**GET handler changes:**
- Add `state_name, city_name` to the profile SELECT
- Add `verification_level` to the account_verifications SELECT
- Compute and return backend permission flags:
```typescript
const level = verification.verification_level || 'unverified';
const permissions = {
  canStartProtectedPayment: level !== 'unverified',
  canOpenDispute: level !== 'unverified',
  canHoldActiveTransaction: level !== 'unverified',
  requiresPhoneVerification: !verification.phone_verified,
  requiresLocation: !profile.state_name || !profile.city_name,
  transactionLimitNaira: level === 'unverified' ? 0
    : level === 'basic_verified' ? 50000
    : level === 'trusted_buyer' ? 500000
    : 999999999,
  maxConcurrentActiveTransactions: level === 'unverified' ? 0
    : level === 'basic_verified' ? 1
    : level === 'trusted_buyer' ? 3
    : 5,
  verificationLevel: level,
};
```
- Return `{ profile, preferences, verification, permissions }` 

**PATCH handler — new action `update_location`:**
- Accept `state_name` and `city_name` strings
- Validate non-empty, max 100 chars each
- Update `profiles` table
- Recompute `verification_level` via `compute_verification_level` and update `account_verifications`
- Return updated profile

Also update the existing `update_profile` action to accept and save `state_name` and `city_name` (currently it only handles `full_name`, `phone`, `country_code`).

---

## 4. Update `initiate-paystack-payment` Edge Function

**File:** `supabase/functions/initiate-paystack-payment/index.ts`

Add a verification gate after authenticating the buyer (around line 39):
```typescript
// Check buyer verification level
const { data: verif } = await supabase
  .from('account_verifications')
  .select('phone_verified, verification_level')
  .eq('user_id', userId)
  .single();

if (!verif?.phone_verified || verif?.verification_level === 'unverified') {
  return new Response(JSON.stringify({
    error: "Phone verification required before making payments. Please verify your phone number in Profile Settings."
  }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
```

---

## 5. Service Layer Updates

**File:** `src/services/profile.service.ts`

Extend types:
```typescript
export type VerificationLevel = 'unverified' | 'basic_verified' | 'trusted_buyer' | 'high_trust_buyer';

export interface VerificationStatus {
  email_verified: boolean;
  phone_verified: boolean;
  identity_verified: boolean;
  payout_verified: boolean;
  verification_level: VerificationLevel;
}

export interface BuyerPermissions {
  canStartProtectedPayment: boolean;
  canOpenDispute: boolean;
  canHoldActiveTransaction: boolean;
  requiresPhoneVerification: boolean;
  requiresLocation: boolean;
  transactionLimitNaira: number;
  maxConcurrentActiveTransactions: number;
  verificationLevel: VerificationLevel;
}

export interface BuyerProfileResponse {
  profile: BuyerProfile;
  verification: VerificationStatus;
  preferences: NotificationPreferences;
  permissions: BuyerPermissions;
}
```

Add `state_name` and `city_name` to `BuyerProfile` interface.

Add new service functions:
```typescript
export const sendPhoneOtp = async (phone: string) => { /* invoke verify-phone */ };
export const verifyPhoneOtp = async (code: string) => { /* invoke verify-phone */ };
export const updateLocation = async (state_name: string, city_name: string) => { /* invoke buyer-profile PATCH */ };
```

---

## 6. New Component: Phone Verification Modal

**File:** `src/components/profile/PhoneVerificationModal.tsx`

Dialog with two steps:
1. **Enter phone**: Input with `+234` prefix hint, "Send OTP" button
2. **Enter code**: 6-digit `InputOTP` component, resend button with 60-second countdown timer, attempt counter

States: idle, sending, code_sent, verifying, success, error
- On success: show checkmark animation, auto-close after 2s, invalidate `buyer-profile` query
- Error display: "Invalid code", "Too many attempts", "Code expired"
- Resend button disabled during 60s cooldown with visible countdown

---

## 7. Redesigned AccountVerificationSection

**File:** `src/components/profile/AccountVerificationSection.tsx`

Replace current flat list with:

**Trust level header**: Badge showing current level with color coding:
- Unverified: red/destructive
- Basic Verified: green/success
- Trusted Buyer: blue/primary (future)

**Progress bar**: Visual 0-3 steps (email, phone, location)

**Unlock messaging** (the key UX improvement):
- Unverified: "Complete verification to unlock protected transactions"
- Next step hints: "Verify your phone to unlock transactions up to NGN 50,000"
- Current limits: "Your transaction limit: NGN X | Concurrent transactions: X"

**Verification items** with actionable buttons:
- Email: Verified badge (read-only, derived from auth)
- Phone: "Verify Now" button opens `PhoneVerificationModal` (or Verified badge)
- Location: Shows completion status based on `state_name`/`city_name` presence
- Identity: Shows "Coming in future update" (Batch 3)

---

## 8. Buyer Profile Page Updates

**File:** `src/pages/BuyerProfileSettings.tsx`

- Pass `showLocation={true}` to `PersonalInfoSection` (currently not passed for buyers)
- Pass `permissions` to `AccountVerificationSection`
- Wire `PhoneVerificationModal` with open/close state
- Pass `onPhoneVerifyClick` to `AccountVerificationSection` to open the modal

---

## 9. New Component: Buyer Trust Badges

**File:** `src/components/trust/BuyerTrustBadges.tsx`

Small badge row component for use on seller-facing transaction surfaces:
- "Email Verified" (checkmark icon)
- "Phone Verified" (phone icon)
- "Basic Verified Buyer" (shield icon)
- "First-Time Buyer" (info icon, when 0 completed transactions)

Only verification status badges — no sensitive data exposed.

This component will be rendered on:
- `SellerTransactionDetail` page (buyer info card)
- For now, just create the component — integration into seller pages is a quick follow-up

---

## 10. Payment Page Lock Banner

**File:** `src/pages/BuyerPaymentSummary.tsx`

Add a verification check near the top of the component:
- Query `buyer-profile` for permissions
- If `canStartProtectedPayment === false`, show a prominent lock banner:
  - "Phone verification required to proceed with payment"
  - "Go to Profile Settings" button
  - Disable the "Pay Now" button
  - Do NOT hide the payment page — let them see what they're about to unlock

**File:** `src/pages/BuyerTransactionReview.tsx`

Similar banner before the "Proceed to Payment" button if verification is incomplete.

---

## Files Summary

| File | Action | Description |
|---|---|---|
| Migration SQL | New | `verification_level_type` enum, `phone_otp_codes` table, `compute_verification_level` function, alter `account_verifications` |
| `supabase/functions/verify-phone/index.ts` | New | Phone OTP send/verify with abuse controls |
| `supabase/functions/buyer-profile/index.ts` | Modify | Return state/city, verification_level, permissions; add update_location action |
| `supabase/functions/initiate-paystack-payment/index.ts` | Modify | Gate payment on phone verification |
| `src/services/profile.service.ts` | Modify | Extended types + phone OTP + location service functions |
| `src/components/profile/PhoneVerificationModal.tsx` | New | OTP modal with cooldown, attempts, error handling |
| `src/components/profile/AccountVerificationSection.tsx` | Rewrite | Trust level progress bar, unlock messaging, actionable verify buttons |
| `src/components/trust/BuyerTrustBadges.tsx` | New | Seller-visible trust signal badges |
| `src/pages/BuyerProfileSettings.tsx` | Modify | Enable location fields, wire phone modal, pass permissions |
| `src/pages/BuyerPaymentSummary.tsx` | Modify | Add verification lock banner |
| `src/pages/BuyerTransactionReview.tsx` | Modify | Add verification lock banner before "Proceed to Payment" |

---

## Success Criteria Checklist

1. Phone OTP send works (with dev code in response)
2. Phone OTP verify works (hash comparison)
3. Resend cooldown (60s) enforced
4. Max 5 invalid attempts per code enforced
5. Max 3 sends per phone per hour enforced
6. Old codes invalidated when new one is sent
7. State/City visible and saveable on buyer profile
8. Verification level computed and displayed correctly
9. Protected payment blocked until phone verified + location complete
10. Seller sees buyer trust badges (component created)
11. Unlock messaging shows next steps and current limits

