# Phase 13.1 — Fix `transaction-detail` snapshot select

## Root cause
My previous edit on `supabase/functions/transaction-detail/index.ts` selects columns that don't exist on `transaction_pricing`:

- `processing_fee_amount` ❌
- `service_fee_amount` ❌
- `service_fee_rate` ❌
- `seller_net_amount` ❌

Actual columns are: `id, transaction_id, currency_code, item_amount, platform_fee_amount, buyer_total_amount, payment_processing_fee_amount, seller_payout_amount, is_total_service_fee_capped, pricing_model_version, created_at, updated_at`.

Postgres rejects the whole select with an `undefined_column` error. Because the call sits inside `Promise.allSettled`, the failure is swallowed, `pricingRaw` becomes `null`, and `computedPricing` falls back to `computePricing(0)` → every value renders as `₦0.00` / `—`. This is what the buyer is seeing on the tracking page.

## Fix (one file)

`supabase/functions/transaction-detail/index.ts`

1. Replace the bad select with only the real snapshot columns:
   ```
   item_amount, currency_code, platform_fee_amount, payment_processing_fee_amount,
   buyer_total_amount, seller_payout_amount, is_total_service_fee_capped, pricing_model_version
   ```
2. In the snapshot-merge block:
   - Derive `service_fee_amount` as `platform_fee_amount + payment_processing_fee_amount` when the snapshot row exists (these are the only stored fee columns).
   - Derive `service_fee_rate` as `service_fee_amount / item_amount` (0 when `item_amount` is 0).
   - Keep `paystack_fee_amount` mirroring `payment_processing_fee_amount` for legacy UI consumers.
   - Keep the `computePricing(item_amount, currency)` fallback for the rare case where `pricingRaw` is genuinely missing (pre-payment).
3. Add a one-line `console.error("transaction_pricing select failed:", pricingResult.reason)` (and the same for the other allSettled branches) so the next silent column-name regression surfaces in edge-function logs instead of hiding behind zeros.

## Verification
- Reload `/dashboard/transactions/62ebc233-…6858f22226da` for the buyer.
- Expected from the stored row (`item=37,035 · platform=788 · processing=656 · total=38,479`):
  - Item Total: **₦37,035.00**
  - SafeDeal Fee: **₦788.00**
  - Payment Processing Fee: **₦656.00**
  - Total Service Fee: **₦1,444.00**
  - Total Charged: **₦38,479.00**
- The escrow banner already shows `₦37,035.00`, which will keep matching.
- Edge-function logs show no `transaction_pricing` error.

## Out of scope
- No DB schema change.
- No UI change (UI already reads the right fields via `viewFromRow`).
- Other fixes from Phase 13 (delivery-method, inventory) are unaffected.
