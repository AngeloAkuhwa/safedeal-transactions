

# Update Empty State on Seller Storefront

## What changes

Replace the current minimal empty state (lines 238-252 in `src/pages/SellerStorefront.tsx`) with the richer design from the reference mockup. The new empty state includes:

1. A **circular icon container** with `box-open` style icon (using `PackageOpen` from lucide) in a `primary/10` background
2. **Heading**: "You haven't added any products yet"
3. **Description paragraph** with longer copy about building the storefront
4. **Larger gradient CTA button** with plus icon and "Add Your First Product" text
5. **Pro Tip card** — a blue-tinted info box with lightbulb icon, "Pro Tip" heading, and helper text about sharing the store link

## File changed

**`src/pages/SellerStorefront.tsx`** (lines 238-252 only)

Replace the current empty state block with:
- `PackageOpen` icon (add to imports) inside a `w-20 h-20 rounded-full bg-primary/10` container
- Updated heading and description text matching the reference
- Larger button with `px-8 py-4` sizing
- New "Pro Tip" card below the button using `Lightbulb` icon (add to imports), with `bg-primary/5 border-primary/20` styling

No other sections of the page change. No backend changes.

