

# Redesign Saved Products Page to Match Reference Design

## What's changing

The current page has visual differences from the reference design. Here's what needs to be fixed:

### Layout & Spacing
- **Header**: Larger title (3xl/4xl), subtitle text-lg, badge moved to right side of header row (not inline with title)
- **Info banner**: Single-line layout with dismiss (×) button, text all on one line, no bold sub-heading
- **Filter bar**: Taller inputs (h-12), more spacing (gap-6 between cards)
- **Grid gap**: `gap-6` instead of `gap-4`
- **Content area max-width**: `max-w-[1400px]` with `p-4 md:p-8`

### Product Card Differences
- **No glassmorphism**: Cards use solid white `bg-card` with proper shadow, no `backdrop-blur-sm` or `bg-card/60`
- **Stock badge**: Top-left colored badge (green "In Stock", amber "Low Stock", gray "Out of Stock") instead of an overlay
- **Heart button**: Larger (w-10 h-10), with border
- **Category badge**: Below image inside content area (not overlaid on image)
- **Content padding**: `p-5` instead of `p-3.5`
- **Title**: `text-lg` instead of `text-sm`
- **Price**: `text-2xl font-bold` instead of `text-base`, no "Escrow Price" label
- **Seller row**: Has border-bottom separator, seller name is `text-sm font-medium text-foreground` (not muted)
- **Trust badge**: Colored pill badges — green "TRUSTED" or blue "VERIFIED" (not a checkmark icon)
- **CTA button**: Gradient `bg-gradient-to-r from-primary to-blue-600`, taller `h-11`, no shield icon. Out-of-stock shows gray "Currently Unavailable"
- **Hover effect**: `translateY(-4px)` lift on hover
- **No "Escrow Price" label** above price

### Responsiveness
- Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- Filters stack vertically on mobile, side-by-side on md+
- Header stacks on mobile with badge below title

## File to change

| File | Change |
|------|--------|
| `src/pages/BuyerSavedProducts.tsx` | Full redesign of the page layout and card component to match reference pixel-for-pixel |

No backend changes needed.

