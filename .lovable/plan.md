# Landing page — pixel-faithful replication + mobile-first responsiveness

## Goal
Make `/` match the attached UX Pilot design exactly (spacing, typography scale, paddings, card sizing, color tone, badge shapes), while being **mobile-first** so it never breaks when wrapped as a PWA. Desktop must look like the screenshot; mobile must feel native (large tap targets ≥44px, fluid type, no horizontal overflow, safe-area aware).

## Scope
Only `src/components/landing/*`, `src/pages/Index.tsx`, and small additions to `src/index.css` + `tailwind.config.ts`. No backend/route changes. All CTAs keep their current routes.

## Design tokens to align (`src/index.css` + `tailwind.config.ts`)
The UX Pilot uses Tailwind's default `sky` (primary), `green` (success), `amber` (warning), `red` (danger), `neutral` palettes. Our HSL tokens are close but tone differs slightly. We will:
- Keep current HSL CSS variables (don't break the rest of the app).
- Add scoped utility classes for landing-only fine tuning (e.g. `.landing-section`, `.landing-h2`) so we don't pollute global tokens.
- Add fluid typography helpers using `clamp()` for the hero title and section headings — this is the key to PWA-grade scaling without media-query jumps.
- Add `safe-area-inset` padding helpers for sticky header / sticky CTA on iOS PWA.
- Add `text-rendering: optimizeLegibility` and `-webkit-tap-highlight-color: transparent` globally on landing.

Add to `src/index.css`:
```css
@layer utilities {
  .h-display    { font-size: clamp(2.25rem, 6vw + 1rem, 4.5rem); line-height: 1.05; letter-spacing: -0.02em; }
  .h-section    { font-size: clamp(1.75rem, 3.2vw + 1rem, 3rem); line-height: 1.1; letter-spacing: -0.01em; }
  .h-card       { font-size: clamp(1rem, 0.6vw + 0.9rem, 1.25rem); }
  .body-lead    { font-size: clamp(1rem, 0.4vw + 0.95rem, 1.25rem); line-height: 1.6; }
  .section-y    { padding-block: clamp(3.5rem, 6vw, 7rem); }
  .container-x  { padding-inline: clamp(1rem, 3vw, 2rem); }
  .tap-target   { min-height: 44px; min-width: 44px; }
  .safe-bottom  { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
  .safe-top     { padding-top: max(0.5rem, env(safe-area-inset-top)); }
}
html, body { overflow-x: hidden; -webkit-tap-highlight-color: transparent; }
```

## Section-by-section changes

Each section will be rewritten to mirror the HTML structure, with mobile-first defaults, then `sm:` / `lg:` upgrades. Cards use `rounded-2xl`, `border-neutral-200` equivalent (`border-border`), `shadow-xl` only on hover, and consistent `p-6 sm:p-7`.

### Header (`Header.tsx`)
- Sticky, h-16 on mobile / h-20 on lg, `safe-top`.
- Logo: 11×11 sky tile, 24px wordmark.
- Desktop nav links: Marketplace, How It Works, Protection, Trust & Safety, Support.
- Mobile: hamburger opens a Sheet (shadcn) with the same links + Login / Sign Up buttons.
- Right cluster: Log In (ghost, hidden <sm), Sign Up (filled primary), hamburger (<md).

### Hero (`HeroSection.tsx`)
- Padding `section-y` (smaller on mobile per design).
- Title uses `h-display` (clamps 36px → 72px), no manual `text-7xl`.
- Three CTAs: stack vertically on mobile (full width, `tap-target`), inline on `sm:`. Icons left, bold weight 700.
- 4 bullets in a 2-col grid on all sizes (matches design).
- Right transaction card: hidden <lg (matches design). Same status rows as today, but tighter spacing (p-3.5, gap-3, border-2 of step color), rounded-2xl footer protection panel.
- Wrap each animated element in a CSS class that uses our existing `animate-fade-in` (already in tailwind config) with staggered `style={{ animationDelay: ... }}`.

### Featured deals (`FeaturedDealsSection.tsx`)
Already exists; tighten to match:
- Heading `h-section`, subtitle `body-lead`.
- 3-card grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8`.
- Image area `aspect-[4/3]` (replaces fixed h-80 — fluid on mobile).
- "PROTECTED" badge top-right (success-600, white text), "In Stock" pill bottom-left (white/95 backdrop-blur).
- Price in primary 600, 28–30px.
- Seller row with avatar 32px, star + rating.
- Full-width "View Product" button → `/product/:id`.
- "View All Marketplace" outline button below.

### Categories (`CategoriesSection.tsx`)
- Section heading + subtitle.
- 8 category cards in `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4`.
- Each card: rounded-xl, soft tinted icon tile (h-12 w-12), name, "X listings". Hover: lift + border primary.

### Verified sellers (`VerifiedSellersSection.tsx`)
Already close; align spacing:
- 4 cards `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6`.
- Banner h-24, gradient. Avatar 80px, white border 4px, verified check badge bottom-right.
- Stats rows (Rating / Completed / Products / Location).
- "View Store" full-width primary button.

### Why SafeDeal feels safer (`WhySaferSection.tsx`)
- 3 trust cards in a row on lg, stacked on mobile.
- Each: large icon tile, headline, paragraph.
- Background tint: `bg-neutral-50` equivalent (we'll use `bg-muted/40`).

### Marketplace vs direct deals (`MarketplaceVsDirectSection.tsx`)
- Two-column comparison cards (1 col mobile, 2 col lg).
- Each card has a colored top accent bar, icon, title, 4 bullet rows with check icons, CTA at bottom.

### How it works (`HowItWorks.tsx`)
- Tabs (shadcn Tabs): "Marketplace flow" / "Direct deal flow".
- Each tab: 4 numbered step cards in 2x2 grid on lg, single column on mobile.
- Tip banner under tabs (info bg).

### Protection (`ProtectionSection.tsx`)
- Two-column on lg: left = title + 4 step rows with colored tone (success → warning → primary → muted); right = transaction card #SD-8472 with progress.
- Mobile: single column, card below copy.

### Transparency & trust (`TransparencyTrustSection.tsx`)
- 3 columns of trust pillars + a metrics strip below (4 stats: deals, sellers, payouts, disputes resolved).

### Powerful features (`PowerfulFeaturesSection.tsx`)
Already 9 features; just align card paddings (`p-6 sm:p-7`), icon tile 56px, title `h-card`, body `text-sm sm:text-base`, grid `1/2/3` cols.

### Trust & Safety (`TrustSafetySection.tsx`)
- 3 cards (Identity verified, Secure payments, 24/7 monitoring).

### Need help (`NeedHelpSection.tsx`)
- 2-column card: support contact + help center link.

### FAQ (`FAQSection.tsx`)
- shadcn Accordion, 2-column on lg (split list in half), 1 column on mobile. 6–8 questions from the HTML.

### Final CTA (`CTASection.tsx`)
- Already correct content; tighten to match: gradient background (sky → green diagonal), white text, three pill CTAs, three trust badges row.

### Footer (`Footer.tsx`)
- 5-col grid on lg → stacks on mobile. Brand + 4 link columns + bottom legal bar with `safe-bottom`.

## Mobile-first / PWA correctness
- All sections use `container-x` and `section-y` so paddings scale with viewport.
- Hero, FAQ, CTA: tested at 320px (smallest), 360px, 390px, 414px (common Android/iOS), 768px, 1024px, 1366px+.
- Buttons: `tap-target` class everywhere.
- Sticky header has `safe-top`; footer legal bar has `safe-bottom` so it clears the iOS home indicator when installed.
- No fixed pixel widths inside flex/grid — everything uses `min-w-0`, `w-full`, or `max-w-*`.
- All images have `loading="lazy"`, `decoding="async"`, explicit `width`/`height` ratios via `aspect-*` to prevent CLS.
- Respect `prefers-reduced-motion`: animations only run when `(prefers-reduced-motion: no-preference)` (add a CSS guard).

## Verification
After implementation, use the browser tool to screenshot `/` at 375×812, 414×896, 768×1024, 1280×720, 1536×864, and confirm: no horizontal scroll, hero readable on 360px, CTAs full-width on mobile and inline on ≥sm, transaction card hidden <lg, all 16 sections render in order.

## Files
**Edit:** `src/index.css`, `src/components/landing/Header.tsx`, `HeroSection.tsx`, `FeaturedDealsSection.tsx`, `CategoriesSection.tsx`, `VerifiedSellersSection.tsx`, `WhySaferSection.tsx`, `MarketplaceVsDirectSection.tsx`, `HowItWorks.tsx`, `ProtectionSection.tsx`, `TransparencyTrustSection.tsx`, `PowerfulFeaturesSection.tsx`, `TrustSafetySection.tsx`, `NeedHelpSection.tsx`, `FAQSection.tsx`, `CTASection.tsx`, `Footer.tsx`, `src/pages/Index.tsx` (no structural change, just confirm order).
**No new files.** No PWA service worker added (per project policy — only landing is made *PWA-ready*; user can add manifest later if they want install).
