

# Batch 2 — Feature Locks, Limits, Trust-Based Permissions + Location Validation

## Summary

Upgrade the verification system from display-only to a real policy engine with enforced limits, and replace free-text location inputs with validated dropdowns seeded from Nigerian states/LGA data. Lagos is the only active launch region.

---

## Part A: Location Validation (Lagos-Only Launch)

### A1. Database migration — Seed `serviceable_regions`

**Row semantics:**

- **Lagos rows**: Locality-level rows with real LGA names in `city_name`. These are active (`is_active = true`) and represent areas where protected transactions are available. 20 LGAs: Agege, Ajeromi-Ifelodun, Alimosho, Amuwo-Odofin, Apapa, Badagry, Epe, Eti-Osa, Ibeju-Lekki, Ifako-Ijaiye, Ikeja, Ikorodu, Kosofe, Lagos Island, Lagos Mainland, Mushin, Ojo, Oshodi-Isolo, Shomolu, Surulere.
- **Non-Lagos rows**: State-level visibility rows with `city_name = NULL` and `is_active = false`. These exist solely so the state dropdown can display all 36 states + FCT. No placeholder or fake city values are inserted. Real locality data for these states will be added when they go live.

### A2. Frontend — Replace free-text with Select dropdowns

**File: `src/components/profile/PersonalInfoSection.tsx`**

- On mount, fetch all regions from `serviceable_regions` via direct Supabase client query
- State field → `<Select>` with all 37 Nigerian states
- When Lagos is selected → second field labeled **"Local Government Area (LGA)"** populates with 20 Lagos LGAs
- When non-Lagos state selected → LGA dropdown hidden (no city rows exist), show banner: "SafeDeal protected transactions are currently available only in Lagos during this launch phase. You can complete your profile, and we'll notify you when your area becomes active."
- Optional **"Detect my location"** button using `navigator.geolocation` → reverse geocode via Nominatim (free, no key) → pre-fill dropdowns. **Geolocation is strictly a convenience helper**: it only prefills values, user confirmation is always required before saving, and the geolocation result never determines eligibility by itself.

**File: `src/services/profile.service.ts`**

- Add `getServiceableRegions()` function
- Add new permission fields to `BuyerPermissions` interface

### A3. Backend validation in `buyer-profile` PATCH

When `state_name` or `city_name` is in the update:
1. Query `serviceable_regions` to validate the state exists; if Lagos, validate that the LGA also exists
2. Return 400 if combination invalid
3. Set `is_region_eligible` based on matched region's `is_active` flag
4. Update `profiles.is_region_eligible` alongside the location save

### A4. Payment gate — require `is_region_eligible`

**File: `supabase/functions/initiate-paystack-payment/index.ts`**

After existing verification gate, also check `profiles.is_region_eligible = true`. If false, return 403: "SafeDeal protected transactions are currently available only in Lagos."

---

## Part B: Tiered Limits & Enforcement

### Reachable tiers in Batch 2

- **`unverified`** and **`basic_verified`** are the only meaningful active levels in Batch 2. A buyer who completes email + phone + location reaches `basic_verified`.
- **`trusted_buyer`** and **`high_trust_buyer`** limits are scaffolded in code (limit maps, permission flags) but are **not reachable** until identity verification and risk-based upgrade paths are built in later batches. No upgrade path to these tiers exists yet.

### B1. Expand `computePermissions` with real tiered limits

**File: `supabase/functions/buyer-profile/index.ts`**

| Level | Amount Limit | Concurrent Limit | Reachable? |
|---|---|---|---|
| unverified | 0 | 0 | Yes |
| basic_verified | ₦50,000 | 1 | Yes |
| trusted_buyer | ₦200,000 | 3 | Not yet (scaffolded) |
| high_trust_buyer | ₦500,000 | 5 | Not yet (scaffolded) |

Add active transaction count query and new flags:
- `canCreateAnotherActiveTransaction` (activeCount < max)
- `canAccessHighValueTransaction` (level >= trusted_buyer)
- `canReceiveHighTierRefund` (level = high_trust_buyer)
- `requiresIdentityVerification` (level < trusted_buyer)
- `activeTransactionCount`
- `isRegionEligible`

### B2. Enforce amount + concurrency in payment initiation

**File: `supabase/functions/initiate-paystack-payment/index.ts`**

After verification + region gate:
1. Check `item_amount > limitForLevel` → 403 with "This transaction exceeds your ₦X limit. Complete identity verification to unlock higher limits."
2. Count buyer's active transactions (statuses: `payment_secured`, `seller_preparing_delivery`, `seller_dispatched`, `delivered_awaiting_verification`, `disputed`) → 403 if at cap with "You've reached your active purchase limit (X). Complete or resolve existing transactions first."

### B3. Tiered dispute rules

**File: `supabase/functions/buyer-disputes/index.ts`**

On POST (dispute creation), enforce all three requirements:
1. **Verified transaction ownership**: buyer must be the `buyer_id` on the transaction (already enforced by RLS)
2. **Tier eligibility**: buyer must be at least `basic_verified` with phone + location complete (existing gate from Batch 1)
3. **Amount threshold**: the underlying transaction's `item_amount` must not exceed the buyer's tier limit — a `basic_verified` buyer cannot dispute a transaction above ₦50,000

Additionally: `basic_verified` buyers limited to 1 open dispute at a time.

### B4. Update frontend types

**File: `src/services/profile.service.ts`**

Add to `BuyerPermissions`: `canCreateAnotherActiveTransaction`, `canAccessHighValueTransaction`, `canReceiveHighTierRefund`, `requiresIdentityVerification`, `activeTransactionCount`, `isRegionEligible`.

---

## Part C: UI Lock Messaging

### C1. Payment pages

**Files: `src/pages/BuyerPaymentSummary.tsx`, `src/pages/BuyerTransactionReview.tsx`**

Context-aware messaging:
- Region ineligible → "Protected transactions are only available in Lagos during launch"
- Amount exceeds limit → "This exceeds your ₦50,000 limit. Complete identity verification to unlock higher limits"
- Concurrent cap hit → "You've reached your active purchase limit (1)"
- Base verification missing → existing message

### C2. Profile verification section

**File: `src/components/profile/AccountVerificationSection.tsx`**

- Show actual limits for current level
- Show "Next level unlocks" messaging (with note that identity verification is coming soon)
- Show region eligibility status

---

## Files Changed Summary

| File | Change |
|---|---|
| **New migration SQL** | Seed 37 states (Lagos with 20 LGA rows `is_active=true`, 36 others as state-level rows `city_name=NULL`, `is_active=false`) |
| `supabase/functions/buyer-profile/index.ts` | Validate state/LGA against DB, set `is_region_eligible`, expand `computePermissions` with tiered limits + active tx count |
| `supabase/functions/initiate-paystack-payment/index.ts` | Add region check, amount limit, concurrent tx cap |
| `supabase/functions/buyer-disputes/index.ts` | Add amount threshold + active dispute count + transaction ownership checks |
| `src/components/profile/PersonalInfoSection.tsx` | Select dropdowns (State + LGA for Lagos), detect location button, Lagos-only UX |
| `src/services/profile.service.ts` | Add `getServiceableRegions()`, update `BuyerPermissions` |
| `src/pages/BuyerPaymentSummary.tsx` | Context-aware lock banners |
| `src/pages/BuyerTransactionReview.tsx` | Context-aware lock banners |
| `src/components/profile/AccountVerificationSection.tsx` | Tiered limits display, region status |

No new tables needed. No external API dependencies at runtime.

