

# Fix: Seller Information Section — Match Design 100%

## Differences Found

Comparing the design HTML (lines 247-284) with the current implementation (lines 337-373):

| Element | Design | Current Code | Fix |
|---------|--------|-------------|-----|
| Card header | Icon + title only, no subtitle | Has subtitle "Your public seller profile" | Remove subtitle |
| Header padding | `p-6` | `px-6 py-4` | Change to `p-6` |
| Avatar size | `w-16 h-16` with `border-2 border-gray-100` | `h-12 w-12 ring-2 ring-border` | Increase to `h-16 w-16`, use `border-2 border-muted` |
| Layout | `flex items-start gap-4` | `flex items-center gap-4 mb-4` | Change to `items-start`, remove `mb-4` |
| Name text | `text-base font-semibold` | `text-sm font-semibold` | Bump to `text-base` |
| Verified badge | Green pill badge with check icon + "Verified" text | Just a `CheckCircle2` icon | Change to green pill: `bg-green-500/10 text-green-600 border border-green-500/20` with CheckCircle2 icon + "Verified" text |
| "Trusted seller since" | `text-sm text-muted mb-3` | `text-xs text-muted` | Change to `text-sm`, add `mb-3` |
| Rating row | Star icon (amber) + "4.8" + "(127)" count | Just "—" dash | Add star icon, keep data dynamic (show "—" if unavailable) |
| Stats grid | Inside the flex container (no border-t, positioned after mb-3 text) | Separate `div` with `pt-4 border-t` outside flex | Move grid inside the flex `div`, remove `border-t pt-4` from grid wrapper |

## File to Change

- `src/pages/SellerProductPreview.tsx` — lines 337-373 (Seller Information card only)

## No other changes needed

All data sources remain the same. Just JSX/styling corrections to match the design pixel-perfectly.

