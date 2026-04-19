

# Phase 2 — Delivery-method-aware fulfillment

## Scope

Refactor seller delivery update to be **status-aware AND delivery-method-aware**, with three explicit primary actions and per-method fields.

Note from DB: `delivery_method_type` enum is `{courier, pickup, meetup, hand_delivery}` (no `rider` — `hand_delivery` covers it). `delivery_proof_type` is `{shipping_receipt, package_photo, signature_proof, shipment_video, other}` — I'll add `dispatch_evidence` as a new value rather than reuse `other`.

## What changes

### 1. Migration — `add_dispatch_evidence_proof_type.sql`
Add `dispatch_evidence` to `delivery_proof_type` enum.

### 2. Edge function — `update-delivery-status/index.ts`
Replace courier-only validation with method-aware rules:

| Action | courier | pickup | meetup | hand_delivery |
|---|---|---|---|---|
| `processing` | optional note | optional note | optional note | optional note |
| `dispatched` | tracking# **required**, courier_name recommended | pickup_ready_at required (no tracking) | scheduled_handoff_at required | rider/courier name required |
| `delivered` | evidence required, tracking required | evidence + handoff_code match | evidence + handoff_code match | evidence required |

New body fields accepted: `courier_name`, `tracking_url`, `dispatch_note`, `dispatch_evidence_file_ids[]`, `scheduled_handoff_at`, `pickup_ready_at`, `rider_name`. Persist into `delivery_tracking_details` (cols already exist for courier_name/tracking_url) and into `transaction_events.event_data` for the rest.

Dispatch evidence files (separate from delivery proof) tagged `proof_type='dispatch_evidence'` in `delivery_proof_files`.

### 3. Service — `src/services/delivery.service.ts`
Extend `updateDeliveryStatus()` payload with the new optional fields. Add a second uploader fn `uploadDispatchEvidence()` (thin wrapper around existing one, just changes context_type).

### 4. New components
- `src/components/seller/DeliveryMethodBadge.tsx` — colored pill with icon (Truck/MapPin/Users/Hand) + method label.
- `src/components/seller/FulfillmentGuidance.tsx` — collapsible "Before dispatch / After dispatch" guidance, method-aware copy.
- `src/components/seller/MissingTermsWarning.tsx` — amber banner shown when terms row is null (defense in depth).
- `src/components/seller/DispatchForm.tsx` — the heart of the change. Renders different fields per method:
  - **courier**: courier picker (GIG, DHL, Sendbox, Kwik, FedEx, UPS, Other → free text), tracking # (required), tracking URL (optional), dispatch note, dispatch evidence upload (optional).
  - **pickup**: pickup-ready timestamp, pickup location (read-only from terms), auto-generated handoff code displayed once with copy button.
  - **meetup**: scheduled handoff timestamp, meetup location (read-only), handoff code.
  - **hand_delivery**: rider/courier name (required), rider phone (optional), dispatch note, dispatch evidence upload.

### 5. `SellerUpdateDelivery.tsx` rewrite
Replace the single `<Select>` + generic "Confirm Delivery" button with:
- Top: `<DeliveryMethodBadge>` + `<MissingTermsWarning>` (conditional) + `<FulfillmentGuidance>`.
- Three explicit primary action buttons in a tab-like row: **Mark as Processing** / **Mark as Dispatched** / **Mark as Delivered**. Buttons disabled based on current `tx.status` (existing rules from `ALLOWED_FROM`).
- Selecting an action expands the relevant `<DispatchForm>` section + (for delivered) the existing evidence uploader.
- Submit button label adapts: "Mark as Processing" / "Mark as Dispatched" / "Confirm Delivery".

## Files touched

**Migration (new):**
- `supabase/migrations/<new>_add_dispatch_evidence_proof_type.sql`

**Edge function:**
- `supabase/functions/update-delivery-status/index.ts` — method-aware validation + new fields persistence.

**Frontend (new):**
- `src/components/seller/DeliveryMethodBadge.tsx`
- `src/components/seller/FulfillmentGuidance.tsx`
- `src/components/seller/MissingTermsWarning.tsx`
- `src/components/seller/DispatchForm.tsx`

**Frontend (edited):**
- `src/pages/SellerUpdateDelivery.tsx` — three-action layout, method-aware form composition.
- `src/services/delivery.service.ts` — extended payload + dispatch evidence uploader.

## Out of scope (deferred to Phase 3/4)
- Buyer-facing tracking enhancements (Phase 3).
- Locked terms card on transaction detail pages (Phase 4).
- Completion banner rewrite (Phase 4).
- Real handoff-code verification against `delivery_tokens` table — for now we generate + display a code and persist it to `delivery_tracking_details.signature_name` (existing column reused) so buyer can be shown it; full token cross-check is Phase 3 scope.

