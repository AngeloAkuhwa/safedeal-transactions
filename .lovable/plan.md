

# Revised Batch 3: 10 Corrections to Identity Verification Implementation

## Summary

Ten targeted fixes to the already-implemented Batch 3 code, addressing limits, compliance, auditability, and operational clarity.

---

## 1. Reduce Transaction Limits to Conservative Early-Launch Levels

Current limits are too aggressive for a manual-review identity flow at startup stage. Reduce to:

```text
Tier              | Per-Txn   | Concurrent
──────────────────┼───────────┼───────────
unverified        | ₦0        | 0
basic_verified    | ₦50,000   | 1
trusted_buyer     | ₦200,000  | 3
high_trust_buyer  | ₦500,000  | 5
```

Rationale: Manual review means no instant identity assurance. ₦50k starter limit covers most small Lagos trades. ₦200k for trusted is conservative but meaningful. ₦500k high-trust reserved for future automated verification. These can be raised once NINAuth partner integration is live.

**Files:** `buyer-profile/index.ts`, `seller-profile/index.ts`, `create-transaction/index.ts`, `initiate-paystack-payment/index.ts` — update `LIMIT_BY_LEVEL` and `CONCURRENT_BY_LEVEL` constants.

---

## 2. Clarify NIN Route as Manual Submission (Not Automated Verification)

This is a NIN-based identity **submission** for manual review, not automated NIN verification. The full NIN is never stored — only the last 4 digits as a masked value (`****1234`). The raw NIN is entered client-side, immediately masked, and the input cleared. The backend validates the masked format and rejects full numbers.

**Changes:**
- `BuyerVerification.tsx`: Update "How It Works" text to say "NIN-based identity submission (manual review)" and add explicit note "Your full NIN is never transmitted or stored."
- No backend changes needed — `submit-identity` already validates `****XXXX` format and rejects raw NINs.

---

## 3. Add Consent Text Version Tracking

Add `consent_text_version` column to `identity_submissions` table so we know exactly what the buyer consented to.

**Migration:** `ALTER TABLE identity_submissions ADD COLUMN consent_text_version text NOT NULL DEFAULT 'v1.0';`

**Edge function (`submit-identity`):** Set `consent_text_version: "v1.0"` on insert. The version string corresponds to the consent text shown in the frontend.

**Frontend:** Display the consent version in the submission status card for transparency.

---

## 4. Change `reviewed_by` from text to uuid

Currently `reviewed_by` is `text`. Change to `uuid` referencing the admin's user ID for proper auditability.

**Migration:**
```sql
ALTER TABLE identity_submissions
  ALTER COLUMN reviewed_by TYPE uuid USING reviewed_by::uuid;
```

**Edge function (`admin-review-identity`):** Already stores `adminUserId` (a uuid) — no code change needed.

---

## 5. Define Document Handling Rules for Gov ID Route

Even though Gov ID upload is marked "Coming Soon" in the UI, define the rules now for when it's enabled:

- **Allowed file types:** JPEG, PNG, PDF only (validated in `submit-identity` by checking `files.mime_type`)
- **Max file size:** 5MB (validated in the upload edge function)
- **Access control:** Files with `context_type = 'identity_document'` are accessible only to the uploader and admins. Add a RLS policy on `files` for admin SELECT access.
- **Replacement:** On resubmission, old `document_file_id` is preserved on the old row; new submission gets a new file reference. Old files retain `retention_category = 'legal_hold'`.
- **Retention:** Identity documents are kept for the legally required retention period, then marked for deletion. `retain_until` is set to submission date + 7 years.

**Files:** `submit-identity/index.ts` (add mime_type validation when gov_id enabled), new migration for admin file SELECT policy.

---

## 6. Resubmission Creates New Row, Preserves History

Currently the PATCH handler updates the existing row in place, silently overwriting. Change to: PATCH creates a **new** `identity_submissions` row with `status = 'pending_review'`, linking back to the previous submission. The old row is preserved as-is for audit history.

**Migration:** `ALTER TABLE identity_submissions ADD COLUMN previous_submission_id uuid REFERENCES identity_submissions(id);`

**Edge function (`submit-identity` PATCH):** Instead of updating the existing row, insert a new row with `previous_submission_id` set to the old row's ID. Copy forward unchanged fields from the old submission.

**Frontend:** No change needed — the GET handler already returns the latest submission.

---

## 7. Differentiate "Identity Submitted" vs "Identity Verified" Badges

Currently both use `ShieldCheck` icon. Make the distinction clearer:

- **Identity Submitted** (pending): Use `Clock` icon, muted yellow/amber styling, label "Identity Pending Review"
- **Identity Verified**: Use `ShieldCheck` icon, strong primary/green styling, label "Identity Verified"

This prevents sellers from over-trusting a buyer who is only pending review.

**File:** `BuyerTrustBadges.tsx` — change icon and label for `identitySubmitted` badge.

---

## 8. Add Admin Review Operational Details

The `admin-review-identity` edge function exists but needs a GET endpoint for the review queue.

**Add GET handler to `admin-review-identity`:**
- Returns paginated list of submissions with `status = 'pending_review'`, ordered by `submitted_at ASC`
- Includes submitter's `full_name`, `email`, `phone`, `verification_level` from profiles/account_verifications
- Supports `?status=pending_review|rejected|verified` filter
- Admin role required

**Rejection reason handling:** Already implemented — `rejection_reason` is stored on reject/more_info_needed and shown to the buyer in `SubmissionStatus` component. No change needed.

---

## 9. Confirm trusted_buyer Promotion Conditions

The existing `compute_verification_level` function already enforces this correctly:

```sql
IF _identity_verified AND _phone_verified AND _email_verified AND _has_location THEN
  RETURN 'trusted_buyer';
```

Identity approval alone does NOT override other conditions. All four must be true: identity verified + phone verified + email verified + location set. No code change needed — just confirming this is already correct.

---

## 10. Make Data Minimization Explicit

Add explicit enforcement:

- **Backend:** `submit-identity` GET handler already excludes `review_notes` from buyer response. Confirm `admin-review-identity` GET is the only path that returns `review_notes`.
- **Seller visibility:** No identity data fields are included in any seller-facing edge function response (`seller-transaction-detail`, `resolve-share-token`, etc.). Only trust badges are shown. Confirm by auditing these endpoints.
- **Frontend:** Add a privacy notice card to `BuyerVerification.tsx`: "Your identity data is stored securely, accessible only to you and our review team. Sellers only see your trust level, never your identity documents or NIN."

---

## Files Changed Summary

| File | Change |
|---|---|
| New migration | `consent_text_version` column, `reviewed_by` type change, `previous_submission_id` column, admin file SELECT policy |
| `supabase/functions/buyer-profile/index.ts` | Reduce limits |
| `supabase/functions/seller-profile/index.ts` | Reduce limits |
| `supabase/functions/create-transaction/index.ts` | Reduce limits |
| `supabase/functions/initiate-paystack-payment/index.ts` | Reduce limits |
| `supabase/functions/submit-identity/index.ts` | Consent version, new-row resubmission, mime_type validation prep |
| `supabase/functions/admin-review-identity/index.ts` | Add GET for review queue |
| `src/pages/BuyerVerification.tsx` | Clarify NIN route text, privacy notice, consent version display |
| `src/components/trust/BuyerTrustBadges.tsx` | Differentiate submitted vs verified badges |

