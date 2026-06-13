# Fix: "snapshot is not defined" on Checkout Selected Items

## Root cause

In `supabase/functions/cart-checkout/index.ts`, the pricing **snapshot** (from `buildPricingSnapshot`) is computed in the first per-seller loop (lines 130–141) as a local `const snapshot`, but only the `pricing` object is stored in the `sellerGroupPricings` map.

The second per-seller loop (lines 163–382), which actually inserts/updates `transaction_pricing`, then references `snapshot.payment_processing_fee_amount`, `snapshot.seller_payout_amount`, `snapshot.is_total_service_fee_capped`, and `snapshot.pricing_model_version` — but `snapshot` is no longer in scope.

Deno throws `ReferenceError: snapshot is not defined`, the function returns 500, and the BuyerCart `handleCheckout` toast surfaces the raw error text → user sees "snapshot is not defined" and the button is stuck.

## Fix (single file)

Edit `supabase/functions/cart-checkout/index.ts`:

1. Add a parallel map for snapshots, e.g.
   ```ts
   const sellerGroupSnapshots: Map<string, ReturnType<typeof buildPricingSnapshot>> = new Map();
   ```
2. In the first loop (≈line 138), store it:
   ```ts
   sellerGroupSnapshots.set(sellerId, snapshot);
   ```
3. In the second loop (≈line 165), retrieve it alongside `pricing`:
   ```ts
   const pricing = sellerGroupPricings.get(sellerId);
   const snapshot = sellerGroupSnapshots.get(sellerId)!;
   ```

No other call sites change. The two write paths (existing-tx update at line 202 and new-tx insert at line 270) will then resolve `snapshot.*` correctly.

## Out of scope

- No UI/UX changes to BuyerCart or CartCheckoutReview.
- No pricing logic, fee, or schema changes.
- Payment engine / Paystack flow untouched.

## Verification

1. Reload `/dashboard/cart`, click **Checkout Selected Items** on the Air Jordan item.
2. Expect: toast "Checkout session created! Redirecting..." and navigation to `/dashboard/cart/checkout?session=...`.
3. Check `cart-checkout` edge logs — no `ReferenceError`; one `cart-checkout: created session=...` line.
4. Confirm `transaction_pricing` row for the new tx has `payment_processing_fee_amount`, `seller_payout_amount`, `is_total_service_fee_capped`, `pricing_model_version` populated.
