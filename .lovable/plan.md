

# Plan: Trust-First Fulfillment & Tracking Overhaul

This is a multi-phase product/data fix. I'll structure it into 4 sequential phases so each can be validated before the next.

---

## Phase 1 — Data integrity: fix missing `transaction_delivery_terms` (P0)

**Investigate first** (read-only checks I'll run once we exit plan mode):
- `create-transaction` and `claim-offer` edge functions: verify whether they insert into `transaction_delivery_terms` and under which paths.
- `paystack-webhook` / `verify-paystack-payment`: confirm whether terms creation is tied to payment confirmation or agreement lock.
- Query `transactions` left-joined with `transaction_delivery_terms` to count how many locked transactions are missing a terms row.

**Fix (migration + edge function changes):**
1. **Backfill migration** — for every transaction that has `agreement_locked_at IS NOT NULL` but no `transaction_delivery_terms` row, bootstrap one from the locked agreement snapshot (`transactions.locked_agreement_snapshot` JSONB) using sensible defaults: method = `courier`, verification window = 72h, expected delivery = `delivered_at_estimate` from snapshot or `created_at + 7 days`.
2. **Root-cause fix** — patch whichever edge function is supposed to write the row at agreement lock so it always upserts terms. Add a PostgreSQL trigger `ensure_delivery_terms_on_lock` on `transactions` that fires when `agreement_locked_at` transitions from null → non-null and inserts a default terms row if none exists. Defense in depth: never let a locked transaction exist without terms.
3. **Repair fallback in `update-delivery-status`** — if terms are still missing at fulfillment time, auto-bootstrap from the snapshot before validation runs (so existing in-flight transactions like `SD-2026-000019` work immediately, not just new ones).

---

## Phase 2 — Delivery-method-aware fulfillment (P1)

**Replace the single "Update Delivery Status" form** in `SellerUpdateDelivery.tsx` with a status-aware, method-aware multi-step form.

**Three explicit actions** (replace generic button):
- **Mark as Processing** — only seller note + optional expected dispatch date. No tracking.
- **Mark as Dispatched** — fields shown depend on `delivery_method`:
  - `courier`: courier picker (GIG, DHL, Sendbox, Kwik, FedEx, UPS, Other), tracking number (required), tracking URL (optional), shipped-at, dispatch note, dispatch evidence upload (optional).
  - `rider` / local logistics: rider/company name (required), rider phone (optional), dispatch note, evidence upload.
  - `pickup`: pickup-ready timestamp, pickup location confirmation, pickup OTP (auto-generated, shown to seller to share with buyer).
  - `meetup` / hand delivery: scheduled handoff time, meetup location confirmation, handoff code (auto-generated).
- **Mark as Delivered** — evidence upload required (existing). For `pickup`/`meetup`, require buyer's OTP/handoff code before allowing delivered status (cross-check against `delivery_tokens` table — leverage existing `mem://features/delivery-token-system`).

**Backend changes:**
- Extend `update-delivery-status` to validate per delivery method (drop the courier-only assumption).
- Add `courier_name`, `tracking_url`, `dispatch_note` to the `delivery_tracking_details` upsert payload (fields already exist on the table).
- Add `dispatch_evidence` as a new `proof_type` enum value if not present, so dispatch-time uploads are categorized separately from delivery proof.

**Frontend (new components):**
- `src/components/seller/DispatchForm.tsx` — method-aware dispatch fields.
- `src/components/seller/DeliveryMethodBadge.tsx` — visual indicator at top of fulfillment page.
- `src/components/seller/FulfillmentGuidance.tsx` — embedded helper text ("Before dispatch: package securely, confirm courier, tracking required only for courier" / "After dispatch: buyer sees tracking, funds remain in escrow…").
- `src/components/seller/MissingTermsWarning.tsx` — banner shown if terms row is missing (defense for any not-yet-backfilled rows).

---

## Phase 3 — Buyer-facing tracking & verification (P2)

**`BuyerTransactionTracking.tsx` enhancements:**
- New "In Transit / Ready for Pickup / Handoff Scheduled" block (method-aware), showing:
  - Delivery method badge, courier name, tracking number, tracking URL (clickable), shipped timestamp, expected delivery, seller dispatch note, dispatch evidence gallery (reuse existing `ProductMediaGallery` component).
  - For pickup/meetup: location, scheduled time, instruction to provide OTP at handoff.
- Stronger "Verify Receipt" CTA card with countdown to verification deadline.

**`transaction-detail` edge function:**
- Already returns `delivery_tracking` — extend the response to include `delivery_method`, `courier_name`, `tracking_url`, `dispatch_note`, and a new `dispatch_evidence_files[]` array (filtered by `proof_type = 'dispatch_evidence'`).

---

## Phase 4 — Locked delivery terms display + completion reasoning (P3)

**Locked terms surface (both buyer & seller transaction detail pages):**
- New `DeliveryTermsCard.tsx` showing: delivery method, expected dispatch window, expected delivery date, tracking requirement rule, verification window in hours, special handoff conditions. Marked with a lock icon to convey immutability.

**Completion banner rewrite (`TransactionSuccess.tsx`):**
- Replace generic "Transaction completed successfully" with reason-aware messaging derived from `transaction_status_history`:
  - "Buyer confirmed receipt on {date} — funds released to seller"
  - "Verification window ended on {date} without dispute — funds auto-released"
  - "Dispute resolved in seller's favor on {date} — funds released"
- Show fund-release timestamp and link to receipt.

---

## Files touched (summary)

**Migrations:**
- `supabase/migrations/<new>_backfill_delivery_terms.sql` — one-time backfill.
- `supabase/migrations/<new>_ensure_delivery_terms_trigger.sql` — `ensure_delivery_terms_on_lock` trigger.
- `supabase/migrations/<new>_add_dispatch_evidence_proof_type.sql` — extend `delivery_proof_type` enum.

**Edge functions:**
- `supabase/functions/update-delivery-status/index.ts` — method-aware validation + missing-terms repair fallback.
- `supabase/functions/create-transaction/index.ts` — guarantee terms insert at agreement lock.
- `supabase/functions/claim-offer/index.ts` — same.
- `supabase/functions/transaction-detail/index.ts` — expose tracking method, courier, dispatch evidence.
- `supabase/functions/transaction-agreement/index.ts` — return terms row for the locked terms card.

**Frontend (new):**
- `src/components/seller/DispatchForm.tsx`, `DeliveryMethodBadge.tsx`, `FulfillmentGuidance.tsx`, `MissingTermsWarning.tsx`
- `src/components/transactions/DeliveryTermsCard.tsx`

**Frontend (edited):**
- `src/pages/SellerUpdateDelivery.tsx` — three explicit actions + method-aware form.
- `src/pages/SellerTransactionDetail.tsx` — terms card + guidance.
- `src/pages/BuyerTransactionDetail.tsx` — terms card + tracking block.
- `src/pages/BuyerTransactionTracking.tsx` — enriched in-transit block + dispatch evidence.
- `src/components/seller/TransactionSuccess.tsx` — reason-aware completion.
- `src/services/delivery.service.ts` — extend payload (courier_name, tracking_url, dispatch_note, dispatch evidence file_ids).

---

## Recommended execution order

I'll suggest doing **Phase 1 first as a standalone change**, since it unblocks `SD-2026-000019` immediately and is pure data/integrity work with low UI risk. Then Phases 2–4 can be implemented as a single follow-up batch (they're tightly coupled UI/backend changes).

## Out of scope (for now)

- Real-time courier API integrations (DHL/GIG webhook tracking) — manual tracking-number entry only.
- SMS/WhatsApp delivery notifications to riders — in-app + email only.
- Buyer-initiated rescheduling of meetup/pickup — phase 5 if needed.

