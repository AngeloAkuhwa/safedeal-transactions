## Goal

Turn the hero into a live, animated mini product demo of the SafeDeal flow. Less text, more motion. Keep brand, headline, CTAs, and the trust bullets — replace the static status list with a self-cycling 6-step transaction card.

## Copy changes (small)

- Headline: keep `Buy safely.` / `Sell confidently.` ✓ (already correct)
- Subtitle (shorten):
  - From: "Shop protected deals, buy from verified sellers, and pay with confidence. SafeDeal holds your money until you confirm the item matches what was agreed."
  - To: "Shop protected deals and pay with confidence. SafeDeal holds your money until the item matches what was agreed."
- CTAs: keep all three (Browse Marketplace · Start Selling · Create Protected Deal). Wording unchanged.
- Trust bullets — replace with the 4 user-specified labels:
  1. Verified sellers
  2. Escrow-protected funds
  3. Buyer confirms first
  4. Evidence-backed disputes
- Bottom "Your payment is protected" tile inside the card → removed (replaced by the active progress indicator described below).

## New animated transaction card (right column)

Self-cycling 6-state demo. State changes every ~1.6 s and loops. Card height stays fixed across states (no layout shift) by always rendering all 6 step rows; visual emphasis changes via state transitions.

### 6 states

| # | Label              | Sublabel                  | Icon          | Tone    |
|---|--------------------|---------------------------|---------------|---------|
| 1 | Product selected   | iPhone 15 Pro · ₦1,450,000 | ShoppingBag   | primary |
| 2 | Payment received   | ₦1,450,000 secured         | CheckCircle   | success |
| 3 | Funds held         | Protected in escrow        | ShieldCheck   | warning |
| 4 | Seller dispatches  | Courier picked up          | Truck         | primary |
| 5 | Buyer verifies     | Confirm item matches       | CircleCheck   | primary |
| 6 | Funds released     | Paid to seller             | ArrowRightLeft| success |

### Per-row visual states (driven by `activeIndex`)

- **Done** (index < active): muted-green tint, success icon tile, small ✓ checkmark badge on right.
- **Active** (index === active): full color tile, subtle scale-up (`scale-[1.02]`), animated pulsing ring (`ring-2 ring-primary/40 animate-pulse`), brighter text.
- **Pending** (index > active): low-opacity (`opacity-50`), grey icon tile, muted text.

### Top of card

- Keep `Transaction #SD-4829 · Protected by SafeDeal` and `Protected` badge — no change.

### Progress bar (replaces bottom "Your payment is protected" tile)

- Thin 6-segment bar under the rows. Each segment fills `bg-success` once its step is done; current segment fills with `bg-gradient-to-r from-primary to-success` and animates left→right over the dwell duration.
- Right of the bar: current step counter `Step {active+1}/6` in tiny muted text.

### Implementation details

- New small component `<AnimatedTransactionCard />` colocated in `HeroSection.tsx`.
- Uses `useState<number>(0)` + `useEffect` with `setInterval(..., 1600)` cycling `0 → 5 → 0`. Cleanup on unmount.
- Respects reduced motion: if `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, skip the interval and render with all rows in their final ("done"/"current") visual hierarchy fixed at active=5 (or active=2 to keep an in-progress feel).
- Container card keeps existing wrapper, decorative blobs, and `animate-slide-in-right` entrance.
- Mobile: card was previously `hidden lg:block`. Keep hidden on mobile (saves height, keeps copy above-the-fold).

### Step rows — visual structure

```
┌─────────────────────────────────────────┐
│ [icon tile] Title                ✓/●    │  ← active row gets ring + scale
│             Subtitle                    │
└─────────────────────────────────────────┘
```

- Icon tile: 28×28 (`h-7 w-7`), rounded-md.
- Title: `text-[12px] font-bold`.
- Subtitle: `text-[10px]`.
- Right-side indicator:
  - Done: `Check` icon in `text-success`, `h-3.5 w-3.5`.
  - Active: pulsing dot `h-2 w-2 rounded-full bg-primary animate-pulse`.
  - Pending: nothing.
- Row container: `transition-all duration-500` so state changes feel smooth.

### Transition between states

- All transitions via Tailwind `transition-all duration-500 ease-out`.
- Active row: `scale-[1.02] ring-2 ring-primary/30 shadow-sm`.
- Done row: `bg-success/8 border-success/30`.
- Pending row: `opacity-50`.
- Progress segments: `transition-[width,background] duration-[1500ms] ease-linear`.

## Trust bullets (left column, below CTAs)

- Replace the 4 existing bullets with the new 4 labels.
- Keep current 2-column layout, `CheckCircle` markers, and fade-in.

## Section padding & layout

- Keep current paddings (`py-8 sm:py-10 lg:py-12`) — already tight.
- Keep grid `lg:grid-cols-2` and headline sizes unchanged.

## File to edit

- `src/components/landing/HeroSection.tsx` — single file change.

No other files modified. No new dependencies. No CSS additions (uses existing Tailwind keyframes `animate-pulse`, `animate-fade-in`, `animate-slide-in-right`).

## Verification (after implementation)

- Hero loads with cycling transaction card on desktop (lg+).
- Card cycles 6 states ~1.6s each, loops smoothly without layout shift.
- Done/active/pending visuals are clearly distinct.
- Reduced-motion users see a static, readable card.
- Mobile/tablet: card hidden, headline + 4 CTAs/bullets stay compact above the fold.
