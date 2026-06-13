
# Phase 4 (Sweep, cont.) — wire the breakdown into 5 more surfaces

Goal: extend the canonical pricing + payout labels into the remaining high-traffic surfaces. Pure presentation; no math, no DB, no edge-function changes. Each change preserves existing fallbacks so locked legacy rows still render correctly.

---

## 1. `src/pages/BuyerTransactionDetail.tsx`

Two places render the buyer pricing card (lines ~684 and ~773) with `Item Price` / `Service Fee (x%)` / `Total Paid`.

- Replace both hand-rolled tables with `<PricingBreakdown snapshot={view} audience="buyer" />`.
- Build `view` once via `viewFromRow(pricing)` from `payment-flow.service.ts` (the existing `pricing` object already has `item_amount`, `platform_fee_amount`, `paystack_fee_amount`/`payment_processing_fee_amount`, `service_fee_amount`, `total_amount`, and `is_total_service_fee_capped` after Phase 3).
- Keep the surrounding `Card` and any non-pricing copy untouched.
- Escrow status sentences ("Your payment of … is securely held…") stay as-is.

## 2. `src/pages/StorefrontCheckout.tsx`

Right-rail summary at lines ~280–308 uses `computePricing(itemSubtotal)` for an estimate.

- Build a `PricingSnapshotView` from that local `pricing` object via `viewFromRow({ item_amount: itemSubtotal, platform_fee_amount: pricing.platform_fee_amount, processing_fee_amount: pricing.processing_fee_amount, buyer_total_amount: pricing.total_amount, service_fee_amount: pricing.service_fee_amount, currency_code: product.currency_code, is_total_service_fee_capped: pricing.is_capped })` with `{ isEstimate: true }`.
- Replace the inline "Item Subtotal / Service Fee / Total Amount" block with `<PricingBreakdown snapshot={view} audience="buyer" />`.
- Keep the existing floor/cap notes if they aren't already covered by the breakdown's "Final fees confirmed at checkout." helper.
- Item-line block above the summary stays as-is.

## 3. `src/pages/CartCheckoutReview.tsx`

Per-seller subtotal cards (lines ~286–394) use `computePricing(sellerSubtotal)` and render "Subtotal / Total Protection Fee / Platform Fee / Total Protection Fee".

- For each seller group, build a `PricingSnapshotView` from `sellerPricing` (same shape as §2, including `is_estimate: true`).
- Replace the fee/subtotal block (only the summary, not the per-item rows) with `<PricingBreakdown snapshot={view} audience="buyer" />`.
- The grand-total row (line ~420–438) stays as a separate component since it sums across sellers and isn't a per-transaction snapshot; relabel its "Total Amount" to "Total Charged" via `PRICING_LINE_LABELS.total_amount` for consistency.
- Remove the now-orphaned "Total Protection Fee" / "Platform Fee" labels.

## 4. `src/components/disputes/AgreementSnapshotSection.tsx`

The `pricingFields` group (lines ~82–84) currently lists raw JSON keys, including `escrow_fee_amount` and `delivery_fee_amount` — both are forbidden labels under the new policy and `delivery_fee_amount` should never display since delivery fees are excluded from protection-fee calculation (per memory).

- Replace the entire "Pricing" section with `<PricingBreakdown snapshot={viewFromRow(json)} audience="admin" />`, so locked snapshots render the canonical 5 lines plus Seller Payout in a dedicated row beneath via `<SellerPayoutLine snapshot={view} />`.
- Drop `escrow_fee_amount` and `delivery_fee_amount` from `KNOWN_KEYS` and from `pricingFields`.
- Keep the "Raw JSON" toggle so admins can still inspect the original snapshot.
- Item / Parties / Delivery sections unchanged.

## 5. `src/components/seller/SellerConfirmCompletionCard.tsx`

Today this card shows only a confirm button + checkbox — no payout amount.

- Extend `SellerConfirmCompletionCardProps` with `sellerPayoutAmount: number | null` and `currency: string` (caller in `SellerTransactionDetail.tsx` reads `pricing.seller_payout_amount ?? pricing.seller_net_amount` and `pricing.currency_code`, then passes them in).
- Render `<SellerPayoutLine amount={sellerPayoutAmount} currency={currency} className="mb-3" />` above the confirmation checkbox so the seller sees exactly what they'll receive before agreeing.
- No mutation logic changes; the toast / success copy stays.
- Update `src/pages/SellerTransactionDetail.tsx` (the one caller) to pass the two new props.

---

## Service-layer touch-ups

- `src/services/transaction-detail.service.ts` — already extended with the three optional snapshot fields. No new change.
- `src/services/seller-transaction-detail.service.ts` — confirm its pricing return includes `seller_payout_amount` and `is_total_service_fee_capped`; add the optional fields if missing (passthrough only).

## Forbidden labels check

After these edits, re-run `rg "Delivery Fee|Shipping Fee|Platform Processing Fee|Protection & Processing Fee|Total Protection Fee|Total Paid"` under `src/` and remove any survivors (notably `CartCheckoutReview.tsx` "Total Protection Fee" / `BuyerTransactionDetail.tsx` "Total Paid").

## Verification

A. Type-check (`tsc --noEmit`) passes.
B. Visual:
1. Buyer detail page shows the 5-line breakdown on both the summary card and the side card, with the cap note when applicable.
2. Storefront checkout right-rail shows the 5 lines + "Final fees confirmed at checkout."
3. Cart review per-seller blocks show the 5 lines per seller; grand total row reads "Total Charged".
4. Dispute "Locked Agreement" → Pricing section renders the 5 lines from the immutable snapshot, with Seller Payout beneath; raw JSON toggle still works.
5. Seller confirm completion card shows "Seller Payout: ₦X" above the checkbox.
C. No occurrence of the forbidden labels in the rendered HTML of those 5 surfaces.

## Rollback

Pure presentational. Reverting each file restores the prior labels; shared primitives remain in place and are side-effect-free.

---

## How many phases are left after this sweep?

Two — plus a final cleanup pass:

- **Phase 5 — Notifications + transactional emails.** Sweep email templates / push / in-app notification copy through the shared `PRICING_LINE_LABELS` and `resolveMoneyLabel` registry so receipts, payout-released and refund-issued messages match the in-app labels word-for-word. No DB or math.
- **Phase 6 — Reconciliation + observability.** Daily job that compares `escrow_ledger_entries` totals to `payouts.amount` and `refunds.amount` per transaction, alerting on drift; admin "pricing audit" screen that lists rows where `transaction_pricing.pricing_model_version` is NULL or older than the current version. No user-facing pricing changes.
- **Phase 7 (cleanup, optional) — drop legacy column reads** (`seller_net_amount`, `processing_fee_amount`) from edge functions and the service layer once Phase 6 confirms 100% of unlocked rows are on the new snapshot. Locked rows keep their original snapshot intact; only the read paths simplify.
