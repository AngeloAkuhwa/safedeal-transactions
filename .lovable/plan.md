

# Fix Zero Amounts + Rewrite Update Delivery Page

## Two Issues

### 1. All transactions showing ₦0.00
**Root cause**: Line 126 of `seller-transactions` edge function queries column `payment_processing_fee_amount` — this column does not exist in `transaction_pricing`. The actual column is `processing_fee_amount`. PostgREST returns null for the entire query when an unknown column is requested, so all pricing data is lost.

**Fix**: In `supabase/functions/seller-transactions/index.ts`:
- Line 126: change `payment_processing_fee_amount` → `processing_fee_amount`
- Line 159: change `p.payment_processing_fee_amount` → `p.processing_fee_amount`

### 2. Update Delivery page doesn't match design
Full rewrite of `src/pages/SellerUpdateDelivery.tsx` to match the HTML reference exactly:

| Design element | Current | Fix to |
|---|---|---|
| Container | `max-w-4xl` | `max-w-7xl`, `py-8 md:py-12` |
| Header card | `p-6`, `text-2xl` title | `p-6 md:p-8`, `text-2xl md:text-3xl font-bold`, `rounded-2xl shadow border` |
| Amount pill | Plain text + outline badge | `bg-blue-50 px-4 py-2 rounded-lg border border-blue-100`, blue text, divider line |
| Money status | Grey `bg-accent/50` | Amber: `bg-amber-50 border-amber-200`, pill badge `bg-amber-200 text-amber-900 rounded-full` |
| Quick info | Plain text, no icons | Icon boxes (`bg-muted p-2 rounded-lg`), `border-t border-gray-100 pt-6` separator |
| Timeline | No connecting line, no shadows | Progress bar line behind circles, `shadow-lg shadow-blue-200 border-4 border-white` on completed, pulse dot on active, `opacity-50` on pending |
| Warning | `bg-destructive/10` full border | `bg-red-50 border-l-4 border-red-400`, `<strong>` tags in text |
| Delivery card | Simple card | Header bar (`border-b bg-muted/50 px-6 py-4`) with truck icon, `rounded-xl bg-muted` inputs, barcode icon on tracking |
| Evidence grid | All grey/muted | Color-coded: blue, purple, green, amber, pink backgrounds/borders |
| Upload zone | Small icon, dashed border | Large `w-16 h-16 bg-blue-50 rounded-full` icon, SVG dashed border |
| Buttons | `flex justify-end` | `flex-col-reverse sm:flex-row`, confirm with `shadow-lg shadow-blue-200 hover:-translate-y-0.5` + arrow icon |
| What Happens Next | Plain card | Gradient `bg-gradient-to-br from-blue-50 to-indigo-50`, `w-12 h-12 bg-primary rounded-xl` info icon, steps in white bordered cards, amber release time box |
| Trust indicators | Inline icons | `mt-12`, colored `w-10 h-10 rounded-full` icon containers (green, blue, purple), `font-bold` titles |

## Files to change

| File | Action |
|---|---|
| `supabase/functions/seller-transactions/index.ts` | Fix column name `payment_processing_fee_amount` → `processing_fee_amount` (2 lines) |
| `src/pages/SellerUpdateDelivery.tsx` | Full rewrite matching HTML reference design exactly |

