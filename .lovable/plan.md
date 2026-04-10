

# Batch 1 Corrections — 8 Precision Fixes

## Summary

The core Batch 1 implementation is already built. These are targeted corrections to tighten logic, wording, and auditability based on your feedback.

---

## 1. Make payment gate explicit (backend)

**File:** `supabase/functions/initiate-paystack-payment/index.ts` (line 54)

Current check:
```typescript
if (!verif?.phone_verified || verif?.verification_level === "unverified")
```

Change to also check location:
```typescript
// Also fetch profile location
const { data: prof } = await supabaseAdmin
  .from("profiles")
  .select("state_name, city_name")
  .eq("id", userId)
  .single();

const phoneVerified = !!verif?.phone_verified;
const locationComplete = !!(prof?.state_name && prof?.city_name);
const levelPermits = verif?.verification_level !== "unverified";

if (!phoneVerified || !locationComplete || !levelPermits) {
  // Return 403 with specific message about what's missing
}
```

**File:** `supabase/functions/buyer-profile/index.ts` (line 45)

Change `canStartProtectedPayment` from `level !== "unverified"` to explicitly require all three:
```typescript
canStartProtectedPayment: phoneVerified && hasLocation && level !== "unverified",
```

Same for `canOpenDispute` and `canHoldActiveTransaction`.

---

## 2. Cap `trusted_buyer` behavior in Batch 1

**File:** `supabase/functions/buyer-profile/index.ts` (lines 30-42)

Change the limits so `trusted_buyer` and `high_trust_buyer` return the same caps as `basic_verified` for now:
```typescript
const limitByLevel = {
  unverified: 0,
  basic_verified: 50000,
  trusted_buyer: 50000,      // same as basic until Batch 3
  high_trust_buyer: 50000,   // same as basic until Batch 3
};
const concurrentByLevel = {
  unverified: 0,
  basic_verified: 1,
  trusted_buyer: 1,          // same as basic until Batch 3
  high_trust_buyer: 1,       // same as basic until Batch 3
};
```

Add a comment: `// TODO Batch 3: unlock higher limits after identity verification is implemented`

---

## 3. Tighten dispute permission flags

**File:** `supabase/functions/buyer-profile/index.ts`

Change:
```typescript
canOpenDispute: phoneVerified && hasLocation && level !== "unverified",
```

This ensures disputes require phone + location + level, not just "not unverified." The actual transaction ownership check already exists in the disputes RLS policy (`buyers_insert_disputes`).

---

## 4. Document phone data semantics

**File:** `src/services/profile.service.ts`

Add JSDoc comments:
```typescript
/** profiles.phone — stores the submitted phone number. NOT proof of verification. */
/** account_verifications.phone_verified — the actual trust signal for phone ownership. */
```

No backend change needed — the code already treats these correctly. This is documentation only.

---

## 5. Integrate trust badges into seller transaction detail

**File:** `src/pages/SellerTransactionDetail.tsx`

The `BuyerTrustBadges` component exists but isn't rendered anywhere. Add it to the buyer info section on the seller transaction detail page. The seller transaction detail edge function already returns buyer profile data — just wire the verification signals into the badge component.

This turns a "component created" checkbox into a "badges visible to seller" checkbox.

---

## 6. Remove separate `update_location` — use `update_profile` only

The current `buyer-profile` PATCH handler already accepts `state_name` and `city_name` in the `update_profile` action (lines 172-184) and recomputes verification level after location changes (lines 199-210). There is no separate `update_location` action.

**Decision:** Keep it as-is. One action (`update_profile`) handles all profile fields including location. No code change needed — just documenting that the plan's mention of a separate `update_location` action is not implemented and not needed.

---

## 7. Add `invalidated_at` column for OTP auditability

**Migration:** Add column to `phone_otp_codes`:
```sql
ALTER TABLE public.phone_otp_codes ADD COLUMN invalidated_at timestamptz;
```

**File:** `supabase/functions/verify-phone/index.ts` (line 114-118)

Change invalidation from setting `expires_at = now()` to setting `invalidated_at = now()`:
```typescript
await supabase
  .from("phone_otp_codes")
  .update({ invalidated_at: new Date().toISOString() })
  .eq("user_id", userId)
  .is("verified_at", null)
  .is("invalidated_at", null);
```

Update the verify_otp lookup to also filter `is("invalidated_at", null)` so invalidated codes are excluded.

This cleanly distinguishes: expired (time passed), invalidated (new code issued), verified (successfully used).

---

## 8. Fix progress bar wording

**File:** `src/components/profile/AccountVerificationSection.tsx`

Current progress says "X of 3 steps completed" which is correct (email, phone, location). The identity row already shows "Coming in a future update" and is not counted in the progress bar (line 45 only counts email, phone, location).

Minor text fix: change the progress label from "X of 3 steps completed" to "X of 3 activation steps completed" to make it clearer this is activation, not the full trust ladder. And ensure the identity row label says "Identity Verification — Coming Soon" with a muted style so it's visually distinct from the actionable steps.

---

## Files Summary

| File | Change |
|---|---|
| `supabase/functions/initiate-paystack-payment/index.ts` | Add location check to payment gate |
| `supabase/functions/buyer-profile/index.ts` | Explicit permission flags; cap trusted/high-trust to basic limits |
| `supabase/functions/verify-phone/index.ts` | Use `invalidated_at` instead of expiry manipulation |
| `src/services/profile.service.ts` | Add JSDoc on phone semantics |
| `src/components/profile/AccountVerificationSection.tsx` | Progress label wording tweak |
| `src/pages/SellerTransactionDetail.tsx` | Integrate BuyerTrustBadges |
| Migration | Add `invalidated_at` column to `phone_otp_codes` |

