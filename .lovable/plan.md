
## Plan — Remove hero trust chips & add a smooth "Back to top" button

### 1. Remove the 4 trust bullets under the hero CTAs
File: `src/components/landing/HeroSection.tsx`

- Delete the `bullets` array (lines 18–23).
- Delete the `<div className="mt-4 grid grid-cols-2 ...">` block that renders the four chips (lines 98–109).
- Leave everything else (badge, headline, sub-copy, CTA buttons, animated demo card) exactly as-is.

The same four messages still appear lower on the page (TransparencyTrustSection, WhySaferSection, CTASection), so we lose nothing.

### 2. Add a smooth "Back to top" floating button

Create a new component: `src/components/landing/BackToTop.tsx`

Behavior:
- Fixed position, bottom-right (`fixed bottom-6 right-6 z-50`), safe-area aware on mobile.
- Hidden until the user scrolls past ~600px; uses a scroll listener with `passive: true` to toggle a `visible` state.
- Fades + slides up when shown (`opacity`, `translate-y`, `transition-all duration-300`); fully hidden (and non-interactive via `pointer-events-none`) when not.
- On click: `window.scrollTo({ top: 0, behavior: "smooth" })`.
- Respects `prefers-reduced-motion`: fall back to `behavior: "auto"` so it jumps instead of animating, no fade transition.
- Styled to match SafeDeal: round 44×44 button, `bg-primary text-primary-foreground`, soft shadow, hover lift (`-translate-y-0.5`), focus ring, `aria-label="Back to top"`, lucide `ArrowUp` icon.

Also add a global CSS rule for native smooth anchor scrolling (covers any in-page hash links too):
- In `src/index.css`, add `html { scroll-behavior: smooth; }` inside the base layer, guarded by `@media (prefers-reduced-motion: no-preference)`.

### 3. Mount the button on the landing page
File: `src/pages/Index.tsx`

- Import `BackToTop` and render it once at the bottom of the page tree (outside the footer is fine — it's `position: fixed`).

### Out of scope
- No changes to TransparencyTrust / WhySafer / CTA / Footer.
- No changes to other pages — button is landing-page only as requested.

### Files touched
- edit `src/components/landing/HeroSection.tsx` (remove chips)
- new `src/components/landing/BackToTop.tsx`
- edit `src/index.css` (smooth scroll base style)
- edit `src/pages/Index.tsx` (mount button)
