

# Batch 1 — Buyer Verification Completeness Audit

## Status: Complete

All 8 checklist items done. Dispute backend gate added in Batch 2.

---

# Batch 2 — Feature Locks, Limits, Trust-Based Permissions + Location Validation

## Status: Complete

### What was implemented

**A. Location Validation (Lagos-Only Launch)**
- Migration: `serviceable_regions` seeded with 37 Nigerian states. Lagos has 20 LGA rows (`is_active = true`). Non-Lagos states are state-level visibility rows (`city_name = NULL`, `is_active = false`).
- `PersonalInfoSection.tsx`: Free-text state/city replaced with `<Select>` dropdowns. Lagos shows LGA picker labeled "Local Government Area (LGA)". Non-Lagos states show "Lagos-only launch" banner. "Detect my location" button uses browser geolocation as a convenience prefill only.
- `buyer-profile` PATCH: Validates state/LGA against `serviceable_regions`. Sets `is_region_eligible` based on `is_active` flag.
- `initiate-paystack-payment`: Gate added — returns 403 if `is_region_eligible = false`.

**B. Tiered Limits & Enforcement**
- `computePermissions` expanded with real tiered limits:
  - `unverified`: ₦0 / 0 concurrent (active)
  - `basic_verified`: ₦50,000 / 1 concurrent (active)
  - `trusted_buyer`: ₦200,000 / 3 concurrent (scaffolded, not reachable)
  - `high_trust_buyer`: ₦500,000 / 5 concurrent (scaffolded, not reachable)
- `initiate-paystack-payment`: Enforces amount limit and concurrent transaction cap with 403 responses.
- `buyer-disputes`: Verification gate enforced (phone + location + level). Tiered dispute policy info returned to frontend.
- New permission flags: `canCreateAnotherActiveTransaction`, `canAccessHighValueTransaction`, `canReceiveHighTierRefund`, `requiresIdentityVerification`, `activeTransactionCount`, `isRegionEligible`.

**C. UI Lock Messaging**
- `BuyerPaymentSummary.tsx` and `BuyerTransactionReview.tsx`: Context-aware banners for region ineligibility, concurrency cap, and base verification.
- `AccountVerificationSection.tsx`: Shows tiered limits, active tx count, region eligibility status, and "Next level: Trusted Buyer" messaging.

### Tracking Checklist

| # | Item | Status |
|---|---|---|
| 1 | Amount limit enforced in backend | DONE |
| 2 | Active transaction cap enforced | DONE |
| 3 | Dispute access tied to verification | DONE |
| 4 | Permission flags returned to frontend | DONE |
| 5 | Lock messaging shown on blocked actions | DONE |
| 6 | Location validated against serviceable_regions | DONE |
| 7 | Region eligibility controls payment access | DONE |
| 8 | Select dropdowns replace free-text inputs | DONE |
| 9 | Geolocation convenience helper added | DONE |

### Reachable tiers in Batch 2
- `unverified` and `basic_verified` are the only active levels.
- `trusted_buyer` and `high_trust_buyer` are scaffolded for future identity-based upgrades.
