

# Buyer Product Detail Redesign + Price Filter

## Summary

Two changes: (1) Redesign the `PublicProductDetail` page to match the reference — sidebar layout with glassmorphism panels, image gallery, pricing card, agreement details, delivery section, and reviews section. Auth-aware: shows `BuyerSidebar` for authenticated buyers, public header for guests. (2) Make the "Price Filter" button functional with a popover containing min/max price inputs.

## Changes

### 1. Redesign: `src/pages/PublicProductDetail.tsx`

Full rebuild to match reference design:

- **Layout**: Auth-aware — if user is authenticated buyer, show `BuyerSidebar` + "Back to Marketplace" header. If guest, show existing public header.
- **Top header bar**: "Back to Marketplace" link (left), heart + share buttons (right)
- **Breadcrumb**: Home > Category > Product title
- **Two-column grid**:
  - **Left**: Main image in glass-panel rounded-[24px], thumbnail strip (4 columns, includes video play button if video media exists)
  - **Right**: Category badge + stock badge, title, short description, glass-panel pricing card (price, escrow/verified/delivery/verification indicators), quantity selector (+/-), "Buy with SafeDeal Protection" CTA button, "Save for Later" + "Contact Seller" secondary buttons
- **Below grid** (2-col + 1-col layout):
  - **Product Description** section: glass-panel with description text, feature highlights grid (parsed from description or shown as-is)
  - **Product Agreement Details** section: glass-panel with bordered primary accent, agreement terms parsed as bullet points
  - **Delivery & Fulfillment** section: glass-panel with delivery method cards + delivery details
  - **Customer Reviews** section: glass-panel with rating summary + star bars + individual review cards (placeholder/static data for now since reviews aren't in DB yet)
- **Styling**: All sections use `glass-panel` (bg-card/60 backdrop-blur border border-border rounded-[24px])
- **Image handling**: `object-cover` + `onError` fallback, same as marketplace cards

### 2. Functional Price Filter: `src/pages/BuyerMarketplace.tsx`

- Replace the static "Price Filter" button with a `Popover` containing:
  - Min price input (number)
  - Max price input (number)
  - "Apply" button
  - "Clear" button
- Store `priceMin` and `priceMax` state
- Pass to `getMarketplaceProducts` as new filter params

### 3. Update: `src/services/marketplace.service.ts`

- Add `price_min` and `price_max` to `MarketplaceFilters` interface
- Pass them as query params

### 4. Update: `supabase/functions/marketplace/index.ts`

- Read `price_min` and `price_max` query params
- Add `.gte("unit_price", price_min)` and `.lte("unit_price", price_max)` filters to the products query when present

### No database changes needed

