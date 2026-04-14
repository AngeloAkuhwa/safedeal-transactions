

# Redesign Buyer Marketplace Page

## Summary

Rebuild the Buyer Marketplace page to match the reference design: sidebar navigation layout, glassmorphism filter bar, redesigned product cards with category badges, seller avatars, stock status, "Escrow Price" label, cart icon, and a trust footer banner. Also ensure product images always display correctly.

## Changes

### 1. New: `src/components/marketplace/BuyerSidebar.tsx`

A sidebar navigation for buyer pages (mirroring the reference), with:
- SafeDeal logo at top
- Nav links: Dashboard, Marketplace, Transactions, Disputes, Notifications (with badge count)
- Bottom section: Settings link, user profile card (avatar, name, "Verified Buyer"), and a "Need Help?" support card
- Active state: highlighted background + left blue accent bar on Marketplace
- Responsive: collapsible on mobile

### 2. New: `src/components/marketplace/MarketplaceProductCard.tsx`

A new card component specifically for the marketplace grid, matching the reference:
- Glass-panel card (`bg-card/60 backdrop-blur border border-border`) with rounded-[24px]
- Aspect-square image with `object-cover` + hover scale effect
- **Category badge** overlay (top-left) — mapped from categories array by `category_id`
- **Heart/wishlist button** (top-right, cosmetic for now)
- Below image: seller row with avatar initial circle (colored gradient), seller name, verification checkmark, stock status badge (In Stock / Low Stock / Unavailable)
- Product title (line-clamp-2)
- "Escrow Price" label + formatted Naira price (or "Last Price" if out of stock)
- Cart button (bottom-right) — disabled style if out of stock, shows bell icon instead
- Out-of-stock cards: grayscale image, overlay, reduced opacity

### 3. Modified: `src/pages/BuyerMarketplace.tsx`

Full page redesign:
- **Layout**: `flex h-screen` with `BuyerSidebar` on left + scrollable main content area
- **Header bar**: "Marketplace" title + subtitle, green escrow protection badge (right), search icon button
- **Filter section**: glass-panel bar with search input, category dropdown, sort dropdown, and a "Price Filter" styled button
- **Product grid**: 4-column (xl) using `MarketplaceProductCard`, build a `categoryMap` from categories array to pass category names to each card
- **Empty state**: same as current
- **Pagination**: same as current
- **Trust footer**: glass-panel banner with shield icon, "SafeDeal Buyer Protection" text, and 100% Secure / 24hr Dispute stats
- Background glow effects (absolute positioned blurred circles)

### 4. Update edge function: `supabase/functions/marketplace/index.ts`

Add `category_id` to the shaped response so the client can map category names. (It's already returned in the raw query but stripped in the shape step — just include it in the output.)

### 5. Update: `src/services/marketplace.service.ts`

Add `category_id` to the `MarketplaceProduct` interface.

### Image reliability

- Use `object-cover` on all product images (already done but reinforced)
- Add `onError` fallback handler on `<img>` tags to show a Package placeholder icon if the image fails to load
- Never apply `grayscale` filter to in-stock images (only out-of-stock)

## No database changes needed

