

# Seller Dispute Detail Page — Implementation Plan

## Problem
All CTAs on the Seller Disputes list page ("View Case", "Respond Now", "View Resolution") route to `/seller/disputes/:disputeId`, which doesn't exist — resulting in a 404.

## Solution
Build a canonical **Seller Dispute Detail** page at `/seller/disputes/:disputeId` that serves as the single destination for all dispute actions. The page contains tabbed/sectioned content for Overview, Respond, Evidence, Resolution, and Payout Impact — matching the document's recommendation of "one connected case page."

## Technical Details

### 1. Edge Function: `seller-dispute-detail`
Mirror the existing `dispute-detail` function but scoped to sellers:
- Auth + seller role check
- Fetch dispute by ID, verify linked transaction's `seller_id = userId`
- Return: dispute core, transaction summary, buyer profile, item, pricing, buyer claim (description), seller response (from `dispute_responses`), seller evidence + buyer evidence (from `dispute_evidence` + `files`), agreement snapshot, delivery proof, timeline (from `dispute_status_history`), outcome (from `dispute_outcomes`), payout impact (from `payouts` + `escrow_states`)

### 2. Service: `seller-dispute-detail.service.ts`
- Types for the detail response
- `getSellerDisputeDetail(disputeId)` function
- `submitSellerResponse(disputeId, responseText)` function (calls a new `submit-seller-response` edge function or reuses existing patterns)

### 3. Edge Function: `submit-seller-response`
- Auth + seller role check
- Verify dispute exists and transaction belongs to seller
- Insert into `dispute_responses` table
- Return success

### 4. Page: `SellerDisputeDetail.tsx`
Layout mirrors `BuyerDisputeDetail` with seller-specific additions:

- **SellerNav** with Disputes active
- **Breadcrumb**: Seller > Disputes > DSP-XXXXXXXX
- **Header**: Dispute ref, reason, status badge, money impact badge
- **Info Banner**: Context-aware messaging based on dispute status
- **Two-column layout**:
  - Left: Case summary, Buyer claim, Seller response section (with respond form if not yet responded), Agreement snapshot, Delivery proof, Evidence sections
  - Right: Timeline, Payout impact card, Support card
- **Resolution section**: Shown when dispute is resolved (outcome, amounts, decision)
- **Respond form**: Inline textarea + evidence upload when seller hasn't responded yet (not a separate route)

### 5. Components (in `src/components/seller-disputes/`)

| Component | Purpose |
|---|---|
| `SellerDisputeHeader.tsx` | Dispute ref, reason, badges, back link |
| `SellerDisputeCaseSummary.tsx` | Transaction, item, buyer, pricing summary |
| `SellerResponseForm.tsx` | Response textarea + submit (shown when not yet responded) |
| `SellerPayoutImpactCard.tsx` | Shows payout/escrow impact for this dispute |

Reuse existing shared components: `DisputeStatusBadge`, `DisputeMoneyStatusBadge`, `DisputeInfoBanner`, `DisputeTimeline`, `AgreementSnapshotSection`, `DeliveryProofSection`, `BuyerClaimSection`, `DisputeResolutionSection`, `DisputeSupportCard`

### 6. Routing
Add to `App.tsx`:
```
<Route path="/seller/disputes/:disputeId" element={<SellerDisputeDetail />} />
```

### 7. Export Fix
The Export button on the disputes list page should trigger a CSV download or open a small export modal — not navigate. Will add inline CSV export logic to `SellerDisputeFilters` or create an `ExportDisputesDialog`.

## Files Created
| File | Description |
|---|---|
| `supabase/functions/seller-dispute-detail/index.ts` | Edge function for seller dispute detail |
| `supabase/functions/submit-seller-response/index.ts` | Edge function for submitting seller response |
| `src/services/seller-dispute-detail.service.ts` | Service layer |
| `src/pages/SellerDisputeDetail.tsx` | Main detail page |
| `src/components/seller-disputes/SellerResponseForm.tsx` | Response form component |
| `src/components/seller-disputes/SellerPayoutImpactCard.tsx` | Payout impact sidebar card |

## Files Modified
| File | Change |
|---|---|
| `src/App.tsx` | Add `/seller/disputes/:disputeId` route |
| `supabase/config.toml` | Add `seller-dispute-detail` and `submit-seller-response` function configs |

