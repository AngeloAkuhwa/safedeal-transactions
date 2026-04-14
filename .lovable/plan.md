

# Refine Product Detail Page + Add Seller Product Fields for Richer Detail Rendering

## Summary

Two objectives: (1) Update `PublicProductDetail.tsx` to exactly match the reference design — fixing layout gaps like the "Buy with SafeDeal Protection" gradient button, quantity selector outside the pricing card, agreement section with titled bullet items (Exact Item, Condition, etc.), delivery cards (Courier/Hand delivery) with detail rows, and star-bar review layout. (2) Add new database fields (`feature_highlights` JSONB, `delivery_scope`, `estimated_delivery_days`) to the products table + update the seller product creation form so sellers can input data that feeds these rich detail sections.

## Changes

### 1. Database Migration — Add fields to `products` table

```sql
ALTER TABLE public.products ADD COLUMN feature_highlights jsonb DEFAULT '[]';
ALTER TABLE public.products ADD COLUMN delivery_scope text;
ALTER TABLE public.products ADD COLUMN estimated_delivery_days text;
```

`feature_highlights` stores an array of `{ title: string, description: string }` objects (e.g. "Pro Camera System" / "48MP Main, Ultra Wide, Telephoto").

### 2. Update: `src/pages/SellerProductCreate.tsx`

Add three new input sections to the product creation form:

- **Feature Highlights**: A repeatable field group (add/remove rows) where sellers enter a title + description for each feature. Stored as JSONB.
- **Delivery Scope**: Text input (e.g. "Lagos & Abuja").
- **Estimated Delivery**: Text input (e.g. "1-3 business days").

### 3. Update: `supabase/functions/seller-products/index.ts` (or whichever edge function handles product create/update)

Pass through the new fields (`feature_highlights`, `delivery_scope`, `estimated_delivery_days`) in the INSERT/UPDATE.

### 4. Update: `supabase/functions/public-product-detail/index.ts`

Include `feature_highlights`, `delivery_scope`, `estimated_delivery_days` in the `product` response.

### 5. Redesign: `src/pages/PublicProductDetail.tsx`

Match the reference exactly:

- **Header**: Sticky header bar with "Back to Marketplace" left, heart/share icon buttons in circular bordered containers (right)
- **Breadcrumb**: `>` chevrons instead of `/`
- **Product info (right column)**:
  - Category badge (blue pill) + stock badge (green pill with dot icon) on same line
  - Title in larger bold text (text-3xl/4xl)
  - Short description below
  - Remove seller mini-card from here (reference doesn't show it in this position)
  - **Pricing card**: Glass panel with price (large) + strikethrough original price. 2x2 grid of trust indicators (Escrow Protected, Verified Seller, Delivery Support, 48hr Verification) with colored icons
  - **Quantity selector**: Outside the pricing card, with "Quantity:" label and glass-panel +/- buttons
  - **CTA button**: `bg-gradient-to-r from-primary to-blue-600` (blue gradient, not green)
  - **Save for Later / Contact Seller**: Glass-panel bordered buttons

- **Description section** (left 2/3):
  - Section heading with icon
  - Description text paragraphs
  - **Feature highlights grid**: 2-column grid of features from `feature_highlights` JSONB, each with a green checkmark icon, bold title, and muted description

- **Agreement section** (left 2/3, below description):
  - Glass panel with `border-2 border-primary/20`
  - Blue info banner: "By purchasing this item, you agree to the following terms..."
  - Titled bullet items parsed from `agreement_terms` with circle-dot icons. Each bullet has a **bold title** and description on the next line. Last item (exclusions) uses red icon.

- **Delivery section** (left 2/3):
  - 2-column cards (Courier Delivery, Hand Delivery) with icons
  - Detail rows below: Delivery Scope, Estimated Delivery, Handled By — as label/value pairs

- **Customer Reviews section** (left 2/3):
  - Rating summary with large number (4.8), star icons, "Based on X reviews"
  - Star bar breakdown (5-star to 3-star progress bars)
  - Individual review cards with avatar, name, stars, "VERIFIED PURCHASE" badge, review text
  - Static/placeholder data for now

### 6. Update seller product edit page (if exists)

Ensure the edit flow also supports the new fields.

## No other backend changes needed beyond the migration and edge function updates.

