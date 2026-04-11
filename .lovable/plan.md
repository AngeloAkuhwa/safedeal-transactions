

# Build Seller Product Preview Page

## Overview

Create a new read-only "Product Preview" page at `/seller/storefront/:productId/preview` that fetches real-time product data from the DB and renders it in the design layout from `main_7.html`. This is what the seller sees when clicking "Preview Product" on the edit page — a polished, non-editable view of their listing.

## New Files

### `src/pages/SellerProductPreview.tsx`

A new page component with:

**Layout:** `SellerStorefrontSidebar` + main content area (same shell as edit page). Theme-responsive using Tailwind theme classes throughout.

**Header:** Back button + product thumbnail + product title + status/visibility badges. Right side: "Preview" button (active/current) + "Edit Product" button (navigates to edit page).

**Main Content (left 2/3 column):**

1. **Product Gallery** card — icon `ImageIcon` + "Product Gallery" header. Large hero image (first media item) + thumbnail grid of remaining media. Uses `object-contain` for hero, `object-cover` for thumbnails.

2. **Product Description** card — icon `AlignLeft` + header. "Overview" section showing `short_description`. "Full Details" section showing `description`. Bottom grid: Condition, Brand, Model/SKU.

3. **Agreement Terms** card — icon `FileText` + header. SafeDeal Protection banner (shield icon + escrow explanation). Seller Notes text. Bottom grid: Verification Window + Delivery Method(s).

4. **Seller Information** card — icon `UserCheck` + header. Seller avatar, name, verified badge, "Trusted seller since..." text, Rating + Completed Sales grid. Data from seller dashboard query.

**Right Sidebar (1/3 column):**

1. **Pricing & Stock** card — Large price display (₦ formatted). Stock count with Low Stock/In Stock badge. Status badge. Visibility with icon + label + description. Public Store Link with copy button.

2. **Performance** card — Views, Saved, Last Updated rows with icons.

3. **Quick Actions** card — "Edit Product" (gradient primary), "Preview Public Page" (outline, navigates to public storefront URL), "Share Product" (outline), "Unpublish" (warning outline), "Archive Product" (danger outline). All functional buttons.

**Data fetching:** Reuses existing `getSellerProductDetail` service + `getSellerDashboard` for seller info. No new edge functions needed.

**Theme enforcement:** All colors use Tailwind semantic classes (`bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`, etc.). No hardcoded hex values.

## Modified Files

### `src/App.tsx`
- Import `SellerProductPreview`
- Add route: `<Route path="/seller/storefront/:productId/preview" element={<SellerProductPreview />} />`
- Place it BEFORE the `:productId` catch-all route

### `src/pages/SellerProductDetail.tsx`
- Update "Preview Product" button's `onClick` to navigate to `/seller/storefront/${productId}/preview`

## What Stays the Same
- All services, edge functions, DB schema unchanged
- Edit page functionality unchanged
- Sidebar component reused as-is

