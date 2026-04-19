

# Phase 5 — Pickup/Meetup Handoff Code Verification

## Scope

Currently for `pickup` and `meetup` deliveries, Phase 2 generates a 6-digit handoff code, stores it in `delivery_tracking_details.signature_name`, and Phase 3 surfaces it to the buyer. **But the seller can still mark the transaction as delivered without actually verifying the buyer received the goods.** Phase 5 closes that loop: when a seller marks a pickup/meetup transaction as `delivered`, they must enter the code the buyer showed them, and we cross-check it server-side.

## Approach

Reuse `signature_name` as the source of truth (already populated at dispatch time). No new tables — the existing `delivery_tokens` table is more complex than needed for this in-person handoff flow and is reserved for the rider OTP flow per the memory note.

## What changes

### 1. Edge function — `update-delivery-status/index.ts`

For the `delivered` action, when delivery method is `pickup` or `meetup`:
- Require new body field `handoff_code_input` (6 chars).
- Load `signature_name` from `delivery_tracking_details` for this transaction.
- If null → 400 "No handoff code on file. Re-issue the code via Mark as Dispatched."
- Compare case-insensitively, trimmed. Mismatch → 400 "Handoff code does not match."
- On match → proceed with existing delivered transition. Append a `transaction_event` of type `handoff_code_verified` with `event_data: { method, verified_at }`.

For `courier` and `hand_delivery` → no change, behaves as today.

### 2. Service — `src/services/delivery.service.ts`

Add `handoff_code_input?: string` to the `UpdateDeliveryStatusPayload` type.

### 3. Component edits — `src/components/seller/DispatchForm.tsx`

When `action === "delivered"` and method is `pickup` or `meetup`:
- Render a single 6-digit `<InputOTP>` field labeled "Enter the code the buyer showed you".
- Helper text: "Ask the buyer to read out the 6-digit code from their order page. This proves they received the item."
- Required, 6 chars.

For `courier` / `hand_delivery` `delivered` action → keep existing evidence uploader UI unchanged.

### 4. Page wiring — `src/pages/SellerUpdateDelivery.tsx`

- Add local state `handoffCodeInput` and pass into `<DispatchForm>`.
- Validate before calling `updateDeliveryStatus` (length 6, alphanumeric).
- Pass `handoff_code_input` in the payload when applicable.
- Surface server-side mismatch error via existing toast pattern.

### 5. Buyer-side reassurance — `src/components/transactions/InTransitBlock.tsx`

Minor copy add for pickup/meetup variants: "The seller will ask for this code at handoff. Don't share it before you have the item in hand."

## Files touched

**Edge function (edited):**
- `supabase/functions/update-delivery-status/index.ts`

**Frontend (edited):**
- `src/services/delivery.service.ts`
- `src/components/seller/DispatchForm.tsx`
- `src/pages/SellerUpdateDelivery.tsx`
- `src/components/transactions/InTransitBlock.tsx`

## Out of scope

- Multi-attempt rate limiting on code entry (deferred — current design just rejects per request).
- Rotating the code if the seller fails N times (deferred).
- Full migration to the `delivery_tokens` table for in-person handoffs (deferred — that table is reserved for rider/courier OTPs).
- SMS/email of the handoff code to the buyer (in-app only for now).

