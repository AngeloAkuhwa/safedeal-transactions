

# Revised Seller Dispute Detail + List Page — Implementation Plan

## Summary
Overhaul the existing Seller Dispute Detail page and `submit-seller-response` edge function, plus fix the list page's Export button and action routing. The current implementation is a shallow mirror of the buyer page — this revision makes it seller-first with section navigation, evidence uploads in the response flow, comprehensive payout impact, enriched timeline, contextual banners, and a robust response submission pipeline.

## What Changes

### 1. Page: `SellerDisputeDetail.tsx` — Section-Based Layout with Query Param Focus

Read `?section=` from URL to auto-scroll/highlight the active section. CTAs from the list page route as:
- `View Case` → `?section=overview`
- `Respond Now` → `?section=respond`
- `View Resolution` → `?section=resolution`
- Payout CTA → `?section=payout`

Sections rendered top-to-bottom (not tabs — full scrollable page with anchor IDs):

| # | Section ID | Content |
|---|---|---|
| 1 | `overview` | Case summary: dispute ref, reason, status + money badges, buyer info, item, pricing, transaction link, response deadline |
| 2 | `banner` | Contextual state banner (response needed / under review / resolved / payout blocked) |
| 3 | `claim` | Buyer claim + buyer evidence (prominent, full-width) |
| 4 | `respond` | Seller response form with textarea + evidence upload (up to 3 files). Shows submitted response if already responded |
| 5 | `agreement` | Locked Agreement Snapshot — first-class, not collapsed |
| 6 | `delivery` | Delivery Proof — tracking details + proof files, first-class |
| 7 | `evidence` | Combined evidence gallery: buyer vs seller side-by-side |
| 8 | `resolution` | Final outcome, amounts (refund/release), payout effect, resolver — only when resolved |
| 9 | `payout` | Payout Impact: blocked/not, amount, reason, escrow state, payout record existence, partial release possibility |
| 10 | `timeline` | Enriched timeline with case events (not just status changes) |
| 11 | `support` | Support card |

Right sidebar (desktop): Payout Impact card, Timeline, Support card (duplicated from main flow for quick access).

Seller-specific emphasis throughout:
- Response deadline shown prominently in header with countdown
- "Next action" callout if response is pending
- Delivery proof elevated above evidence gallery
- Payout blockage warning integrated into overview

### 2. Contextual Banners — New Component: `SellerDisputeContextBanner.tsx`

Replaces the generic `DisputeInfoBanner` with seller-specific messaging:

| State | Banner |
|---|---|
| `open` / `seller_response_pending` | "Your response is required. Submit your side of the case with supporting evidence before the deadline." (warning style) |
| `under_review` | "This case is under review. Both your evidence and the buyer's claim are being evaluated." (info style) |
| `resolved` | "This dispute has been resolved. Review the final decision and payout impact below." (success style) |
| Payout blocked (`escrow.frozen_amount > 0`) | "Your payout for this transaction is currently blocked while this dispute is active." (destructive style) |

Multiple banners can show simultaneously (e.g., response needed + payout blocked).

### 3. Edge Function: `submit-seller-response` — Full Pipeline

Current implementation only inserts a row + updates status. Revised to handle:

1. **Auth + seller role check** (already done)
2. **Dispute ownership validation** (already done)
3. **Dispute respondable validation**: reject if status not in `['open', 'seller_response_pending']`, reject if already responded
4. **Evidence attachment**: accept `evidence_file_ids: string[]` (max 3), validate each file exists in `files` table and belongs to seller, insert into `dispute_evidence` with `submitted_by_role = 'seller'`
5. **Status transition**: update dispute to `under_review`
6. **Dispute status history**: insert into `dispute_status_history`
7. **Transaction event logging**: insert into `transaction_events` with `event_type = 'seller_dispute_response'`
8. **Audit logging**: insert into `audit_logs` with action, actor, dispute_id, transaction_id
9. **Notification trigger**: insert notification for buyer ("Seller has responded to your dispute")

### 4. `SellerResponseForm.tsx` — Evidence Upload Support

Add file upload UI alongside the textarea:
- Up to 3 evidence files (images/videos)
- Uses existing Cloudinary upload pattern (sign via `upload-evidence` edge function, XHR upload, save file record)
- Files are uploaded first, file IDs collected, then submitted with response text via `submit-seller-response`
- Preview thumbnails with remove capability
- Character counter + file counter

### 5. `SellerPayoutImpactCard.tsx` — Enhanced

Add missing fields:
- Whether payout is blocked (explicit boolean/label)
- Blocked amount with currency
- Reason for block (dispute status text)
- Whether payout record exists vs. no payout created yet
- Whether partial release is possible (based on escrow state + outcome_type)
- Link to `/seller/payouts` if payout exists

### 6. Edge Function: `seller-dispute-detail` — Enriched Timeline

Currently returns only `dispute_status_history`. Add:
- `transaction_events` for the same transaction (filtered to dispute-relevant events: `dispute_opened`, `seller_dispute_response`, `evidence_uploaded`, `dispute_resolved`, `payout_blocked`, `payout_released`)
- Merge and sort chronologically
- Return as unified `timeline[]` with `{ type: 'status_change' | 'event', ... }`

### 7. `DisputeTimeline` — Support Event Entries

Update to render both status changes and event entries with appropriate icons and labels.

### 8. Resolution Section — Seller-Specific Enhancement

When resolution exists, show:
- Outcome type + badge
- Decision summary
- Refund amount (to buyer)
- Release amount (to seller) — emphasized for seller
- Payout effect: "Your payout will be released" / "Funds refunded to buyer" / "Partial release"
- Resolved date + resolver

### 9. List Page: Export Button Fix

`SellerDisputeFilters.tsx` — wire Export button to trigger CSV download (not navigation):
- Build CSV from current `data.items` array
- Columns: Dispute ID, Transaction Code, Buyer, Item, Reason, Status, Money Impact, Response Deadline, Opened Date, Last Updated, Resolution Summary
- Download as `disputes-export-{date}.csv`

### 10. List Page: Action Routing with Section Params

Update `SellerDisputeTable.tsx` and `SellerDisputeActionPanel.tsx` action routes:
- `Respond Now` → `/seller/disputes/{id}?section=respond`
- `View Case` → `/seller/disputes/{id}?section=overview`
- `View Resolution` → `/seller/disputes/{id}?section=resolution`
- Blocked payout cards → `/seller/disputes/{id}?section=payout`

### 11. Related Routing

- Transaction code in detail page → `/seller/transactions/:transactionId`
- Payout link in impact card → `/seller/payouts` (with payout ID if route supports it)

## Files Modified

| File | Change |
|---|---|
| `src/pages/SellerDisputeDetail.tsx` | Full rewrite: section-based layout, query param focus, contextual banners, enhanced structure |
| `supabase/functions/submit-seller-response/index.ts` | Add evidence attachment, event logging, audit logging, notification, respondable validation |
| `supabase/functions/seller-dispute-detail/index.ts` | Add transaction_events to timeline, merge + sort |
| `src/components/seller-disputes/SellerResponseForm.tsx` | Add evidence file upload UI (Cloudinary pattern) |
| `src/components/seller-disputes/SellerPayoutImpactCard.tsx` | Add blocked reason, payout existence, partial release, payout link |
| `src/components/seller-disputes/SellerDisputeFilters.tsx` | Wire Export to CSV download |
| `src/components/seller-disputes/SellerDisputeTable.tsx` | Update action routes with `?section=` params |
| `src/components/seller-disputes/SellerDisputeActionPanel.tsx` | Update CTA routes with `?section=` params |
| `src/components/seller-disputes/SellerDisputeBlockedPanel.tsx` | Update CTA routes with `?section=payout` |
| `src/services/seller-dispute-detail.service.ts` | Update types for enriched timeline, update submitSellerResponse to accept evidence_file_ids |

## Files Created

| File | Description |
|---|---|
| `src/components/seller-disputes/SellerDisputeContextBanner.tsx` | Contextual state banners (response needed, under review, resolved, payout blocked) |

