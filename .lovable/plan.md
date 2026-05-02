## Goal

Refine the existing Seller Analytics page (no redesign). Add tooltips, click-throughs, polished hover/loading/empty/error states, smooth motion, and the chart-bucket fix — keeping the current SafeDeal style and component structure.

## Scope

Single file: `src/pages/SellerAnalytics.tsx`. No backend, no service, no nav changes. The `seller-analytics` edge function already accepts `bucket: 'daily' | 'weekly' | 'monthly'` — only the client mapping changes.

## Changes

### 1. Time bucket follows the period filter

Map period → bucket in the React Query key & fetch call:

- `30d` → `daily`
- `90d` → `weekly`
- `all` → `monthly`

Result: "Last 30 days" no longer shows Jan–Dec on the X axis.

### 2. KPI card tooltips (custom, not native)

Replace placeholder tooltip strings with the exact copy from the spec, rendered through the existing shadcn `TooltipProvider` / `TooltipContent` (already imported). Info icon is the trigger; tooltip uses `text-xs max-w-[240px]` and respects dark mode via `bg-popover text-popover-foreground`.

### 3. Click-through for KPI cards

Wrap each KPI card body in a `<Link>` (or `button` for non-routable) so the whole card is one tap target. Routes:

| Card | Destination |
|---|---|
| Seller Net Released | `/seller/payouts?status=paid` |
| Awaiting Release | `/seller/transactions?money_status=funds_pending_release` |
| Funds Held in Escrow | `/seller/transactions?money_status=in_escrow` |
| Gross Sales | `/seller/transactions` |
| Dispute Rate | `/seller/disputes` |
| Avg Release Time | `/seller/payouts` |

Hover affordance: `transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm cursor-pointer group`. A small `ChevronRight` appears top-right on hover (`opacity-0 group-hover:opacity-100 transition-opacity`).

### 4. Top Product rows clickable

Wrap each row in a `<Link>` to `/seller/products/{product_id}` (route already exists via the products page). Hover: `bg-muted/40`, image scales `group-hover:scale-105 transition-transform`, a small "View product →" appears on hover.

### 5. Release Performance rows clickable

Each row becomes a `<Link>`:

- Awaiting Release → `/seller/transactions?money_status=funds_pending_release`
- Payment Processing → `/seller/transactions?status=payment_processing`
- Paid Out → `/seller/payouts?status=paid`
- Failed Release → `/seller/payouts?status=failed`

Hover: brightens the tinted background slightly (`hover:brightness-95 dark:hover:brightness-110`).

Update the info banner copy to: **"Releases are processed only after buyer and seller confirmation, or after SafeDeal completes a review."**

### 6. Error state copy

Replace the existing one-liner with the spec's two-line block:
- Title: **"We couldn't load analytics"**
- Body: **"Please refresh the page or try again later."**
- Button: **Retry** → `refetch()`

### 7. Empty state — already matches spec, no copy change.

### 8. Animation pass

Use the project's existing keyframes (`animate-fade-in`) plus a small custom inline `style` for stagger delays. No new global CSS.

- Header: `animate-fade-in`
- KPI grid: each card gets `animate-fade-in` with `style={{ animationDelay: ${i * 60}ms, animationFillMode: 'both' }}`
- Chart card: `animate-fade-in` with delay `360ms`. Recharts `<Area>` gets `isAnimationActive` + `animationDuration={900}`.
- Health cards: stagger 80ms each
- Top product rows: stagger 60ms each, `animate-fade-in`
- Trust ring: animate width via CSS — wrap circle's score number in a `transition-all duration-700` and animate from `opacity-0 scale-90` to `opacity-100 scale-100` on mount using a `mounted` boolean state
- Health progress bars: animate from `width: 0` to actual value via `useEffect` setTimeout flipping a state; bar uses `transition-[width] duration-700 ease-out`
- Reduced motion: wrap stagger logic with `useReducedMotion` hook (matchMedia `(prefers-reduced-motion: reduce)`); when true, all animation classes & delays are skipped — content is rendered fully visible immediately.

### 9. Accessibility / safety nets

- Every animated element keeps its final-state opacity even if the animation is blocked (`animationFillMode: 'both'` and base classes that don't depend on JS).
- All click targets have proper `aria-label` (e.g., "Open Awaiting Release transactions").
- Tooltip triggers get `aria-label="More info"`.

## Out of scope

- Edge function logic (already supports buckets).
- Service layer types.
- Real prior-period deltas — trend chips continue to render derived counts using the values already returned. The `+12.4%` style sample numbers in the spec are illustrative; we render real data and only show a trend chip when meaningful (e.g. `{completed_transactions_count} completed`).
- Nav, route definitions (all destinations already exist in `App.tsx`).

## Files touched

- `src/pages/SellerAnalytics.tsx` — single-file refinement.
