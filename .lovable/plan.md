## Goal

Replicate the shared UX Pilot SafeDeal landing page (`main_19.html` + screenshot) inside the existing Lovable project as a close, production-polished match — same section order, visual direction, brand, and marketplace + escrow message — adjusted for spacing/responsiveness so it fits the real app.

## Section order (final)

1. Header / Navigation
2. Hero (with right-side transaction status card)
3. Featured protected deals (3 product cards)
4. Shop by category (8 category tiles)
5. Shop from verified sellers (4 seller cards)
6. Why SafeDeal feels safer (3 reasons)
7. Built for marketplace and direct deals (2-column comparison)
8. How SafeDeal Works (tabs: Marketplace Purchase / Direct Protected Deal, 6 step cards)
9. Your money stays protected until you're satisfied (4-step left + animated escrow card right)
10. Built on transparency and trust (6 trust pillars + Lagos launch stats strip)
11. Powerful features for secure transactions (9 SafeDeal-specific feature cards)
12. Trust & Safety (3 cards: escrow / verified / 24-7 support)
13. Need Help? (3 support channels: FAQ, live chat, email)
14. Frequently Asked Questions (accordion, 6 questions from existing copy)
15. Final CTA (gradient — "Ready to shop or sell with protection?")
16. Footer (5-column with brand, marketplace, sellers, support, social)

## Files to create

- `src/components/landing/FeaturedDealsSection.tsx` — 3 hardcoded demo product cards (iPhone 15 Pro Max, MacBook Pro 16 M3, Nike Air Max 90) with PROTECTED badge, In Stock pill, seller chip with rating, View Product button → `/marketplace`. Images sourced from the UX Pilot URLs in the HTML; on error fall back to a clean SVG placeholder so nothing renders broken.
- `src/components/landing/WhySaferSection.tsx` — 3 reasons (Funds held in escrow, Verified sellers, Evidence-backed disputes).
- `src/components/landing/MarketplaceVsDirectSection.tsx` — 2-column compare card: Marketplace Purchase vs Direct Protected Deal.
- `src/components/landing/TransparencyTrustSection.tsx` — 6 pillars (timeline, identity verification, locked agreement, delivery evidence, dispute handling, storefront reputation) + Lagos launch stats strip (5 stat tiles).
- `src/components/landing/PowerfulFeaturesSection.tsx` — 9 SafeDeal-specific cards: Protected Marketplace, Direct Deal Links, Funds Held Securely, Verified Seller Storefronts, Locked Agreement, Delivery Tracking, Buyer Confirmation, Evidence Uploads, Dispute Resolution.
- `src/components/landing/TrustSafetySection.tsx` — 3 cards (Secure Escrow, Verified Sellers, 24/7 Support).
- `src/components/landing/NeedHelpSection.tsx` — FAQ link, Live Chat, Email Support.
- `src/components/landing/demo-data.ts` — Single source for demo products and seller cards (4 sellers: Chioma Electronics, TechHub Lagos, GameZone Nigeria, StylePlug Lagos with the exact stats requested).
- `src/hooks/useScrollReveal.ts` — small IntersectionObserver hook used by sections to add `animate-fade-in` once visible. Default state must be visible (no `opacity-0`) when `prefers-reduced-motion` or when JS hasn't run, so content never stays invisible if animation fails.

## Files to edit

- `src/pages/Index.tsx` — Re-order the section list to match the 16 sections above; swap in the new components; remove now-superseded sections (`FraudPrevention`, `BestForSection`, `TrustBanner`, `BuyerTrustSection`, `ProtectionSection`, `TrustSection`, `FeaturesGrid`, `StatusBadgesSection`, `MarketplacePreview`) — they are absorbed into the new components.
- `src/components/landing/HeroSection.tsx` — Match the design: location pill on top, "Buy safely. / Sell confidently." headline, three vertical-on-mobile / horizontal-on-desktop CTAs (Browse Marketplace → `/marketplace`, Start Selling → `/auth?role=seller`, Create Protected Deal → `/auth?role=seller&intent=create-transaction`), 4 check-bullets in a 2-col grid, and the right-side Transaction #SD-4829 card with the 5 status rows + "Your payment is protected" footer (keep existing structure but expand to 5 rows + PROTECTED green pill).
- `src/components/landing/CategoriesSection.tsx` — Replace data-driven 8-category fetch with the 8 fixed UX Pilot categories (Phones & Tablets, Laptops, Fashion & Sneakers, Electronics, Home & Living, Gaming, Beauty & Accessories, Services) using approximate listing counts; link each to `/marketplace?category=<slug>`. Keeps server-free reliable rendering.
- `src/components/landing/VerifiedSellersSection.tsx` — Replace the edge-function fetch with the 4 demo sellers from the request; cards show colored gradient banner, avatar with verified check, rating/completed/products/location rows, View Store button linking to `/store/<slug>` (placeholder slug — uses existing `PublicStorefront` route shape).
- `src/components/landing/HowItWorks.tsx` — Switch to a tabs UI (Marketplace Purchase / Direct Protected Deal) using `@/components/ui/tabs`; 6 numbered/icon step cards in a 3-column responsive grid; bottom info banner about funds held until verification.
- `src/components/landing/CTASection.tsx` — Keep existing copy; ensure 3-CTA layout matches the design and stays responsive.
- `src/components/landing/Footer.tsx` — Confirm 5-column responsive grid (collapses to 2 cols on tablet, 1 on mobile) matches the design.
- `src/components/landing/FAQSection.tsx` — Switch from accordion-only to the 2-column card grid pattern from the design while preserving the existing 6 Q&A entries; expand on click with the existing `Accordion` from shadcn so it still animates smoothly.

## Routing wiring

- Browse Marketplace → `/marketplace`
- Start Selling → `/auth?role=seller`
- Create Protected Deal → `/auth?role=seller&intent=create-transaction`
- View Product → `/marketplace` (no detail demo IDs — safer than fake `/products/:id`)
- View Store → `/store/<demo-slug>` for the seller card; gracefully renders the existing storefront 404 if slug not found (acceptable for demo).

## Demo data (frontend only, in `demo-data.ts`)

Products: iPhone 15 Pro Max 256GB ₦1,850,000 (TechHub Lagos, 4.9) · MacBook Pro 16-inch M3 ₦3,200,000 (Premium Tech NG, 4.8) · Nike Air Max 90 ₦185,000 (SneakerHub, 4.7).
Sellers: Chioma Electronics (4.9 / 1,832 / 247 / Lagos) · TechHub Lagos (4.9 / 3,456 / 1,203 / Lagos) · GameZone Nigeria (4.8 / 2,145 / 892 / Lagos) · StylePlug Lagos (4.7 / 4,823 / 1,567 / Lagos).

## Image strategy

- Try the UX Pilot CDN URLs first (`storage.googleapis.com/uxpilot-auth.appspot.com/...`).
- Each `<img>` uses an `onError` handler that swaps to a clean local SVG placeholder (gradient + Shield icon) so no broken image boxes ever show.
- Seller avatars use initials in a colored gradient tile when no image is provided.

## Animation

- Use a small `useScrollReveal` hook with `IntersectionObserver` to add `animate-fade-in` once visible. Tailwind already defines `fade-in`, `slide-in-right`, and hover utilities (per project animations doc).
- Hero: title/subtitle/CTAs/bullets fade-up on mount; transaction card slides in from right; the 5 status rows highlight in sequence with small delays.
- Cards (product/category/seller/feature): fade-up on first scroll into view; subtle `hover:-translate-y-1 hover:shadow-xl` lift.
- Final CTA: gentle fade-in.
- FAQ: existing shadcn accordion handles smooth open.
- Respect `prefers-reduced-motion` — skip animations and render at full opacity.
- All elements default to `opacity-100` in their inline styles so failure to attach the observer never leaves content invisible.

## Responsiveness

- Use the project's existing Tailwind breakpoints: `sm` (≥640) 2-col, `lg` (≥1024) 3 or 4-col where appropriate.
- Hero stacks single-column under `lg`; transaction card hidden on small screens (matches design's `hidden lg:block`).
- All section containers use `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`.
- Buttons stack on mobile (`flex-col sm:flex-row`); category and seller grids: 1 → 2 → 3/4 columns.
- No fixed pixel widths — all images use `w-full h-auto object-cover` inside aspect-ratio containers to prevent overflow.
- Section paddings tuned down from the UX Pilot defaults (28→16/20) to feel native in the app.

## Out of scope

- No backend/edge-function changes. No DB migrations. The marketplace/seller fetch logic stays untouched; this page becomes self-contained with demo data so it always renders.
- No new dependencies.
