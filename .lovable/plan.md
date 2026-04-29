
# SafeDeal landing — motion system + polish pass

Goal: make the page feel calm, premium, and connected. Same sections, same content shape — just one consistent motion system and a tightening pass for spacing, copy, badges and hover states.

No redesign. No new sections. No removed sections.

## 1. Build a single shared motion system

Create one source of truth so every section animates the same way.

**a. New utility classes in `src/index.css`** (under `@layer utilities`):

- `.sd-reveal` — initial state: `opacity: 0; transform: translateY(12px); will-change: opacity, transform;`
- `.sd-reveal.is-visible` — `opacity: 1; transform: none; transition: opacity 600ms cubic-bezier(.22,.61,.36,1), transform 600ms cubic-bezier(.22,.61,.36,1);`
- `.sd-hover-lift` — `transition: transform 250ms ease, box-shadow 250ms ease; &:hover { transform: translateY(-2px); }`
- `.sd-pulse-once` — runs `pulse` exactly once over ~1.4s using existing keyframes
- Reduced-motion block: force `.sd-reveal { opacity: 1; transform: none; }` and disable `.sd-pulse-once`, `.animate-pulse`, custom `sd-*` keyframes.

This guarantees content **never stays hidden** — even if JS, IntersectionObserver, or animation fails, reduced-motion users see everything immediately.

**b. Upgrade `src/hooks/useScrollReveal.ts`**:

- Toggle a class (`is-visible`) instead of appending `animate-fade-in`.
- Accept an optional `{ delay?: number }` and apply it via inline `transitionDelay`.
- Default threshold `0.12`, rootMargin `0px 0px -10% 0px`.
- One-shot (unobserve after first reveal).
- Safe fallbacks: if no IO support OR reduced motion → immediately add `is-visible`.

**c. Tailwind keyframes (`tailwind.config.ts`)** — keep existing, add nothing flashy. Remove reliance on `animate-pulse` for "always on" indicators in hero/escrow demos (replace with subtle opacity loop on the active dot only).

## 2. Apply the system everywhere (replace ad-hoc animations)

For each landing component below, swap bespoke reveal patterns for `useScrollReveal` + `.sd-reveal` and use staggered `delay` (≤ index × 80ms, capped at 400ms):

- `HeroSection.tsx`
- `FeaturedDealsSection.tsx`
- `CategoriesSection.tsx`
- `VerifiedSellersSection.tsx`
- `WhySaferSection.tsx`
- `MarketplaceVsDirectSection.tsx`
- `HowItWorks.tsx`
- `ProtectionSection.tsx`
- `PowerfulFeaturesSection.tsx`
- `FAQSection.tsx`
- `CTASection.tsx`

Specific motion behaviors (calm, professional, ≤700ms, smooth easing):

- **Section headers** fade up (`sd-reveal`, no delay).
- **Cards** fade up with stagger 70–80ms, cap at 6 steps.
- **Hover lift** standardized to `-translate-y-1` (cards) / `-translate-y-0.5` (buttons, chips). Single `duration-300 ease-out`.
- **Product images** keep `scale-110 duration-700`.
- **Category arrows** `translate-x-1` on hover (currently `1.5` — too jumpy).
- **Verified badges** pulse once via `.sd-pulse-once` triggered only on first reveal (use `IntersectionObserver` in the badge or wrap in a small `<RevealOnce/>` helper). Remove the unconditional `style={{ animation: "pulse 1.4s ease-out 1" }}` in `VerifiedSellersSection` so it actually waits for reveal.
- **Demo cards (Hero + Protection)** keep step-by-step row highlight, but:
  - Replace `animate-pulse` on the active step circle with a softer custom keyframe (`sd-soft-glow`, opacity 0.7↔1 over 1.6s) — no aggressive ring throb.
  - Remove `animate-pulse` from `HowItWorks` current-step circle (currently throbs too hard).
- **Progress lines** already use `transition-all duration-700 ease-out` — keep.
- **FAQ accordion** already smooth via Radix — no changes.
- **CTA gradient drift** already in place — keep, but reduce blur opacity to `0.12` so it's calmer.
- **Hero blobs**: replace `animate-pulse` with the same slow `sd-cta-drift` style (or remove). Less flashing on first paint.

## 3. Polish pass — fix specific issues

### Spacing & rhythm
- Standardize section vertical rhythm. Replace mixed `py-10/12/14` and `section-y` with `section-y` everywhere. Sections currently using bespoke `py-*`: `FeaturedDealsSection`, `CategoriesSection`, `VerifiedSellersSection`, `CTASection`. Keep `CTASection` slightly tighter via `!py-10 sm:!py-12`.
- Standardize header block to `mb-6 sm:mb-8` everywhere (currently mixes `mb-5/6/10`).

### Card consistency
- Ensure every card grid uses `h-full` on cards so heights match (already in featured/sellers — add to `WhySaferSection` proof cards which currently differ).
- Standardize card padding to `p-4` (sellers, why-safer, features, categories all aligned).
- Standardize card border radius to `rounded-2xl` for primary cards and `rounded-xl` for compact rows. Audit and align.

### Icon sizing
- Standard icon container sizes:
  - Card icon tile: `h-10 w-10`, icon `h-5 w-5`
  - Header chip icon: `h-3.5 w-3.5`
  - CTA inline icon: `h-4 w-4`
- Audit `WhySaferSection` (uses `h-11 w-11` and `h-12 w-12` mixes inside visuals — keep inside the visual zone, but normalize the outer card icon if any). Audit `MarketplaceVsDirectSection` step icon tiles `h-8 w-8` — keep, they're intentionally compact for mini-flow.

### Badge audit (reduce repetition)
- Hero shows "Protected" pill on demo card — keep.
- Featured deals each have "Protected" badge + footer "Every featured deal is protected…" chip — **remove** the footer chip (redundant). Keep card badges.
- `MarketplaceVsDirectSection` already had its header "Protected" chip removed — confirm clean.
- Verified seller card has both a checkmark on avatar AND a "Verified Seller" pill — **drop the avatar checkmark**, keep only the pill (cleaner).
- `WhySaferSection` doesn't need section-level "Why SafeDeal" eyebrow chip + same-meaning H2 — **keep H2, drop the chip** to reduce eyebrow chip fatigue (page has 6+ identical chips).
- Trim eyebrow chips to: Featured, Trusted Sellers, Simple & Secure (How It Works), Features, FAQ, Get Started Today. Remove from: Why SafeDeal, Browse Categories.

### Copy tightening (no paragraphs added; only trim)
- Hero subhead: shorten to "Pay safely. We hold the money until the item matches."
- `ProtectionSection` subtitle already short — keep.
- `WhySaferSection` subtitle "Trust, locked into every step." — keep.
- `FAQSection` subtitle "Tap to expand." (drop "Quick answers.").
- `CTASection` subhead: shorten to "Browse protected listings or create your own deal in minutes."

### Hover state consistency
- All interactive cards use: `hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg`.
- All buttons use: `hover:-translate-y-0.5 hover:shadow-md` (already mostly consistent — apply to Hero CTAs, CTASection buttons, FAQ wraps don't lift).

### Section connection (avoid disconnected feel)
- Alternate background tones predictably: `background → muted/30 → background → muted/30 …`. Current order is mostly correct; fix:
  - `FeaturedDealsSection`: `bg-background` ✓
  - `CategoriesSection`: `bg-muted/30` ✓
  - `VerifiedSellersSection`: `bg-background` ✓
  - `WhySaferSection`: `bg-muted/30` ✓
  - `MarketplaceVsDirectSection`: `bg-background` ✓
  - `HowItWorks`: change to `bg-muted/30` (currently `bg-background` — breaks rhythm because Protection is also `bg-muted/30`, two muted in a row otherwise).
  - `ProtectionSection`: keep `bg-muted/30` — but if HowItWorks switches, swap Protection to `bg-background` instead. Pick the one that produces strict alternation.
  - `PowerfulFeaturesSection`: alternate accordingly
  - `FAQSection`, `CTASection`: keep.

Final order of bg tones after fix: bg → muted → bg → muted → bg → muted → bg → muted → bg → gradient.

### Footer
- Already compact. Just align max width to `max-w-6xl` (currently `max-w-7xl`) so it matches the rest of the page width. No other changes.

## 4. Technical guarantees

- Every reveal element is **visible by default** in CSS until JS upgrades it (we add `.sd-reveal` only via class — but to avoid a flash where animations work we'll set initial hidden state in CSS BUT the reduced-motion + no-IO fallback paths in the hook immediately add `is-visible`). Crucially: the hook always sets `is-visible` on mount when IO is unavailable, so content is never permanently hidden.
- All transitions 250–700ms with `cubic-bezier(.22,.61,.36,1)` (smooth, professional).
- No use of `bounce`, `spin`, `shake`, fast pulses, or parallax.
- No layout-shifting animations — only `opacity` and `transform`.
- `prefers-reduced-motion` disables all custom keyframes and reveals; content shown statically.

## Files to edit

```text
src/index.css                                    (add motion utilities + reduced-motion safety)
src/hooks/useScrollReveal.ts                     (class toggle + delay + safer fallbacks)
src/components/landing/HeroSection.tsx           (calmer blobs, copy trim, dot glow)
src/components/landing/FeaturedDealsSection.tsx  (drop redundant footer chip)
src/components/landing/CategoriesSection.tsx     (arrow translate, alt bg if needed)
src/components/landing/VerifiedSellersSection.tsx(drop avatar check, true reveal-pulse)
src/components/landing/WhySaferSection.tsx       (drop eyebrow chip, h-full cards, p-4)
src/components/landing/MarketplaceVsDirectSection.tsx (motion alignment only)
src/components/landing/HowItWorks.tsx            (remove animate-pulse on circle, bg swap)
src/components/landing/ProtectionSection.tsx     (soft glow on active dot, bg swap)
src/components/landing/PowerfulFeaturesSection.tsx(motion alignment, bg swap if needed)
src/components/landing/FAQSection.tsx            (subtitle trim)
src/components/landing/CTASection.tsx            (calmer blur, copy trim)
src/components/landing/Footer.tsx                (max-w-6xl)
```

## Out of scope
- No new sections, no removed sections, no copy rewrites beyond the trims above.
- No design tokens / color changes.
- No data or service changes.
