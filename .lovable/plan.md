

# Add Original Price Field to Products

## Summary

Add an `original_price` column to the `products` table so sellers can set a "was" price that renders as a strikethrough next to the sale price. Update the seller creation form to include the field, update edge functions to handle it, and seed existing products with a reasonable value for testing.

## Changes

### 1. Database Migration

```sql
ALTER TABLE public.products ADD COLUMN original_price numeric;
```

Then seed existing products with `original_price = unit_price * 1.18` (rounded) so the strikethrough shows immediately for testing.

### 2. Update `src/pages/SellerProductCreate.tsx`

Add an "Original Price" input field next to the existing "Unit Price" field, with a label like "Original Price (optional)" and helper text "Show a crossed-out price to indicate a discount". Pass `original_price` in the create payload.

### 3. Update `src/services/seller-storefront.service.ts`

Add `original_price` to `CreateProductPayload` and `UpdateProductPayload` interfaces.

### 4. Update `supabase/functions/seller-products/index.ts`

Accept `original_price` from the request body and include it in the product INSERT.

### 5. Update `supabase/functions/public-product-detail/index.ts`

Include `original_price` in the product response (already uses `SELECT *` so it may already be included, but verify the explicit field list).

### 6. Update `src/pages/PublicProductDetail.tsx`

Replace the hardcoded `unit_price * 1.18` calculation with the actual `product.original_price` value. Only show the strikethrough when `original_price` exists and is greater than `unit_price`.

### No other backend changes needed.

