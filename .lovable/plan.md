

# Redesign Seller Storefront — Premium Dark Sidebar Layout with QR Code

## Overview

Replace the current top-nav + light-theme storefront page with the exact design from the attached screenshots/HTML: a dark navy sidebar layout with glassmorphism panels, ambient glow effects, premium product cards, and a functional QR code.

## Architecture Change

```text
Current:  SellerNav (top bar) → main content
New:      SellerStorefrontSidebar (left) + main content (right)
          Sidebar only used on /seller/storefront* routes
          Other seller pages keep SellerNav top bar (unchanged)
```

## Files to Create

### 1. `src/components/storefront/SellerStorefrontSidebar.tsx`

Dark sidebar matching the design exactly:
- SafeDeal logo with gradient circle at top
- Nav links: Dashboard (`/seller`), Storefront (`/seller/storefront`, active state with left blue bar), Transactions (`/seller/transactions`), Payouts (`/seller/payouts`), Disputes (`/seller/disputes`)
- Settings link at bottom
- Seller avatar + name + "Verified Seller" at very bottom
- Lucide icons mapped to each nav item
- Active state: `bg-[#1E2040]/80 border border-[#30344F]` with left blue accent bar
- Inactive: `text-[#8C8EAA] hover:text-white hover:bg-[#1E2040]/50`
- Hidden on mobile (`hidden lg:flex`), toggled via hamburger in header
- Props: `sellerName`, `avatarUrl`, `verificationLevel`

### 2. `src/components/storefront/SellerProductCard.tsx`

Premium dark product card matching design pixel-for-pixel:
- Glass panel: `bg-[#1E2040]/60 backdrop-blur-xl border border-[#30344F]/50 rounded-[24px]`
- Image area: `h-56`, hover zoom (`group-hover:scale-105`)
- Status badge (top-right): Published=green, Draft=amber, Out of Stock=gray, Archived=red
- Visibility badge (top-right, next to status): Public=blue, Buyer Specific=amber, Private=`bg-[#1E2040]/90 text-[#8C8EAA]`
- Category label below image: colored pill
- Title: `text-lg font-bold text-white`
- Description: `text-sm text-[#8C8EAA] line-clamp-2`
- Price: `text-2xl font-bold text-white` with `border-t border-[#30344F]` separator
- Stock badge with dot: green "In Stock" / amber "Low Stock" / muted "Out of Stock"
- Quantity: `text-xs text-[#8C8EAA]`
- "Last updated" with `border-t` separator — use relative time from `updated_at`
- Action row: Edit button (`bg-primary/10 border-primary/30 text-primary`) + overflow "⋮" button
- Out-of-stock cards: `opacity-60`
- Props: product data + onClick + onEdit

### 3. Install `qrcode.react` package

For functional QR code generation in the share card.

## Files to Modify

### 4. `src/pages/SellerStorefront.tsx` — Full redesign

Replace SellerNav with sidebar layout:
- Outer: `flex h-screen overflow-hidden bg-[#0A0B1E]`
- Left: `<SellerStorefrontSidebar />`
- Right: main content area with:
  - Ambient glow circles (absolute positioned, blurred)
  - Header bar: hamburger (mobile) + "Storefront" title/subtitle + gradient "Add Product" button
  - Scrollable content with glass panels for trust summary, share card, filters, product grid
- Trust summary: glass panel with 3 items (Store Status, Seller Rating, Published Products) — all DB-driven from `data.trust_summary`
- Filters: glass panel with 4-col grid (search + 3 selects) — dark-styled inputs using arbitrary Tailwind values
- Product grid: `lg:grid-cols-3` using `SellerProductCard`
- Empty/error states: dark-themed

### 5. `src/components/storefront/StorefrontShareCard.tsx` — Premium dark redesign

Match the design:
- Glass panel with `border-2 border-primary/20 rounded-[24px]`
- Link icon + "Your Public Storefront" title (white, bold)
- Subtitle: "Share this store link in your Instagram bio, WhatsApp, or X profile"
- URL row in nested glass panel with globe icon + monospace URL + Copy button
- "Preview Store" + "Share" buttons in dark surface style
- **Functional QR code** on the right side using `qrcode.react` — generates QR for the store URL
- QR code in white rounded container with "QR Code" label below

### 6. `src/components/storefront/ProductCard.tsx` — Unchanged

Existing light-theme card stays for marketplace/public storefront use.

## Design Tokens (scoped to storefront page)

| Token | Value |
|-------|-------|
| Background | `#0A0B1E` |
| Surface | `#1E2040` |
| Border | `#30344F` |
| Muted text | `#8C8EAA` |
| Primary | `#66A2EA` (maps to existing) |
| Success | `#42E677` |
| Warning | `#F4B400` |
| Danger | `#F4526D` |
| Glass panel | `bg-[#1E2040]/60 backdrop-blur-xl border border-[#30344F]/50` |

## Functional QR Code

- Use `qrcode.react` (`QRCodeSVG` component)
- Generate QR for the seller's store URL (`${origin}/store/${storeSlug}`)
- Render inside a white rounded container (128x128)
- Label "QR Code" below in muted text

## What Stays the Same

- All data fetching (queries, services, edge functions)
- All routing and navigation paths
- Filter state management logic
- Product click → `/seller/storefront/:id`
- Other seller pages (dashboard, transactions, payouts, disputes, profile) keep `SellerNav` top bar
- `ProductCard.tsx` for marketplace/public use — unchanged

## Key Implementation Notes

- The sidebar is **only** for the storefront page. Other seller routes are unaffected.
- Mobile: sidebar hidden, hamburger button in header toggles a slide-over or mobile nav
- Relative time for "Last updated": use a lightweight inline helper (no new dependency needed — simple "X days ago" logic)
- All trust summary values remain DB-driven from `data.trust_summary`

