

# Make Seller Update Delivery Page Fully Functional

## Overview

Wire the currently static delivery update page to a new edge function that transitions the transaction state machine, uploads evidence via Cloudinary, and notifies the buyer. Validation is delivery-method-aware.

## 1. New Edge Function: `update-delivery-status`

**File:** `supabase/functions/update-delivery-status/index.ts`

Accepts `{ transaction_id, action, tracking_number, delivery_notes, file_ids }` where action is `"processing"` | `"dispatched"` | `"delivered"`.

**Steps:**
1. Verify JWT, verify seller owns transaction
2. Fetch `transaction_delivery_terms` for `delivery_method` and `verification_window_hours`
3. Validate transition in code (not just relying on DB trigger):
   - `processing` → allowed from `payment_secured` or `seller_preparing_delivery`
   - `dispatched` → allowed from `payment_secured` or `seller_preparing_delivery`
   - `delivered` → allowed from `seller_dispatched` (or `seller_preparing_delivery` for pickup/meetup/hand_delivery)
4. Validate action-specific requirements:
   - **processing**: no tracking or evidence required
   - **dispatched**: tracking required only if `delivery_method = courier`
   - **delivered**: at least 1 evidence file required; tracking required only for courier
5. Map UI action to DB enum: `processing` → `seller_preparing_delivery`, `dispatched` → `seller_dispatched`, `delivered` → `delivered_awaiting_verification`
6. Update `transactions.status` (DB trigger is safety net)
7. **Do NOT change `money_status`** — it stays `funds_held_in_escrow`
8. Upsert `delivery_tracking_details` (tracking_number, shipped_at for dispatched, delivered_at for delivered)
9. Insert into `delivery_updates` (status, notes, updated_by_user_id)
10. Insert into `delivery_proof_files` for each file_id (with ownership validation: file exists + belongs to seller)
11. Insert into `transaction_status_history`
12. Insert into `transaction_events` with appropriate event_type:
    - `processing` → `seller_preparing_delivery`
    - `dispatched` → `seller_dispatched`
    - `delivered` → `delivered`
13. If action is `delivered`:
    - Set `transactions.delivered_at = now()`
    - Set `transactions.verification_deadline_at = now() + verification_window_hours`
    - Upsert `delivery_confirmations` with `seller_marked_delivered_at = now()`
14. Create buyer notification:
    - `dispatched` → "Your item has been dispatched"
    - `delivered` → "Your item has been marked as delivered — please verify within X hours"
15. Return updated transaction summary

**Config:** Add `[functions.update-delivery-status] verify_jwt = false` to `supabase/config.toml`

## 2. New Service: `src/services/delivery.service.ts`

Two functions:

**`uploadDeliveryEvidence(file, onProgress)`** — reuses the exact same pattern from `uploadProductFile` in `create-transaction.service.ts`:
- `computeFileHash` + `validateMagicBytes` 
- Call `upload-evidence` with `action: "sign_upload"`, context `"delivery_proof"`
- XHR upload to Cloudinary with `onProgress`
- Call `upload-evidence` with `action: "register_file"`, context_type `"delivery_proof"`
- Returns `{ file_id, secure_url, original_name, mime_type, fingerprint }`

**`updateDeliveryStatus(transactionId, action, trackingNumber, notes, fileIds)`** — calls the new edge function.

## 3. Rewrite `src/pages/SellerUpdateDelivery.tsx`

**State additions:**
- `uploadedFiles: { file_id, secure_url, name, type, fingerprint }[]`
- `uploadProgress: Record<string, number>`
- `isSubmitting: boolean`
- `deliveryMethod` derived from `data.transaction.delivery_method`

**Validation logic (dynamic):**
- Submit button disabled until:
  - `orderStatus` is selected
  - If `orderStatus === "dispatched"` and `deliveryMethod === "courier"` → tracking required
  - If `orderStatus === "delivered"` → at least 1 file uploaded; tracking required only for courier

**Upload section (replaces dead upload zone + 5-category grid):**
- Simple "Upload Evidence" area: accepts images + videos
- Max **3 files total** (images + videos combined)
- Photo max 10MB, video max 50MB
- Shows progress bars during upload, thumbnails after, remove button
- File input accepts `image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm`

**Submit handler:**
- Calls `updateDeliveryStatus()` from delivery service
- On success: toast, invalidate `seller-transaction-detail` query, navigate back
- On error: error toast

**Conditional UI hints:**
- Show "Tracking number required for courier delivery" hint when dispatched + courier
- Show "At least one evidence file required" hint when delivered

## 4. Update `upload-evidence` Edge Function

Add `"delivery_proof"` as a valid context in both `signUpload` (folder path) and `registerFile` (context_type mapping). The `context_type` enum already has `"delivery_proof"` as a possible value based on `file_retention_category`.

## Files Summary

| File | Action |
|------|--------|
| `supabase/functions/update-delivery-status/index.ts` | New — full delivery state machine handler |
| `supabase/config.toml` | Add `verify_jwt = false` for new function |
| `src/services/delivery.service.ts` | New — upload + status update service |
| `src/pages/SellerUpdateDelivery.tsx` | Rewrite — wire uploads, validation, submission |
| `supabase/functions/upload-evidence/index.ts` | Add `delivery_proof` context support |

