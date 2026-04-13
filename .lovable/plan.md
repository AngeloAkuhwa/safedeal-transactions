

# Fix: Unpublish/Archive "Fetch Failed" + Missing Image & Status in Modal

## Two separate issues

### Issue 1: CORS — "Failed to fetch" on Unpublish/Archive

The `seller-product-detail` edge function is missing `Access-Control-Allow-Methods` in its CORS headers. Browsers require this header for PATCH/DELETE preflight requests. Without it, the request is blocked before it reaches the server.

**File:** `supabase/functions/seller-product-detail/index.ts`

Add `Access-Control-Allow-Methods` to `corsHeaders`:
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, ...",
};
```

Then redeploy the function.

### Issue 2: Missing image and category in modal

The product list from `seller-products` edge function returns `primary_image_url` and `status` correctly, so those should display. However, `category_name` is NOT returned — the query only selects `category_id`. The modal needs category name for the display (e.g., "Electronics • ₦1,230,000").

**File:** `supabase/functions/seller-products/index.ts`

After fetching products, look up category names from `product_categories` for all unique `category_id` values and enrich each product with `category_name`.

### Issue 3: Accessibility warning

**File:** `src/components/storefront/ManageVisibilityModal.tsx`

Add `DialogTitle` from Radix (visually hidden or using the existing h3) and `aria-describedby={undefined}` to suppress console warnings.

## Files changed

1. `supabase/functions/seller-product-detail/index.ts` — add `Access-Control-Allow-Methods` CORS header
2. `supabase/functions/seller-products/index.ts` — enrich products with `category_name` from `product_categories`
3. `src/components/storefront/ManageVisibilityModal.tsx` — add `DialogTitle` for accessibility

