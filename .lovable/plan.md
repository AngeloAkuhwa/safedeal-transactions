

# Seller Dispute Detail Refinement Plan

## Status: IMPLEMENTED ✅

## Summary
Refined the seller dispute detail page with proper role separation, multi-response workflow (max 2), response editing (latest only), additional evidence upload/replacement with deterministic tracking, backend-driven permission flags, and dispute-centric audit logging.

## What Was Implemented

### Database Migration
- Replaced `UNIQUE(dispute_id)` with `UNIQUE(dispute_id, response_number)` on `dispute_responses`
- Added edit tracking: `edited_at`, `edited_by_user_id`, `previous_response_text` on `dispute_responses`
- Added replacement tracking: `is_active`, `replaced_at`, `replaced_by_file_id` on `dispute_evidence`
- Added `seller_additional_dispute_evidence` enum value to `dispute_evidence_type`
- Added `dispute_response_edited` and `dispute_evidence_replaced` to `audit_action_type`
- RLS policies for seller UPDATE on `dispute_responses` and `dispute_evidence`

### Edge Functions
- `submit-seller-response`: 3 actions — `submit_response` (default), `edit_response`, `replace_additional_evidence`
- `seller-dispute-detail`: Returns `permissions` object with explicit non-overlapping flags

### Permission Flags (backend-driven)
- `canSubmitInitialResponse` — responseCount === 0 AND respondable
- `canAddFollowUpResponse` — responseCount === 1 AND respondable
- `canEditLatestResponse` — responseCount > 0 AND respondable
- `canUploadAdditionalEvidence` — !additionalEvidenceSubmitted AND respondable
- `canReplaceAdditionalEvidence` — additionalEvidenceSubmitted AND respondable
- `isRespondable` — status in ['open', 'seller_response_pending']

### Respondable States (explicit)
- Allowed: `open`, `seller_response_pending`
- Rejected: `under_review`, `resolved`

### Audit Strategy
- Canonical record: `audit_logs` with `dispute_response_edited` / `dispute_evidence_replaced`
- Summary mirror: `transaction_events` (not the source of truth)
- Edit history: `previous_response_text` stored directly on `dispute_responses`

### Agreement Source of Truth
- `SellerTransactionAgreement.tsx` loads from `transaction_agreement_snapshots.snapshot_json` only
- No fallback to mutable transaction fields
- Seller ownership validated via `is_transaction_party`
