

# Seller Dispute Detail Refinement Plan

## Summary
Refine the seller dispute detail page to properly separate buyer/seller roles, support multi-response workflow (max 2), additional evidence upload (max 1), and add a "View Full Agreement" CTA linking to a seller-side agreement page.

## Technical Details

### 1. Database Migration — Add `response_number` column to `dispute_responses`
- Add `response_number INTEGER NOT NULL DEFAULT 1` to `dispute_responses`
- This supports tracking "Response 1 of 2" vs "Response 2 of 2"
- No unique constraint needed — the edge function enforces the max-2 limit

### 2. Edge Function: `submit-seller-response` — Support multiple responses
Current logic rejects if any response exists. Change to:
- Count existing seller responses for this dispute (max 2)
- If count >= 2, reject with "Maximum response limit reached"
- Set `response_number = count + 1` on insert
- Only transition status to `under_review` on first response (don't re-transition on follow-up)
- Accept `is_additional_evidence_only: boolean` flag for standalone evidence uploads (no response text required)
- For additional evidence: enforce max 1 additional dispute evidence file (evidence_type = `supporting_document`, check existing count)

### 3. Edge Function: `seller-dispute-detail` — Return enriched response data
Current logic fetches only a single `dispute_responses` row. Change to:
- Fetch all responses for the dispute (`dispute_responses` plural), ordered by `submitted_at`
- Return `seller_response.responses: Array<{id, response_text, submitted_at, response_number}>` 
- Return `seller_response.response_count: number` and `seller_response.max_responses: 2`
- Return `seller_response.additional_evidence_submitted: boolean` — check if any `dispute_evidence` with `submitted_by_role = 'seller'` and `evidence_type = 'supporting_document'` exists that was created after the dispute `opened_at`
- Keep backward compat: `has_response` = responses.length > 0, `response_state` derived from count

### 4. Service Layer: `seller-dispute-detail.service.ts` — Update types
- Update `SellerDisputeDetailResponse.seller_response` to include `responses[]`, `response_count`, `max_responses`, `additional_evidence_submitted`
- Add `submitAdditionalEvidence(disputeId, fileId)` function

### 5. Page: `SellerDisputeDetail.tsx` — Major UI restructure

**Buyer Claim section**: Replace `BuyerClaimSection` (which shows "Your Evidence" + "Claimant" tag — buyer-centric) with a new seller-specific `SellerViewBuyerClaim` component:
- Header: "Buyer Claim & Evidence" with "Claimant" badge
- Shows buyer's reason, description, and evidence

**Seller Response section**: Replace the current binary show-form-or-show-response with a new `SellerDisputeResponseSection` component:
- Shows all submitted responses with "Response 1 of 2", "Response 2 of 2" labels
- If response_count < 2 and dispute is respondable: show "Add Follow-up Response" CTA
- If response_count == 0 and dispute is respondable: show the response form inline
- If response_count >= 2: show "Maximum response limit reached" info note
- If dispute is under_review or resolved: show "Responses locked" note

**Seller Evidence section**: New `SellerEvidenceSection` component:
- Groups evidence into categories: "Delivery Proof", "Seller Evidence", "Additional Evidence"
- Each file shows: file type icon, uploaded date, evidence type tag, preview/open action
- If `additional_evidence_submitted` is false and dispute is active: show "Upload Additional Evidence" CTA
- If already submitted: show "Additional dispute evidence already submitted" note

**Agreement section**: Keep `AgreementSnapshotSection` but add a "View Full Agreement" button that links to `/seller/transactions/:transactionId/agreement`

### 6. New Route + Page: `/seller/transactions/:transactionId/agreement`
- Create `SellerTransactionAgreement.tsx` — mirrors `BuyerTransactionAgreement` but uses `SellerNav`
- Reuses `getAgreementData` service (the edge function already validates transaction party access)
- Shows full locked agreement: item details, amounts, parties, delivery terms, seller notes, media
- Add route to `App.tsx`

### 7. New Components

| Component | Purpose |
|---|---|
| `src/components/seller-disputes/SellerViewBuyerClaim.tsx` | Buyer claim + evidence from seller's perspective |
| `src/components/seller-disputes/SellerDisputeResponseSection.tsx` | Multi-response viewer with form + counters |
| `src/components/seller-disputes/SellerEvidenceSection.tsx` | Categorized evidence gallery with upload CTA |
| `src/pages/SellerTransactionAgreement.tsx` | Full agreement page for seller |

### 8. `SellerResponseForm.tsx` — Update
- Accept optional `responseNumber` prop for labeling
- Accept optional `isFollowUp` flag to adjust UI copy
- On success, pass response number to parent for refetch

### 9. Contextual Banners — Update `SellerDisputeContextBanner.tsx`
Add state-awareness text for response/evidence permissions:
- Open: "You can still respond to this case"
- Under review: "New responses are disabled"
- Resolved: "Responses and evidence uploads are now locked"

### 10. Timeline — Add new event types
The edge function already captures `seller_dispute_response` events. Add labels for:
- `seller_response_edited` → "Seller Response Edited"
- `additional_evidence_uploaded` → "Additional Evidence Uploaded"

## Files Created
| File | Description |
|---|---|
| `src/components/seller-disputes/SellerViewBuyerClaim.tsx` | Buyer claim from seller POV |
| `src/components/seller-disputes/SellerDisputeResponseSection.tsx` | Multi-response section |
| `src/components/seller-disputes/SellerEvidenceSection.tsx` | Categorized evidence gallery |
| `src/pages/SellerTransactionAgreement.tsx` | Full agreement page for seller |

## Files Modified
| File | Change |
|---|---|
| `supabase/functions/submit-seller-response/index.ts` | Support max 2 responses + additional evidence |
| `supabase/functions/seller-dispute-detail/index.ts` | Return multiple responses + evidence flags |
| `src/services/seller-dispute-detail.service.ts` | Updated types + new function |
| `src/pages/SellerDisputeDetail.tsx` | Restructured sections, new components |
| `src/components/seller-disputes/SellerResponseForm.tsx` | Follow-up support |
| `src/components/seller-disputes/SellerDisputeContextBanner.tsx` | State-aware permission text |
| `src/App.tsx` | Add seller agreement route |

## Database Migration
```sql
ALTER TABLE dispute_responses ADD COLUMN response_number INTEGER NOT NULL DEFAULT 1;
```

