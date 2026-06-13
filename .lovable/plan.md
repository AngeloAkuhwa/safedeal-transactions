# Fix Review & Pay image + misleading "Sold Out" in cart

You're right — the current flow has two real problems and one UX gap worth fixing together.

## Issue 1 — Review & Pay shows a placeholder instead of the product image

**Root cause:** `supabase/functions/checkout-review/index.ts` reads `primary_image` directly from the `products` table:

```
.select("id,title,short_description,primary_image,stock_quantity,reserved_quantity,status")
```

But in this project, product images don't live on `products.primary_image` — they live in `product_media` (joined to `files.file_url`). That's exactly how the cart endpoint (`buyer-cart`) resolves the image, which is why the cart page shows the Air Jordan thumbnail correctly but the Review & Pay page falls back to the package icon.

**Fix:** Mirror the cart's resolution inside `checkout-review`:
- After loading products, fetch `product_media` rows (`product_id, files(file_url)`) for the involved `product_ids` filtered to `is_primary = true`.
- Build a `mediaMap` and inject `primary_image` into the returned `products` map.
- No DB/schema changes; no frontend changes — `CartCheckoutReview.tsx` already renders `product.primary_image` if present.

## Issue 2 — Cart shows "Sold Out" for the buyer's own pending item

**Root cause:** When the buyer starts checkout, `cart-checkout` creates a pending checkout session and reserves stock (`reserved_quantity` goes up). The cart page then computes:

```
available = stock_quantity - reserved_quantity   // = 0
```

…and `getStockStatus` flags the row as **Sold Out**, even though the only reason it's "out" is the buyer's own active reservation. Going back from Review & Pay to the cart therefore looks broken: the user sees their own item as unavailable and can't return to checkout.

**Fix (frontend + light backend):**
1. In `buyer-cart`'s edge function, when loading the buyer's active `checkout_session` + `checkout_session_items`, sum the quantity this buyer already has reserved for each `product_id` (their "own reservation") and return it alongside the product, e.g. `own_reserved_quantity`.
2. In `BuyerCart.tsx`'s `getStockStatus`, compute:
   ```
   effective_available = available_quantity + own_reserved_quantity
   ```
   Use that for the Sold Out / Low Stock / quantity-cap checks. The product is only truly Sold Out if `effective_available <= 0`.
3. When the buyer has an active pending session for an item, change the row affordance:
   - Replace the red "Sold Out" badge with a neutral "Checkout in progress" pill.
   - Show a primary "Resume checkout" button that routes to `/dashboard/cart/checkout?session=<id>` (the existing Review & Pay route) instead of forcing them to re-trigger `cart-checkout`.

No state-machine or escrow changes — purely surfacing what's already true in the data.

## Issue 3 (recommendation) — Tighten the round trip between cart and Review & Pay

Two small UX additions that prevent the "is my order lost?" feeling the screenshots show:

- **Cart banner when a pending session exists:** at the top of `/dashboard/cart`, show an info banner "You have an unfinished checkout — Resume" linking to the active session. Today the cart silently looks broken.
- **Back to Cart preserves the session:** on Review & Pay, the "Back to Cart" link should be a normal back navigation (current behaviour) but the cart page should not auto-cancel the session. The reservation auto-release cron (existing) still cleans up abandoned sessions after the configured TTL.

Out of scope: no changes to `cart-checkout`, `verify-paystack-payment`, `paystack-webhook`, pricing, or DB schema.

## Files touched

- `supabase/functions/checkout-review/index.ts` — add product_media join + return `primary_image`.
- `supabase/functions/buyer-cart/index.ts` — return `own_reserved_quantity` and active `checkout_session_id` per product.
- `src/pages/BuyerCart.tsx` — adjust `getStockStatus`, render "Checkout in progress" + Resume button, add pending-session banner.

## Verification

1. Reload `/dashboard/cart/checkout?session=...` — Air Jordan thumbnail renders in the seller group (no package placeholder).
2. Click "Back to Cart" — row no longer shows "Sold Out"; instead shows "Checkout in progress" with a "Resume checkout" button that returns to the same Review & Pay session.
3. Complete payment — cart item disappears as today; stock decrements as today.
4. From another buyer's account, the product still shows correct availability (own_reserved only applies to the current buyer).
