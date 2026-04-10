

# Batch 1 — Buyer Verification Completeness Audit

## Status: Nearly Complete

All major pieces are built. Here is the item-by-item breakdown:

---

## Tracking Checklist

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Phone OTP send works | DONE | `verify-phone` edge function, `send_otp` action with 6-digit code, SHA-256 hashing, stored in `phone_otp_codes` |
| 2 | Phone OTP verify works | DONE | `verify_otp` action, hash comparison, marks `verified_at`, updates `account_verifications.phone_verified`, recomputes level |
| 3 | Resend cooldown works | DONE | 60-second cooldown enforced server-side (lines 89-99 of verify-phone) |
| 4 | Invalid attempt limits work | DONE | Max 5 attempts per code, max 3 sends per phone per hour, previous codes invalidated via `invalidated_at` |
| 5 | State/City visible and saved | DONE | `PersonalInfoSection` shows location fields, `buyer-profile` PATCH handles `state_name`/`city_name`, recomputes verification level on save |
| 6 | Verification level displays correctly | DONE | `AccountVerificationSection` shows trust level badge, progress bar ("X of 3 activation steps"), limits display, unlock messaging |
| 7 | Protected payment locked until phone verification | DONE | `initiate-paystack-payment` checks `phoneVerified && locationComplete && levelPermits`, returns 403 with specific missing items |
| 8 | Seller sees buyer trust badge | DONE | `BuyerTrustBadges` imported and rendered in `SellerTransactionDetail.tsx` (line 208) |

---

## Additional Batch 1 Requirements Check

| Requirement | Status | Notes |
|---|---|---|
| Verification levels enum (4 tiers) | DONE | `verification_level_type` enum with all 4 values in DB |
| `compute_verification_level` function | DONE | DB function correctly computes unverified / basic_verified / trusted_buyer |
| trusted/high-trust capped to basic limits | DONE | `buyer-profile` limits both to 50,000 / 1 concurrent with TODO comment for Batch 3 |
| Feature lock flags (canStartProtectedPayment, canOpenDispute, canHoldActiveTransaction) | DONE | All three require `phoneVerified && hasLocation && level !== "unverified"` |
| `requiresPhoneVerification` / `requiresLocation` flags | DONE | Returned in permissions object |
| Phone Verification Modal (send, verify, success) | DONE | Full 3-step modal with dev OTP banner, cooldown timer, resend, change number |
| Profile page shows verification progress | DONE | Progress bar, verification items list, feature lock banner, limits display |
| OTP hashed storage | DONE | SHA-256 hashed before insert |
| `invalidated_at` column for audit | DONE | Migration 017, used in verify-phone for old code invalidation |
| Email verified from auth source of truth | DONE | `buyer-profile` reads `email_confirmed_at` from auth.users, not DB flag |
| Phone data semantics documented | DONE | JSDoc in `profile.service.ts` |
| Identity row shows "Coming Soon" | DONE | "Identity Verification — Coming Soon" with muted style in AccountVerificationSection |
| Progress label says "activation steps" | DONE | "X of 3 activation steps completed" |

---

## Gaps Found: 2 Minor Items

### 1. Dispute opening is not backend-gated (low priority)
The `canOpenDispute` flag is returned to the frontend, but the `buyer-disputes` edge function does not explicitly check phone/location/level before allowing dispute creation. The RLS policy `buyers_insert_disputes` only checks transaction ownership. If a frontend bypass occurs, an unverified buyer could insert a dispute.

**Fix**: Add the same phone+location+level check to the disputes edge function.

### 2. SMS delivery is dev-mode only
OTP codes are returned in the response (`dev_otp` field) rather than sent via SMS. This is intentional and acknowledged — you plan to circle back for Twilio/Termii integration later.

**Not a blocker** — dev mode is functional for testing.

---

## Verdict

Batch 1 is **complete** with one minor backend hardening item (dispute gating). Everything else — data model, OTP flow, abuse protection, profile/location, verification display, payment gating, seller trust badges — is built and wired end-to-end.

Want me to fix the dispute backend gate now, or move on to the next batch?

