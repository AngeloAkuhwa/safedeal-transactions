

# Add "Complete Your Purchase" Auth-Gate Modal

## Summary

Create a purchase auth-gate modal component that appears when unauthenticated users click "Buy with SafeDeal Protection." The modal shows the product summary, value propositions, and offers Create Account / Log In / Continue Browsing options. After auth completes, redirect back to the same product detail page.

## Changes

### 1. Create `src/components/storefront/PurchaseAuthModal.tsx`

A new Dialog-based modal component matching the reference design exactly:

- **Header**: "Complete Your Purchase" title with X close button, separated by `border-b`
- **Product card**: Gray rounded card (`bg-muted rounded-xl border`) with product thumbnail (64px), product title, "Sold by {seller name}", and price
- **CTA text**: "Create a free SafeDeal account to complete your purchase" heading + "Join thousands of protected buyers on Nigeria's most trusted marketplace" subtext
- **3 value prop rows**: Each with a colored icon circle + text:
  - Blue truck icon: "Track your order in real time"
  - Green shield icon: "Buyer protection on every purchase"  
  - Amber check icon: "Access products from verified sellers across SafeDeal"
- **Buttons**: "Create Account" (primary filled `rounded-xl`), "Log In" (outlined `rounded-xl`)
- **Footer link**: "Continue browsing" text button

Props: `open`, `onOpenChange`, `product` (name, image, price, currency), `sellerName`, `returnPath`

Both "Create Account" and "Log In" buttons will navigate to `/auth?mode=signup` or `/auth?mode=login` respectively, storing the current product URL in `sessionStorage` under `safedeal_redirect` for post-auth return.

### 2. Update `src/pages/PublicProductDetail.tsx`

- Add `showAuthModal` state (boolean)
- Update `handleBuyCTA`: if not authenticated, set `showAuthModal = true` instead of showing a toast. If authenticated, proceed with existing flow.
- Also gate "Save for Later" and "Contact Seller" behind the same modal
- Render `<PurchaseAuthModal>` at the bottom of the component, passing product details and `returnPath = location.pathname`

### 3. Post-auth redirect handling

The `safedeal_redirect` sessionStorage key is already used by the existing buyer invite flow (per memory). The same mechanism will work here — after auth + role selection completes, the user is returned to the product detail page automatically. No changes needed to auth flow.

## No database or edge function changes needed.

