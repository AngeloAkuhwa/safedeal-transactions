

# Fix Product Detail Page — Match Reference Design 100%

## Summary

Single-file rebuild of `src/pages/PublicProductDetail.tsx` to close all remaining gaps with the reference design, with sensible dimension adjustments.

## All Changes (single file: `src/pages/PublicProductDetail.tsx`)

### 1. Sticky header bar
Wrap the top bar (back button + heart/share icons) in a proper sticky header with `border-b border-border/50 bg-background/80 backdrop-blur-md` styling, height `h-16` (not h-20, adjusted for fit).

### 2. Add strikethrough original price
Show a crossed-out price next to the main price in the pricing card. Use `unit_price * 1.18` as placeholder since no `original_price` field exists. Display as `line-through text-base text-muted-foreground`.

### 3. Fix below-the-fold layout
Currently: Description takes 2/3, Agreement takes 1/3 in a side-by-side grid.
Fix: Stack ALL sections (Description, Agreement, Delivery, Reviews) vertically in a single `max-w-4xl` column. Remove the `lg:grid-cols-3` split entirely.

### 4. Update section headings
Change from `text-lg font-semibold` to `text-xl font-bold` (balanced size, not oversized).

### 5. Fix delivery details layout
Replace the 3 separate icon cards (Delivery Scope, Estimated Delivery, Handled By) with a single card containing label-value rows using `flex justify-between` per row, separated by `border-b border-border/50`.

### 6. Fix reviews section layout
- Change from vertical card (rating left column) to horizontal flex: large rating number + stars on left, star bars on right, separated by a vertical divider
- Update labels from "5★" to "5 star", "4★" to "4 star", etc.
- Update data: "Based on 127 reviews", percentages 85%/12%/2%
- Update reviewer names to "Adebayo Ogunlesi" and "Ngozi Eze"
- Update dates to "2 days ago" and "1 week ago"
- Change star icon in section heading to `text-amber-400`

### 7. Fix quantity selector styling
Replace ghost buttons with individual bordered square buttons (`border border-border rounded-lg`) inside the glass container.

### 8. Dimension adjustments
- Glass panels: `rounded-2xl` instead of `rounded-[24px]`
- Pricing card padding: `p-5` instead of `p-6`
- CTA button: `h-12` instead of `h-14`, `text-base` instead of `text-lg`
- Section spacing: `space-y-6` instead of `space-y-8` for tighter vertical rhythm
- Trust indicator items: `p-2` instead of `p-2.5`

### No database or edge function changes needed.

