

# Batch 3: Identity Submission + Updated Limits + Seller Enforcement

This implements a compliance-safe, startup-friendly identity verification flow with updated transaction limits for both buyers and sellers.

---

## Overview

Three workstreams delivered together:

1. **Identity submission table + edge functions** — buyers submit identity for manual review
2. **Updated transaction limits** — raise limits across all tiers (CBN-aligned)
3. **Seller verification enforcement** — sellers get the same tiered limits as buyers

---

## Part 1: Database Migration

**New enums:**
```sql
CREATE TYPE identity_submission_status AS ENUM ('not_started','pending_review','verified','rejected','more_info_needed');
CREATE TYPE identity_verification_method AS ENUM ('nin','government_id');
```

**New table: `identity_submissions`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL | FK profiles(id) |
| status | identity_submission_status | DEFAULT 'pending_review' |
| verification_method | identity_verification_method | |
| legal_name | text NOT NULL | max 200 chars |
| date_of_birth | date | nullable |
| masked_identifier | text | nullable, e.g. "****1234" |
| document_file_id | uuid | nullable FK files(id), for gov ID route |
| consent_accepted_at | timestamptz NOT NULL | |
| submitted_at | timestamptz DEFAULT now() | |
| reviewed_at | timestamptz | nullable |
| reviewed_by | text | nullable (admin ref) |
| review_notes | text | nullable (internal only) |
| rejected_at | timestamptz | nullable |
| rejection_reason | text | nullable (shown to buyer) |
| provider_reference | text | nullable (future NINAuth) |
| created_at / updated_at | timestamptz | standard |

**RLS:** Buyers SELECT/INSERT own rows. UPDATE only when status = `more_info_needed` or `rejected`. Admins full access via `has_role`. No DELETE.

**Trigger:** `update_updated_at_column` applied.

---

## Part 2: Updated Limit Constants

Applied in `buyer-profile`, `seller-profile`, `initiate-paystack-payment`, and `create-transaction`:

```text
Tier              | Per-Txn  | Concurrent
──────────────────┼──────────┼───────────
unverified        | ₦0       | 0
basic_verified    | ₦100,000 | 2
trusted_buyer     | ₦500,000 | 5
high_trust_buyer  | ₦1,000,000 | 10
```

---

## Part 3: Edge Functions

### New: `submit-identity`
- **POST**: Buyer submits identity (legal_name, method, masked_identifier or document_file_id, consent). Validates buyer is `basic_verified` first. No duplicate pending submissions.
- **GET**: Returns latest submission status for authenticated user. Never exposes `review_notes`.
- **PATCH**: Resubmit when status is `rejected` or `more_info_needed`.

### New: `admin-review-identity`
- **PATCH**: Admin approves/rejects/requests-more-info. On approve: sets `account_verifications.identity_verified = true`, recomputes level via `compute_verification_level`. Logs to `audit_logs`.

### Updated: `buyer-profile/index.ts`
- Update `LIMIT_BY_LEVEL` and `CONCURRENT_BY_LEVEL` to new values.
- Include latest `identity_submissions` status in GET response.

### Updated: `seller-profile/index.ts`
- Add `LIMIT_BY_LEVEL`, `CONCURRENT_BY_LEVEL`, `computeSellerPermissions`.
- Fetch `account_verifications.verification_level` for seller.
- Return `permissions` object in GET response (mirrors buyer pattern).
- Add CORS `Access-Control-Allow-Methods` header.

### Updated: `create-transaction/index.ts`
- On `publish`: check seller's verification level >= `basic_verified`.
- Check seller's active transaction count against concurrent limit.
- Check transaction item_amount against seller's tier limit.

### Updated: `initiate-paystack-payment/index.ts`
- Update limit constants to match new values.

---

## Part 4: Frontend

### New: `src/services/identity.service.ts`
Service with `submitIdentity`, `getIdentityStatus`, `resubmitIdentity` using direct fetch (same pattern as `profileFetch`).

### Updated: `src/pages/BuyerVerification.tsx`
Replace "Coming Soon" with real flow:
- Prerequisite check (must be `basic_verified`)
- Status display for pending/verified/rejected/more_info_needed
- Submission form: legal name, method selector (NIN / Gov ID), NIN input (masked) or file upload, DOB (optional), consent checkbox
- NIN input masks after entry, stores only last 4 digits

### Updated: `src/components/profile/AccountVerificationSection.tsx`
- Identity row shows real status from submission data
- "Not started" → link to `/dashboard/verification`
- "Pending" → "Under Review" badge
- "Verified" → green badge
- "Rejected" → "Resubmit" link

### Updated: `src/components/trust/BuyerTrustBadges.tsx`
- Add "Identity Submitted" badge for `pending_review` status

### Updated: `src/services/profile.service.ts`
- Add `identitySubmission` to `BuyerProfileResponse` type

---

## Part 5: Seller Profile Verification Display

### Updated: `src/pages/SellerProfileSettings.tsx`
- Show verification status section with limits (reuse `AccountVerificationSection` pattern or add seller-specific variant)

---

## Files Changed

| File | Action |
|---|---|
| New migration SQL | identity_submissions table + enums + RLS |
| `supabase/functions/submit-identity/index.ts` | New |
| `supabase/functions/admin-review-identity/index.ts` | New |
| `supabase/functions/buyer-profile/index.ts` | Update limits + include identity status |
| `supabase/functions/seller-profile/index.ts` | Add permission engine + CORS fix |
| `supabase/functions/create-transaction/index.ts` | Add seller limit enforcement |
| `supabase/functions/initiate-paystack-payment/index.ts` | Update limit constants |
| `src/services/identity.service.ts` | New |
| `src/services/profile.service.ts` | Add identity submission type |
| `src/pages/BuyerVerification.tsx` | Real submission flow |
| `src/components/profile/AccountVerificationSection.tsx` | Real identity status |
| `src/components/trust/BuyerTrustBadges.tsx` | "Identity Submitted" badge |
| `src/pages/SellerProfileSettings.tsx` | Show verification + limits |

