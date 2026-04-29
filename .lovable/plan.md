## Scope

Refine only two landing sections. No other files touched.

- `src/components/landing/FeaturedDealsSection.tsx`
- `src/components/landing/CategoriesSection.tsx`

The current code is already structurally close to the brief — this is a polish pass focused on density, equal heights, and micro-interactions. No content/data changes (3 products already correct, 8 categories already correct).

---

## 1. FeaturedDealsSection — polish

Goal: less bulky, more polished, equal-height cards with refined motion.

**Layout / density**
- Reduce image area from `h-44 sm:h-48 lg:h-56` → `h-40 sm:h-44 lg:h-48` for a more balanced product-to-card ratio.
- Reduce body padding `p-4 sm:p-5` → `p-4` (uniform).
- Reduce price size from `text-2xl` → `text-xl` (clear but not oversized).
- Tighten vertical rhythm: `mb-3` gaps → `mb-2.5`.
- Add `h-full` on card + ensure parent grid uses `items-stretch` (default) so all 3 cards are equal height; CTA already pinned via `mt-auto`.
- Keep desktop `lg:grid-cols-3`, tablet `sm:grid-cols-2`, mobile single column (already correct).

**Card content (unchanged set)**
Image · Protected badge · In-Stock chip · Title · Price · Seller name + rating · Verified badge · View Product button. No descriptions. Already matches.

**Micro-interactions**
- Keep card hover lift: `hover:-translate-y-1.5` (already present) — fine.
- Keep image zoom: `group-hover:scale-110` (already present) — fine.
- **New:** one-time soft glow on the Protected badge when the card reveals. Add a `protected-glow` keyframe utility (inline via Tailwind arbitrary value) or apply `animate-pulse` for ~1.6s then stop. Implementation: add a small `glowed` state via the `useScrollReveal` IntersectionObserver pattern (mirror its callback) — when the card enters view, toggle a class `animate-[pulse_1.4s_ease-out_1]` on the badge, then remove it after 1.5s using `setTimeout`. Simpler alternative used: add inline `style={{ animation: revealed ? "pulse 1.4s ease-out 1" : undefined }}` driven by a local `useState` set inside an IntersectionObserver inside the card. Pulse uses Tailwind's existing keyframe.
- CTA arrow already has `group-hover:translate-x-0.5` — bump to `group-hover:translate-x-1` for a touch more slide.
- Staggered reveal already implemented via `useScrollReveal` + `transitionDelay: index * 80ms`. Keep.

**Cleanup**
- Keep the small "Every featured deal is protected by SafeDeal escrow" pill — it's compact and useful.
- Keep the "Browse Full Marketplace" CTA below.

---

## 2. CategoriesSection — polish

Goal: lighter, more compact, scannable; not dashboard-widget-like.

**Layout / density**
- Grid: desktop `lg:grid-cols-4`, tablet `sm:grid-cols-2`, mobile `grid-cols-2` (already matches request — keep current responsive pattern). Per brief mobile may be 1 or 2 cols; current `grid-cols-2` on mobile is the cleaner choice and stays.
- Reduce card padding `p-3 sm:p-4` → `p-3` uniform.
- Reduce icon tile `h-11 w-11 sm:h-12 sm:w-12` → `h-10 w-10` uniform.
- Switch the `sm:flex-col sm:items-start` two-line layout to a single consistent **horizontal** layout at all breakpoints (icon left, text right, arrow far right). This makes the section read as a quick browsing shortcut rather than a card grid of widgets and meaningfully reduces height.
- Tighten typography: title `text-[14px] sm:text-[15px]` → `text-sm`, count `text-[11px]` → `text-xs`.
- Section vertical padding `py-10 sm:py-12 lg:py-14` → `py-10 sm:py-12` (slightly more compact).

**Card content (unchanged)**
Icon · Name · Active listing count · Arrow. No descriptions exist — confirmed.

**Micro-interactions**
- Keep staggered scroll reveal via `useScrollReveal` + `transitionDelay: index * 50ms`.
- Keep hover lift `hover:-translate-y-0.5`.
- Keep icon background tone-swap on hover (`group-hover:bg-{tone}`).
- Keep arrow slide `group-hover:translate-x-1.5`.
- Remove the `group-hover:rotate-[-4deg]` on the icon tile — it's slightly playful/widget-ish; the brief asks for a softer change. Replace with `group-hover:scale-110` only.

---

## Out of scope

- No changes to `demo-data.ts`, hero, how-it-works, or any other section.
- No new dependencies.
- No new files; only edits to the two component files above.

---

## Verification checklist after build

- 3 product cards equal height at desktop, tablet, mobile.
- Protected badge visibly glows once when card scrolls into view, then settles.
- Image zoom + card lift + arrow slide all smooth.
- 8 category cards in a 4-col desktop / 2-col tablet+mobile grid, single horizontal row layout per card, noticeably shorter than before.
- No category descriptions present.
- No regressions to surrounding sections (no imports outside the two files).
