

# Phase 3 — Buyer-facing tracking & verification

## Scope

Surface the rich dispatch context (method, courier, tracking, dispatch note, dispatch evidence, handoff codes for pickup/meetup) on buyer-facing pages, and strengthen the verification CTA with a deadline countdown.

## What changes

### 1. Edge function — `transaction-detail/index.ts`
Extend the response to expose the data Phase 2 started persisting:
- Add to `delivery_tracking`: `courier_name`, `tracking_url`, `dispatch_note` (already partly returned — confirm), and `signature_name` (we use this column to carry the handoff/pickup code so the buyer can read it back).
- Add `delivery_method` from `transaction_delivery_terms` to the top-level transaction payload (or a new `delivery_terms` block mirroring the seller-side response).
- Add a new `dispatch_evidence_files[]` array — query `delivery_proof_files` filtered by `proof_type = 'dispatch_evidence'`, join `files` for `secure_url` / `mime_type` / `original_file_name`.
- Add `verification_deadline_at` derived from `delivered_at + verification_window_hours` so the countdown doesn't have to re-compute on the client.

### 2. Service — `src/services/transaction-detail.service.ts`
Mirror the new fields in the TS response interface so the page is fully typed.

### 3. New component — `src/components/transactions/InTransitBlock.tsx`
A method-aware "what's happening with my package" card, rendered when status is `seller_dispatched` or `delivered_awaiting_verification`.

Variants:
- **courier**: courier name + tracking number + clickable tracking URL + shipped timestamp + expected delivery + dispatch note.
- **pickup**: pickup-ready timestamp + pickup location (from `delivery_terms.address`) + "Show this code at pickup: XXXXXX" handoff code block.
- **meetup**: scheduled handoff timestamp + meetup location + "Share this code at handoff: XXXXXX".
- **hand_delivery**: rider/courier name + dispatch note + dispatch evidence gallery.

Includes a `<DeliveryMethodBadge>` (reusing the Phase 2 component) and a `<ProductMediaGallery variant="compact">` to render `dispatch_evidence_files` when present.

### 4. New component — `src/components/transactions/VerifyReceiptCTA.tsx`
A high-contrast CTA card shown when status is `delivered_awaiting_verification`:
- Reuses the existing `VerificationCountdown` component (already takes `deadlineAt` + `deliveredAt`).
- Two prominent buttons: **Confirm Receipt** (routes to existing `BuyerTransactionVerify`) and **Open Dispute** (routes to existing dispute flow).
- Plain-language copy explaining what each button does and the auto-release consequence.

### 5. Edited pages

**`src/pages/BuyerTransactionTracking.tsx`** — drop the new `<InTransitBlock>` above the existing timeline and the `<VerifyReceiptCTA>` at the top once delivered.

**`src/pages/BuyerTransactionDetail.tsx`** — same two components, sized for the detail layout.

## Files touched

**Edge function (edited):**
- `supabase/functions/transaction-detail/index.ts`

**Frontend (new):**
- `src/components/transactions/InTransitBlock.tsx`
- `src/components/transactions/VerifyReceiptCTA.tsx`

**Frontend (edited):**
- `src/services/transaction-detail.service.ts` — extend response interface.
- `src/pages/BuyerTransactionTracking.tsx`
- `src/pages/BuyerTransactionDetail.tsx`

## Out of scope (Phase 4)

- Locked `DeliveryTermsCard` (separate component shown on both sides).
- Completion banner reason-aware rewrite.
- Real cross-check of pickup/meetup handoff code against `delivery_tokens` table — Phase 3 just surfaces the code stored in `signature_name`; full token verification on `Mark as Delivered` is Phase 5.

