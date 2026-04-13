

# Add "Product Published Successfully" Modal

## What changes

After a seller clicks "Publish" on a draft product and it succeeds, show a success modal matching the reference design instead of just a toast. The modal includes:

1. **Green gradient header** with checkmark icon, "Product Published Successfully!" title, and subtitle
2. **Product summary card** showing image, title, category, price, and Published/Public badges
3. **Info banner** — "Now Available to Customers" with escrow protection message
4. **4 action buttons** in a 2x2 grid: Preview Product, View Store, Copy Link, Share Store
5. **"Back to Storefront" CTA** at the bottom

## Files

### 1. New: `src/components/storefront/PublishSuccessModal.tsx`

A Dialog-based modal component that receives:
- `open` / `onOpenChange` props
- `product` object (title, category name, price, image URL, slug)
- `storeSlug` for building store/product URLs
- Action handlers: navigate to preview, navigate to store, copy link, share

Design:
- Green gradient top section (`bg-gradient-to-r from-emerald-500 to-green-500`) with white checkmark in a `bg-white/20 backdrop-blur` circle
- Product card with image thumbnail, title, category + price, Published/Public badges
- Gray info box with Globe icon and "Now Available to Customers" text
- 2x2 grid of outline buttons: Preview Product (Eye), View Store (Store), Copy Link (Copy), Share Store (Share2)
- Primary gradient "Back to Storefront" button

### 2. Modified: `src/pages/SellerProductDetail.tsx`

- Add `publishSuccessOpen` state (boolean)
- Split `handleStatusToggle`: when publishing (draft → published), use a separate mutation `onSuccess` that sets `publishSuccessOpen = true` instead of showing a toast
- Import and render `PublishSuccessModal` with product data mapped from the detail response
- Wire action buttons:
  - **Preview Product** → navigate to `/seller/storefront/${productId}/preview`
  - **View Store** → navigate to `/store/${storeSlug}`
  - **Copy Link** → copy `window.location.origin + /store/${storeSlug}/${product.slug}` to clipboard, toast "Link copied"
  - **Share Store** → use `navigator.share` if available, else copy store URL
  - **Back to Storefront** → navigate to `/seller/storefront`

### 3. No backend changes needed

The publish PATCH already returns success — we just need to show the modal instead of a toast on success.

