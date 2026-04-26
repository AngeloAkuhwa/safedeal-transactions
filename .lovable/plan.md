## Goal

Rework the public landing page (`/`) to match the new uploaded SafeDeal marketplace design. Page must clearly position SafeDeal as a public marketplace + protected-transaction layer, work flawlessly on every viewport (PWA-ready), and use the existing design tokens (no hard-coded hex). All existing routes / auth / marketplace data wiring stays intact.

## Final Section Order

```text
Header (sticky)
1. Hero                              (rewritten — 3 CTAs, location pill, transaction-preview card)
2. Marketplace Preview               (existing component — light polish, search + category chips on top)
3. Browse by Category                (NEW)
4. Verified Sellers                  (NEW — top sellers cards)
5. Fraud Prevention strip            (existing — keep as-is)
6. Best For (social channels)        (existing — keep)
7. Trust Banner (blue strip)         (existing — keep)
8. How SafeDeal Works                (rewritten — tabs: Marketplace flow / Direct flow, dual columns)
9. Buyer Trust (Why buyers trust…)   (NEW)
10. Protection (Your money stays safe) (rewritten — 2-col with mockup card)
11. Trust & Safety + stats + testimonials (existing — keep)
12. Powerful Features grid           (existing — keep)
13. Status Badges showcase           (NEW)
14. Final CTA                        (rewritten — new title/subtitle, 3 CTAs, 3 trust stats)
15. FAQ                              (existing — keep)
Footer                               (rewritten — 5-col, social icons, brand block)
```

Sections marked NEW are added; "rewritten" means content/layout overhaul of the existing component; "keep" means no changes beyond minor spacing/responsive tweaks.

## Detailed Changes

### Header (`src/components/landing/Header.tsx`)
- Logo: shield in a filled rounded primary square + "SafeDeal" wordmark.
- Desktop nav: Marketplace, How It Works, Protection, Trust & Safety, Support (links to FAQ).
- Sticky w/ subtle border, mobile sheet menu unchanged in behaviour.

### Hero (`HeroSection.tsx` — rewrite)
- Trust pill: "Trusted by 50,000+ users".
- Headline: "Buy safely. Sell confidently." (primary accent on second line).
- Sub-copy unchanged.
- Location row: "Currently available in Lagos, Nigeria — expanding soon".
- **Three CTAs** (stack on mobile, wrap on tablet, inline on desktop):
  1. `Browse Marketplace` → `/marketplace` (primary)
  2. `Start Selling` → `/auth?role=seller` (success/green variant)
  3. `Create Protected Transaction` → `/auth?role=seller&intent=create-transaction` (outline)
- Trust check row: "No setup fees · Instant protection".
- Right column: existing transaction preview card, polished (timeline rows: Payment Received → In Transit → Buyer Verification, FUNDS HELD pill, protection note).

### Marketplace Preview (`MarketplacePreview.tsx`)
- Keep existing live data fetch.
- Add a non-functional decorative search row + category chips above the grid (chips link to `/marketplace?category=<id>`).
- Section badge "Public Marketplace" + heading "Browse protected deals".
- Grid stays 2/3/4 cols based on viewport.

### NEW — Categories (`src/components/landing/CategoriesSection.tsx`)
- Pulls the 8 fixed taxonomy categories (Electronics, Phones & Tablets, Computing, Fashion, Home, Beauty, Sports, Other) from existing `getMarketplaceProducts` response (already returns categories with counts).
- Cards: icon tile, title, description, "{n} protected listings", arrow. Each card links to `/marketplace?category=<slug>`.
- Grid: 1 / 2 / 4 columns.

### NEW — Verified Sellers (`src/components/landing/VerifiedSellersSection.tsx`)
- Server data: add a small public edge function `featured-sellers` (or extend `marketplace`) returning top 4 sellers (most published products) with `full_name`, `store_slug`, `avatar_url`, basic counts. If extending `marketplace` is cheaper we'll do that.
- Cards: gradient header, avatar, name + verified check, "Trusted Seller" pill, stats (Products / Transactions / Rating / Location), "View Store" button → `/store/{slug}`.

### How It Works (`HowItWorks.tsx` — rewrite)
- Tabs (shadcn `Tabs`): "Buying from Marketplace" (default) and "Direct Transaction".
- Each tab renders a 6-step numbered list inside a soft gradient card.
- Below tabs: warning-styled callout "SafeDeal holds the money until buyer verification is complete".

### NEW — Buyer Trust (`src/components/landing/BuyerTrustSection.tsx`)
- "Why buyers trust SafeDeal Marketplace".
- 4 cards: Verified Sellers, Locked Agreement, Escrow Protection, Evidence-Based Disputes.
- 1 / 2 / 4 column grid.

### Protection (`ProtectionSection.tsx` — rewrite)
- 2-column layout. Left: heading + 3 feature rows (Bank-Level Security, Immutable Agreement, Dispute Resolution).
- Right: mockup card with three coloured strip rows + a small "$XXM+ protected" gradient block.

### NEW — Status Badges (`src/components/landing/StatusBadgesSection.tsx`)
- 8 badge tiles: DRAFT, AWAITING PAYMENT, FUNDS HELD, IN TRANSIT, AWAITING VERIFICATION, COMPLETED, DISPUTED, CANCELLED with one-line subcaption each.
- 2 / 4 column grid.

### Final CTA (`CTASection.tsx` — rewrite)
- Blue gradient bg (primary → primary-darker), decorative blurs.
- Pill: "Get Started Today".
- Heading: "Ready to shop or sell with protection?"
- Sub: "Browse public listings, buy from verified sellers, or create your own protected transaction in minutes."
- Three CTAs: `Browse Marketplace`, `Start Selling`, `Create Protected Transaction`.
- 3 trust stats row: Escrow protected payments · Verified seller storefronts · Evidence-backed dispute support.

### Footer (`Footer.tsx` — rewrite)
- 5-column grid (brand 2-cols + Product / Company / Support).
- Brand block: logo + tagline + 4 social icon buttons (Twitter, Facebook, LinkedIn, Instagram).
- Bottom bar: copyright left, Terms / Privacy / Cookies right.

### `src/pages/Index.tsx`
- Re-order to the final list above; insert the 4 new components.

## Responsiveness / PWA Readiness

- All sections use `max-w-7xl`, `px-4 sm:px-6 lg:px-8`.
- Breakpoints used consistently: `sm` (640), `md` (768), `lg` (1024).
- Hero CTAs: `flex-col sm:flex-row sm:flex-wrap` so 3 buttons wrap cleanly on tablet.
- Grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3/4` patterns, no horizontal overflow.
- Touch targets ≥ 44px (button `lg` size).
- Sticky header + mobile sheet menu retained.
- Use only design tokens from `index.css` / Tailwind config (`bg-primary`, `text-foreground`, `bg-success`, `bg-warning`, `bg-muted`, etc.) — no raw hex.
- Images use `loading="lazy"` and aspect ratios to avoid CLS.

## Backend Touch (small)

- Extend `supabase/functions/marketplace/index.ts` to optionally include `featured_sellers` (top 4 by published-product count) when a `?include=sellers` query param is present, OR add a tiny new public function `featured-sellers`. We'll add the param to the existing function to avoid a new function. No DB schema changes.

## Out of Scope

- No PWA manifest / service-worker work in this pass (per system PWA guidance — only add when explicitly requested for offline). User mentioned PWA only as a responsiveness requirement.
- No changes to dashboard, marketplace, storefront, or auth pages.
- No new routes.

## Files

**Edit**
- `src/pages/Index.tsx`
- `src/components/landing/Header.tsx` (minor — logo polish)
- `src/components/landing/HeroSection.tsx`
- `src/components/landing/MarketplacePreview.tsx` (add search + chips)
- `src/components/landing/HowItWorks.tsx`
- `src/components/landing/ProtectionSection.tsx`
- `src/components/landing/CTASection.tsx`
- `src/components/landing/Footer.tsx`
- `src/services/marketplace.service.ts` (pass `include=sellers`)
- `supabase/functions/marketplace/index.ts` (add `featured_sellers`)

**Create**
- `src/components/landing/CategoriesSection.tsx`
- `src/components/landing/VerifiedSellersSection.tsx`
- `src/components/landing/BuyerTrustSection.tsx`
- `src/components/landing/StatusBadgesSection.tsx`
