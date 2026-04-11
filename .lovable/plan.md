

# Corrections: Edit Product Page — Match Design 100%

## Issues Found (comparing design HTML vs current implementation)

### 1. Card Headers Missing Icons + Subtitles

Each card header needs a colored Lucide icon + title + subtitle:
- Product Details: `Info` icon + "Basic information about your product"
- Product Media: `ImageIcon` icon + "Upload high-quality images and videos"
- Pricing & Stock: `Banknote` icon + "Set your price and manage inventory"
- Agreement & Delivery: `Handshake` icon + "Transaction terms and delivery options"
- Visibility & Status: `Eye` icon + "Control who can see this product"

All icons in `text-primary`, all titles bumped to `text-lg font-semibold`.

### 2. Header Subtitle Text

Change to: "Update listing details, stock, pricing, and visibility"

### 3. Agreement & Delivery — Keep Checkboxes As-Is

**No change.** The current checkbox grid for delivery methods stays exactly as implemented. Only add a subtitle to the card header and keep everything else in this section unchanged.

### 4. Visibility Radio Cards — Icon + Label Layout

Change to `flex items-center gap-3` row for icon + label, description below.

### 5. Right Sidebar — Product Status Card

- Increase header to `text-base font-semibold`, `px-6 py-4` padding
- Stock: change to `{quantity} remaining` format
- Remove icons from Views and Last Updated rows
- Same padding fixes for Quick Actions and SafeDeal Protection headers

### 6. Right Sidebar — Button Styles

- "Preview Product" — outline with `Eye` icon
- "View on Storefront" — `bg-primary/5 border-primary/20 text-primary` with `ExternalLink` icon

### 7. Quick Actions — Center Buttons

Change from `justify-start` to `justify-center`.

### 8. SafeDeal Protection Card — Split Header/Body

Add `border-b border-border` header section, then separate body with shield icon + text.

### 9. Media Section — Always Visible

Remove conditional rendering; always show section with upload placeholder even when no media exists.

## Files to Change

- `src/pages/SellerProductDetail.tsx` — All fixes above (JSX/styling only, no logic changes)

## What Stays the Same

- All state, queries, mutations, handlers
- Agreement & Delivery section layout (checkboxes remain)
- Sidebar, routing, grid structure

