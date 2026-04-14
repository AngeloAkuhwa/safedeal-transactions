

# Make Cart Items Clickable to View Checkout Details

## What Changes

Each cart item card in `BuyerCart.tsx` becomes clickable. On hover, a subtle tooltip/visual cue shows "Click to view details & pay". Clicking navigates to the existing `StorefrontCheckout` page (`/store/:sellerSlug/:productSlug/checkout?qty=N`) where the buyer can see full order details (product summary, seller info, delivery method, purchase agreement) and pay directly — the flow that already exists.

## File Changes

### 1. `src/pages/BuyerCart.tsx`

- Wrap each cart item card's **image + product info area** (not the checkbox or qty/remove controls) in a clickable region using `onClick` that navigates to `/store/${item.product.seller_slug}/${item.product.slug}/checkout?qty=${item.quantity}`
- Add `cursor-pointer` and a hover effect (e.g., `group` class + subtle background shift) to the clickable area
- Add a small hover indicator: a `Tooltip` wrapping the clickable area with content "Click to view details & pay" (using the existing `Tooltip` component from `@/components/ui/tooltip`)
- Only enable click navigation when `item.product?.seller_slug` and `item.product?.slug` are available and item is not sold out
- For sold-out items, keep the card non-clickable (no cursor-pointer, no tooltip)

### 2. No other files need changes

The `StorefrontCheckout` page already shows the full "Complete Your Purchase" screen with order summary, seller info, delivery method, purchase agreement, and payment button — exactly matching the uploaded reference HTML.

