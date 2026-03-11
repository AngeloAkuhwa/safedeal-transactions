

# Fix Buyer Info Card Layout to Match Design

## Differences Found

The current implementation uses a **2-column grid layout** (`grid lg:grid-cols-3`) with the form on the left and a "Secure Transaction Link" side card on the right. The design shows a **single full-width card** with:

1. **Step header**: icon box (48x48, light primary bg, rounded-xl) + title (text-2xl bold) + subtitle, separated by a bottom border
2. **Form fields inline** with `space-y-6` spacing, inputs with `px-4 py-3 rounded-xl` padding
3. **Info card inline below fields** — the "Secure Transaction Link" callout sits inside the form card as a `bg-primary-50 border border-primary-200 rounded-xl p-4` block with a link icon and text, NOT as a separate sidebar card
4. **Labels** are `text-sm font-semibold` with `mb-2` gap before inputs

## Changes

### `src/pages/SellerCreateTransaction.tsx` — Step 1 section (lines ~470-506)

Replace the `grid lg:grid-cols-3` layout with a single full-width card:

- Remove the grid wrapper and sidebar card entirely
- Add step header with icon box (User icon in a 48x48 primary-100 rounded-xl box) + "Buyer Information" (text-2xl font-bold) + subtitle, with `pb-4 mb-6 border-b` separator
- Keep form fields but increase input padding: add `className="px-4 py-3 rounded-xl"` to inputs
- Make labels `text-sm font-semibold` with `mb-2` spacing
- Move "Secure Transaction Link" info card inline below the contact field as a `bg-primary/5 border border-primary/20 rounded-xl p-4` block with `Link` icon, title (`text-sm font-medium`), and description (`text-xs`)
- Helper text under inputs uses `mt-1.5` spacing

| File | Action |
|------|--------|
| `src/pages/SellerCreateTransaction.tsx` | Edit Step 1 layout to single-column with inline info card |

