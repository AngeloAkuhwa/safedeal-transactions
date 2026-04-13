

# Add "Manage Product Visibility" Modal

## Overview

Create a reusable modal component matching the design from `main_8-2.html` (lines 343-423). When the user clicks "Unpublish" or "Archive Product" anywhere on product cards or pages, this modal opens showing the product details and two action choices: Unpublish or Archive.

## New File

### `src/components/storefront/ManageVisibilityModal.tsx`

A Dialog-based modal accepting props:
- `open`, `onOpenChange` — dialog state
- `product` — `{ id, title, category_name, unit_price, currency_code, status, visibility_type, primary_image_url }`
- `onUnpublish(productId)` — callback
- `onArchive(productId)` — callback
- `isPending` — loading state

**Modal content (matching design exactly):**
1. **Header:** Archive icon (amber) + "Manage Product Visibility" title + close X button
2. **Product summary card:** `bg-muted` rounded-xl with 20x20 product image thumbnail, product title, category + price, status + visibility badges
3. **Warning banner:** amber `bg-warning/5 border-warning/20` — "Choose an action" heading + description
4. **Two action cards:**
   - **Unpublish:** `EyeOff` icon in amber bg, title, description, amber "Unpublish Product" button
   - **Archive:** `Archive` icon in red bg, title, description, red "Archive Product" button
5. **Footer:** Cancel button, right-aligned, separated by `border-t`

All using theme classes (`bg-card`, `text-foreground`, `border-border`, `bg-muted`, etc.).

## Modified Files

### `src/pages/SellerStorefront.tsx`
- Import `ManageVisibilityModal`
- Add state: `manageProduct` (the product to manage, or null)
- Pass `onManageVisibility` callback to `SellerProductCard`
- Render modal; `onUnpublish` calls `updateProduct(id, { status: "draft" })` and refetches; `onArchive` calls `archiveProduct(id)` and refetches

### `src/components/storefront/SellerProductCard.tsx`
- Add `onManageVisibility?: () => void` prop
- Wire the existing `MoreVertical` button to call `onManageVisibility`
- Alternatively, add an "Unpublish" quick-action if product is published

### `src/pages/SellerProductPreview.tsx`
- Import `ManageVisibilityModal`
- Add state for modal open + wire the existing "Unpublish" and "Archive Product" buttons to open it
- `onUnpublish` / `onArchive` call existing `updateProduct` / `archiveProduct` services, then refetch or navigate back

### `src/pages/SellerProductDetail.tsx`
- Import `ManageVisibilityModal`
- Replace direct `handleStatusToggle` on the Unpublish button and direct archive button with opening the modal
- Wire `onUnpublish` / `onArchive` to existing mutation logic

## No backend changes needed
Existing `updateProduct` (PATCH status) and `archiveProduct` (DELETE) services handle both actions.

