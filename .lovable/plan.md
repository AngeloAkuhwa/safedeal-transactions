

# "Visit Seller's Store" Touchpoints in the Marketplace Flow

## Current State

Right now, there is **no explicit "Visit Store" link** anywhere in the buyer's marketplace flow. The only store-related navigation is the back button on the product detail page, which says "Back to [Seller]'s Store" for unauthenticated users but "Back to Marketplace" for authenticated buyers.

## Recommended Placement Points

Here are the **4 precise points** where a "Visit Store" or "View Seller's Store" action should appear, ordered by user intent strength:

### 1. Product Detail Page — Seller Info Section
**Where**: On the `PublicProductDetail` page, near where the seller's name/avatar appears (right column, below pricing card area).
**Why**: This is the highest-intent moment. The buyer is already evaluating a product and naturally wants to see what else this seller offers.
**How**: A clickable seller card with avatar, name, verification badge, and a "Visit Store →" button/link. Navigates to `/store/:sellerSlug`.

### 2. Marketplace Product Card — Seller Name
**Where**: On `MarketplaceProductCard`, the seller name/avatar row at the bottom of each card.
**Why**: While browsing the grid, buyers often want to explore a specific seller after seeing one appealing product.
**How**: Make the seller name/avatar row a clickable link to `/store/:sellerSlug`. Use `e.stopPropagation()` so it doesn't trigger the card's product-detail click.

### 3. Cart Item — Seller Name in Cart
**Where**: On the `BuyerCart` page, where each cart item shows the seller's name.
**Why**: Before committing to checkout, buyers may want to browse the seller's other products or verify legitimacy.
**How**: Make seller name a clickable link to `/store/:sellerSlug`.

### 4. Checkout Review Page — Seller Group Header
**Where**: On `CartCheckoutReview`, each seller group card header already shows the seller avatar and name.
**Why**: Last chance to verify the seller before paying. Lower priority since the buyer is already committed.
**How**: Add a small "View Store" link next to the seller name in each group header.

## Priority Recommendation

Implement **points 1 and 2 first** — they cover the discovery phase where "Visit Store" is most valuable. Points 3 and 4 are secondary trust-building touchpoints.

## Files to Change

| File | Change |
|------|--------|
| `src/pages/PublicProductDetail.tsx` | Add a seller info card with "Visit Store" link |
| `src/components/marketplace/MarketplaceProductCard.tsx` | Make seller name clickable to store |
| `src/pages/BuyerCart.tsx` | Make seller name in cart items link to store |
| `src/pages/CartCheckoutReview.tsx` | Add "View Store" link in seller group headers |

No backend changes needed — `store_slug` / `sellerSlug` data is already available in all these contexts.

