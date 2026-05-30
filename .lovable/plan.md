## Goal

Correct the fee naming, breakdown, and reconciliation on Admin Transaction Detail and Admin Dispute Detail. Always cap Protection Fee at ₦2,500. Remove Delivery Fee from SafeDeal's admin fee reconciliation. Separate Protection Fee from Payment Processing Fee everywhere.

No payout screen, no Paystack transfer, no other redesign.

---

## 1. Pricing — enforce ₦2,500 cap on Protection Fee (display only)

The existing pricing calculator (`src/lib/pricing.ts` + `supabase/functions/_shared/pricing.ts`) already caps `service_fee_amount` at ₦2,500 — but legacy `transaction_pricing.platform_fee_amount` rows (e.g. SD-2026-000003 = ₦16,250) bypass this. We will enforce the cap at read-time without altering DB rows or fee calculator logic.

**Edit `supabase/functions/admin-transaction-detail/index.ts` (`pricingOut` block):**

- After reading `pricing.platform_fee_amount` and `pricing.processing_fee_amount` (Paystack/provider fee), compute:
  ```ts
  const MAX_PROTECTION_FEE = 2500;
  const rawProtection = num(pricing.platform_fee_amount);
  const processingFee = num(pricing.processing_fee_amount);
  const protectionFee = Math.min(rawProtection, MAX_PROTECTION_FEE);
  const itemTotal = num(pricing.item_amount);
  const totalCharged = itemTotal + protectionFee + processingFee;
  const sellerNet = Math.max(itemTotal - protectionFee, 0); // payment processing fee is buyer-borne
  ```
- Replace existing `pricingOut` shape with:
  ```ts
  {
    currency, itemTotal,
    protectionFee,           // capped
    protectionFeeRaw: rawProtection, // for audit tooltip
    protectionFeeCapped: rawProtection > MAX_PROTECTION_FEE,
    paymentProcessingFee: processingFee,
    totalCharged,            // = item + protection + processing
    buyerTotal: totalCharged, // back-compat alias (deprecate in UI)
    sellerNet, sellerPayoutAmount: sellerNet,
    refundedTotal,
  }
  ```
- Ensure `processing_fee_amount` is selected from `transaction_pricing` (already is) and from the Paystack `payments` row as fallback when null. Never merge it into protection fee.

**Edit `src/services/admin-transaction-detail.service.ts`:** widen `pricing` type with the new fields (`paymentProcessingFee`, `totalCharged`, `sellerPayoutAmount`, `protectionFeeCapped`, `protectionFeeRaw`).

**Do not** modify `src/lib/pricing.ts` / `_shared/pricing.ts` — they already enforce the cap correctly for new transactions.

---

## 2. Admin Transaction Detail — header KPI strip

**File:** `src/pages/AdminTransactionDetail.tsx` (lines 795–833)

Replace the 6-tile grid (`Transaction Status · Money Status · Item Total · Protection Fee · Total Charged · Awaiting Release`) with **two rows**:

Row 1 — buyer-side reconciliation:
1. Transaction Status
2. Money Status
3. Item Total → `pricing.itemTotal`
4. Protection Fee → `pricing.protectionFee` (capped) — tooltip "SafeDeal protection/platform fee". If `protectionFeeCapped`, show small `(capped @ ₦2,500)` hint.
5. Payment Processing Fee → `pricing.paymentProcessingFee` — tooltip "Payment vendor fee from Paystack, Flutterwave, or the active payment provider"
6. Total Charged → `pricing.totalCharged` — tooltip "Item Total + Protection Fee + Payment Processing Fee"

Row 2 — seller-side payout (rendered only when `moneyStatus ∈ {funds_held_in_escrow, funds_pending_release, funds_releasing, funds_released}`):
- Single tile: `escrowDisplay.label` ("Awaiting Release" / "Released to Seller" / "Held in Escrow") → `pricing.sellerPayoutAmount` — subtitle "Seller-side amount after applicable deductions".

Remove Delivery Fee tile entirely. Remove the "(item total)" subtitle and replace with the wording above.

---

## 3. Admin Transaction Detail — supplementary sections

**Lines 1463–1485 ("Pricing & Fees" + "Delivery extras"):**

Pricing & Fees grid replace with exactly:
- Item Total → `itemTotal`
- Protection Fee → `protectionFee` (with `(capped)` chip if applicable)
- Payment Processing Fee → `paymentProcessingFee`
- Total Charged → `totalCharged` (bold)
- Seller Net → `sellerPayoutAmount`
- Refunded → `refundedTotal`

Keep the existing "Delivery extras" block (method, address, deliveredAt) but it must not include any monetary amount — drop any `deliveryFee` / `shippingFee` rendering. (Spot-check this section is purely logistical, no money rows.)

**Line 1265 ("Fee Deducted" in Escrow Ledger):** keep showing `-{protectionFee}` (capped value) — accurate now.

**Line 1189 (Locked Agreement Terms):** keep "Protection Fee" wording; do not add Processing Fee here (locked snapshot is historical).

---

## 4. Admin Dispute Detail — financial overview

**File:** `src/pages/AdminDisputeDetail.tsx` (around lines 597–630)

Keep the existing two-row `FinMetric` layout. Only correct the values and labels:

Top row (4 tiles): Total Transaction · Amount in Dispute · Protection Fee · Funds Status
- `Total Transaction` → `pricing.totalCharged` (was `buyerTotal`). Hover tooltip: `Item ₦X + Protection ₦Y + Payment Processing ₦Z`.
- `Protection Fee` → `pricing.protectionFee` (capped). Tooltip: "SafeDeal protection/platform fee".
- Other two unchanged.

Second row (3 tiles): Eligible Refund Amount · Eligible Release Amount · Payout Status — unchanged.

Add a small line item or tooltip under Total Transaction showing `Payment Processing Fee: ₦{paymentProcessingFee}` — do not promote it into its own KPI tile, do not mix it into Protection Fee.

Remove any Delivery Fee mention.

---

## 5. Wording lock

Search-and-replace audit in both pages. Required labels exactly:
- `Protection Fee`
- `Payment Processing Fee`
- `Total Charged`
- `Seller Net`
- `Awaiting Release`
- `Released to Seller`

Forbidden (must not appear): `Processing Fee` (alone), `Protection & Processing Fee`, `SafeDeal Processing Fee`, `Delivery Fee`, `Shipping Fee`, `Fulfillment Fee`.

Exception: `Processing Fee` already appears at line 1470 — rename to `Payment Processing Fee`. The escrow-ledger "Fee Deducted" row stays "Fee Deducted" (it's a ledger entry label, not a fee name).

---

## 6. Backend field coverage

If `transaction_pricing.processing_fee_amount` is null for legacy rows, fall back to `payments.fee_amount` (Paystack's reported fee). If both null, render `—` in UI and skip from Total Charged math (`totalCharged = itemTotal + protectionFee`).

---

## Files touched

- `supabase/functions/admin-transaction-detail/index.ts` — pricing shape + cap enforcement
- `src/services/admin-transaction-detail.service.ts` — typing
- `src/pages/AdminTransactionDetail.tsx` — header KPI strip, Pricing & Fees grid, label sweep
- `src/pages/AdminDisputeDetail.tsx` — financial overview values + tooltip + label sweep

## Not in this pass

- No change to fee calculator logic itself (`src/lib/pricing.ts`, `_shared/pricing.ts`) — cap is already correct there.
- No backfill of legacy `transaction_pricing` rows.
- No payout screen, no Paystack transfer, no other redesign.
- The previously-flagged but separate items (`recompute_needs_admin_review` wiring, refetch-after-action sweep, header status fallback) are tracked but **not** in this pass unless you say otherwise.

## Acceptance

- SD-2026-000003 header shows: Item ₦650,000 · Protection ₦2,500 (capped) · Payment Processing ₦{actual} · Total Charged = sum. Seller payout tile shows `Awaiting Release ₦{itemTotal − ₦2,500}`.
- Dispute Detail financial top row shows Total Transaction reconciling against the three components in tooltip.
- Zero occurrences of `Delivery Fee` / `Shipping Fee` in admin transaction or dispute detail.
- Zero occurrences of bare `Processing Fee` outside the explicit `Payment Processing Fee` label.
