

# Final Seller Dispute Workflow Refinement Plan

## Summary
Address 6 remaining precision issues: dispute-centric event logging, deterministic evidence replacement, clearer permission naming, explicit agreement source-of-truth, structured edit history, and named respondable states.

## Database Migration

```sql
-- 1. Fix unique constraint for max-2 responses
ALTER TABLE dispute_responses DROP CONSTRAINT uq_dispute_responses_dispute;
ALTER TABLE dispute_responses ADD CONSTRAINT uq_dispute_response_number UNIQUE (dispute_id, response_number);

-- 2. Add edit tracking columns to dispute_responses
ALTER TABLE dispute_responses ADD COLUMN edited_at timestamptz DEFAULT NULL;
ALTER TABLE dispute_responses ADD COLUMN edited_by_user_id uuid DEFAULT NULL;
ALTER TABLE dispute_responses ADD COLUMN previous_response_text text DEFAULT NULL;

-- 3. Add dedicated evidence type for dispute-phase additional evidence
ALTER TYPE dispute_evidence_type ADD VALUE 'seller_additional_dispute_evidence';

-- 4. Add replacement tracking columns to dispute_evidence
ALTER TABLE dispute_evidence ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE dispute_evidence ADD COLUMN replaced_at timestamptz DEFAULT NULL;
ALTER TABLE dispute_evidence ADD COLUMN replaced_by_file_id uuid DEFAULT NULL;
```

**Key decisions:**
- `previous_response_text` on `dispute_responses` stores the old text directly — no ambiguity about where edit history lives
- `is_active` + `replaced_at` + `replaced_by_file_id` on `dispute_evidence` provides a deterministic replacement trail — old evidence is never deleted, just deactivated
- New enum value `seller_additional_dispute_evidence` replaces timestamp-based inference

## Edge Function: `submit-seller-response` — Changes

### New action: `edit_response`
- Accepts `action: "edit_response"`, `response_id`, `new_response_text`
- Validates: dispute is in `open` or `seller_response_pending` (the only respondable states)
- Only the **latest** response (highest `response_number`) is editable
- Before update: stores current `response_text` into `previous_response_text`, sets `edited_at = now()`, `edited_by_user_id = userId`
- Logs to **`audit_logs`** with `action: "dispute_response_edited"`, metadata includes `{ dispute_id, response_id, old_text, new_text }`
- Logs to `transaction_events` with `event_type: "seller_response_edited"` only as a summary mirror (the audit_log is the canonical record)
- Does NOT trigger status change or buyer notification for edits

### New action: `replace_additional_evidence`
- Accepts `action: "replace_additional_evidence"`, `old_evidence_id`, `new_file_id`
- Validates dispute is in `open` or `seller_response_pending`
- Finds existing active evidence row by `old_evidence_id`, verifies `evidence_type = 'seller_additional_dispute_evidence'` and `is_active = true`
- Updates old row: `is_active = false`, `replaced_at = now()`, `replaced_by_file_id = new_file_id`
- Inserts new evidence row with `evidence_type = 'seller_additional_dispute_evidence'`, `is_active = true`
- Logs to `audit_logs` with `action: "dispute_evidence_replaced"`, metadata includes `{ old_file_id, new_file_id, old_evidence_id }`

### Additional evidence insert
- Change `evidence_type` from `"supporting_document"` to `"seller_additional_dispute_evidence"` for the additional evidence flow

### Respondable states — explicit definition
All actions (response submit, follow-up, edit, additional evidence, evidence replacement) require dispute status to be one of:
- `open`
- `seller_response_pending`

Explicitly rejected:
- `under_review`
- `resolved`

This is already enforced in the current code but will be documented as constants.

## Edge Function: `seller-dispute-detail` — Changes

### Permission flags (renamed for clarity)
Replace `canRespond` with explicit, non-overlapping flags:

```typescript
permissions: {
  canSubmitInitialResponse: boolean,   // responseCount === 0 AND respondable
  canAddFollowUpResponse: boolean,     // responseCount === 1 AND respondable
  canEditLatestResponse: boolean,      // responseCount > 0 AND respondable
  canUploadAdditionalEvidence: boolean, // !additionalEvidenceSubmitted AND respondable
  canReplaceAdditionalEvidence: boolean, // additionalEvidenceSubmitted AND respondable
  respondableStatuses: ["open", "seller_response_pending"], // reference
  isRespondable: boolean,              // dispute.status in respondableStatuses
}
```

No `canRespond` — eliminated to avoid overlap confusion.

### Additional evidence detection
Change from timestamp-based inference to checking `evidence_type = 'seller_additional_dispute_evidence'` AND `is_active = true`.

### Edit history on responses
Include `edited_at`, `edited_by_user_id`, `previous_response_text` in each response object returned.

## Seller Agreement Page — Source of Truth (explicit confirmation)

`SellerTransactionAgreement.tsx` and the `transaction-agreement` edge function:
1. **Validates seller ownership** — the edge function checks `is_transaction_party` which includes seller_id
2. **Loads from `transaction_agreement_snapshots.snapshot_json`** — the immutable locked snapshot created at payment time
3. **No fallback to mutable transaction fields** — if no snapshot exists, the page shows "Agreement not yet locked" rather than displaying live mutable data
4. This is already correctly implemented in the existing `transaction-agreement` edge function; no code change needed, just documenting the guarantee

## Service Layer: `seller-dispute-detail.service.ts`

- Add `editSellerResponse(disputeId, responseId, newText)` function
- Add `replaceAdditionalEvidence(disputeId, oldEvidenceId, newFileId)` function
- Update `SellerDisputeDetailResponse` types: add `permissions` with new names, add `edited_at`/`previous_response_text` to response entries

## UI Components

### `SellerDisputeResponseSection.tsx`
- "Edit Response" button on latest response when `canEditLatestResponse` is true
- Inline edit mode with prefilled textarea
- Show "Edited on [date]" badge when `edited_at` is present
- Response 1 shows no edit button once response 2 exists

### `SellerEvidenceSection.tsx`
- "Replace" button on additional evidence when `canReplaceAdditionalEvidence` is true
- Uses `seller_additional_dispute_evidence` type tag instead of generic "supporting_document"

### `SellerDisputeContextBanner.tsx`
- Drive banners from `permissions.isRespondable` flag instead of string matching

### `SellerDisputeDetail.tsx`
- Pass `permissions` object to child components

## Files Modified

| File | Change |
|---|---|
| `supabase/functions/submit-seller-response/index.ts` | Add `edit_response` + `replace_additional_evidence` actions, use new evidence type |
| `supabase/functions/seller-dispute-detail/index.ts` | Renamed permission flags, new evidence type detection, edit fields in responses |
| `src/services/seller-dispute-detail.service.ts` | New functions + updated types |
| `src/components/seller-disputes/SellerDisputeResponseSection.tsx` | Inline edit mode |
| `src/components/seller-disputes/SellerEvidenceSection.tsx` | Replace CTA |
| `src/components/seller-disputes/SellerDisputeContextBanner.tsx` | Permission-driven banners |
| `src/pages/SellerDisputeDetail.tsx` | Pass permissions to children |

## Database Migration (single SQL)
```sql
ALTER TABLE dispute_responses DROP CONSTRAINT uq_dispute_responses_dispute;
ALTER TABLE dispute_responses ADD CONSTRAINT uq_dispute_response_number UNIQUE (dispute_id, response_number);
ALTER TABLE dispute_responses ADD COLUMN edited_at timestamptz DEFAULT NULL;
ALTER TABLE dispute_responses ADD COLUMN edited_by_user_id uuid DEFAULT NULL;
ALTER TABLE dispute_responses ADD COLUMN previous_response_text text DEFAULT NULL;
ALTER TYPE dispute_evidence_type ADD VALUE 'seller_additional_dispute_evidence';
ALTER TABLE dispute_evidence ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE dispute_evidence ADD COLUMN replaced_at timestamptz DEFAULT NULL;
ALTER TABLE dispute_evidence ADD COLUMN replaced_by_file_id uuid DEFAULT NULL;
```

