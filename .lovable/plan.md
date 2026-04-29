# Tighten landing page density (no redesign)

Goal: keep the SafeDeal landing page exactly as it is — same sections, copy, colors, order — but make it read like a polished production SaaS landing instead of an enlarged mockup. All changes are sizing, spacing, and width corrections.

---

## 1. Global utilities — `src/index.css`

Lower clamp ceilings so the cascade tightens every section in one shot.

```css
/* Section padding: ~64px mobile → 88px desktop (was up to 80px, sections felt very tall) */
.section-y    { padding-block: clamp(2.5rem, 3.5vw, 5.5rem); }

/* Container side padding unchanged */
.container-x  { padding-inline: clamp(1rem, 2.5vw, 1.75rem); }

/* Hero stays large; everything else caps lower */
.h-display    { font-size: clamp(2rem, 3.6vw + 1rem, 3.5rem); line-height: 1.05; letter-spacing: -0.025em; }

/* Section headings: 28px mobile → ~40px desktop (currently ceilinged at 2.5rem/40px but reading too large; pull min down so 1024–1280px feels right) */
.h-section    { font-size: clamp(1.5rem, 1.4vw + 1rem, 2.5rem); line-height: 1.15; letter-spacing: -0.015em; }

/* Body lead: 15px → 17px (down from 18px ceiling) */
.body-lead    { font-size: clamp(0.9375rem, 0.25vw + 0.875rem, 1.0625rem); line-height: 1.55; }

/* Card titles unchanged */
.h-card       { font-size: clamp(0.95rem, 0.3vw + 0.9rem, 1.125rem); line-height: 1.3; }
```

## 2. Container width — every section

Change `max-w-7xl` (80rem / 1280px) → `max-w-6xl` (72rem / 1152px) on these section wrappers so cards stop spreading and the page centers tighter:

- FeaturedDealsSection, CategoriesSection, VerifiedSellersSection, WhySaferSection, MarketplaceVsDirectSection, HowItWorks, ProtectionSection, TransparencyTrustSection, PowerfulFeaturesSection, TrustSafetySection, NeedHelpSection, FAQSection, CTASection.

Keep Hero and Footer at `max-w-7xl` (hero benefits from breathing room; footer has many columns).

## 3. Section header blocks

Across all sections, reduce the bottom margin of the eyebrow + title + subtitle block:
- `mb-8 sm:mb-12` → `mb-6 sm:mb-10`
- Eyebrow chip padding `px-4 py-1.5` → `px-3 py-1`.
- Title `mb-3` → `mb-2`.
- Subtitle `max-w-2xl` → `max-w-xl` so it doesn't visually stretch.

## 4. Card padding & inner sizing

**FeaturedDealsSection** (`ProductCard`):
- Image aspect: `aspect-[4/3] lg:aspect-[5/4]` → `aspect-[4/3] lg:aspect-[4/3]` (consistent, slightly shorter on desktop).
- Inner `p-4 sm:p-5` → `p-4` flat. Bottom CTA stays.
- Bottom "Browse Full Marketplace" block `mt-8 sm:mt-10` → `mt-6 sm:mt-8`.

**CategoriesSection** (`CategoryCard`):
- Padding `p-4 sm:p-5` → `p-4` flat.
- Icon tile already 40px — keep.
- Grid gap `lg:gap-5` → `lg:gap-4`.

**VerifiedSellersSection** (`SellerCard`):
- Banner `h-16 sm:h-20` → `h-14 sm:h-16`.
- Avatar wrap `h-16 w-16` → `h-14 w-14`, negative margin `-mt-9` → `-mt-8`.
- Inner `px-5 pb-5` → `px-4 pb-4`.
- Inner section margins `mb-4` → `mb-3`.
- Grid gap `lg:gap-6` → `lg:gap-4`.
- Bottom CTA wrap `mt-8 sm:mt-10` → `mt-6 sm:mt-8`.

**WhySaferSection** (`ReasonCard`):
- Padding `p-5 sm:p-6` → `p-5` flat.
- Icon tile already 48px — keep.
- Title `text-lg sm:text-xl` → `text-base sm:text-lg`.

**MarketplaceVsDirectSection / HowItWorks (FlowCard) / ProtectionSection / TransparencyTrustSection / TrustSafetySection / NeedHelpSection / PowerfulFeaturesSection / CTASection**:
- Any card padding `p-5 sm:p-6`, `p-6 sm:p-8` → cap at `p-5 sm:p-6` first; for already-tightened cards, cap at `p-5`.
- Any icon tile larger than `h-12 w-12` (48px) → `h-11 w-11` (44px) or `h-12 w-12`.
- Step number circles `h-7 w-7` keep; `h-8 w-8` → `h-7 w-7`.
- List spacing `space-y-4` inside cards → `space-y-3`.
- Stat numbers in TrustSafety/Transparency: cap at `text-3xl sm:text-4xl` — replace any `text-5xl` ceiling.
- FAQ AccordionItem icon tiles capped at `h-9 w-9`; question font `text-sm sm:text-base`; answer `text-sm`; vertical padding inside trigger reduced one tier.
- CTA card outer padding `py-14 sm:py-16` and inner `p-6 sm:p-8` (was `p-8 sm:p-10`); button `px-8 py-5` → `px-7 py-4`.

## 5. Hero (small touch only)

- `.h-display` now caps at 56px (was 60px) via the CSS change above — no per-component edit required.
- Reduce hero outer padding from `py-12 sm:py-16 lg:py-20` → `py-10 sm:py-14 lg:py-16` so the gap between hero and Featured Deals tightens.

## 6. Responsive guarantees (unchanged)

- Mobile single-column stacks preserved.
- Tablet 2-col preserved (sm: breakpoints untouched).
- Desktop now lands at 1152px content width with the new caps.
- All `tap-target` (44px) and `safe-bottom`/`safe-top` rules preserved.
- No `overflow-x` regression: only `max-w` and padding tokens change.

## 7. QA after implementation

Screenshot `/` at 1280, 1024, 768, 390 and verify:
- Section vertical padding lands ~72–88px on desktop.
- Section titles look ~36–40px, not 48–56px.
- Cards no longer spread to the screen edges; centered tight grid.
- No section feels taller than ~1 viewport (except hero).

## Files to edit

- `src/index.css`
- `src/components/landing/HeroSection.tsx` (outer padding only)
- `src/components/landing/FeaturedDealsSection.tsx`
- `src/components/landing/CategoriesSection.tsx`
- `src/components/landing/VerifiedSellersSection.tsx`
- `src/components/landing/WhySaferSection.tsx`
- `src/components/landing/MarketplaceVsDirectSection.tsx`
- `src/components/landing/HowItWorks.tsx`
- `src/components/landing/ProtectionSection.tsx`
- `src/components/landing/TransparencyTrustSection.tsx`
- `src/components/landing/PowerfulFeaturesSection.tsx`
- `src/components/landing/TrustSafetySection.tsx`
- `src/components/landing/NeedHelpSection.tsx`
- `src/components/landing/FAQSection.tsx`
- `src/components/landing/CTASection.tsx`

No new files, no dependency changes, no design changes.
