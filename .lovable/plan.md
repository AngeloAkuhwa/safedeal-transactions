

# Saved Products (Wishlist) Feature

## Summary

Build a persistent wishlist system where authenticated buyers can save/unsave products from the marketplace, storefront, and product detail pages. Unauthenticated users see the PurchaseAuthModal when they try to save. A new "Saved Products" page (matching the uploaded `main_17.html` reference) displays all saved items with search/filter/sort. Clicking a saved item opens a product detail view (matching `main_18.html` reference) with full checkout flow continuity.

## Database

**New table: `saved_products`**

```sql
CREATE TABLE public.saved_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, product_id)
);

ALTER TABLE public.saved_products ENABLE ROW LEVEL SECURITY;

-- Buyers can CRUD their own saved products
CREATE POLICY "buyers_select_own_saved" ON public.saved_products
  FOR SELECT TO authenticated USING (auth.uid() = buyer_id);

CREATE POLICY "buyers_insert_own_saved" ON public.saved_products
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "buyers_delete_own_saved" ON public.saved_products
  FOR DELETE TO authenticated USING (auth.uid() = buyer_id);
```

No UPDATE policy needed — saves are insert/delete only.

## Backend

**New edge function: `saved-products`**

Handles three operations:
- **GET**: Fetch all saved products for the authenticated buyer, joining `products`, `profiles` (seller), `product_media`, `product_categories`, and `account_verifications` for enriched data
- **POST** `{ product_id }`: Insert a saved product row
- **DELETE** `{ product_id }`: Remove a saved product row

Also supports a lightweight **GET `?check=product_id`** to check if a single product is saved (for rendering filled hearts on detail pages).

## Frontend Changes

### 1. Saved Products Hook (`src/hooks/useSavedProducts.ts`)
- React Query hook wrapping the edge function
- `useSavedProducts()` — fetches full list for the Saved Products page
- `useIsProductSaved(productId)` — checks if a single product is saved
- `useToggleSave()` — mutation that inserts or deletes, invalidates queries
- Handles optimistic updates for instant heart toggle feedback

### 2. Heart Button Auth Gating
Update the heart/like button in these components to:
- Check auth state before toggling
- If **unauthenticated**: show `PurchaseAuthModal` with return path set to current URL
- If **authenticated**: call `useToggleSave()` mutation

**Files to update:**
- `src/components/marketplace/MarketplaceProductCard.tsx` — replace local `liked` state with server-backed toggle
- `src/pages/PublicProductDetail.tsx` — replace local `liked` state with server-backed toggle for both the top-right heart and "Save for Later" button
- `src/components/storefront/ProductCard.tsx` — add heart button if not present

### 3. New Page: `src/pages/BuyerSavedProducts.tsx`
Matches the `main_17.html` reference design:
- Header: "Saved Products" title + item count badge
- Info banner: "Items may become unavailable..."
- Filter bar: search input, category dropdown, sort dropdown
- Product grid (responsive 1→4 columns) with cards showing:
  - Product image with filled red heart (unsave), stock badge
  - Category tag, title, description, price
  - Seller avatar + name + trust badge
  - "Buy with SafeDeal Protection" CTA (links to product detail → checkout)
  - Out-of-stock items shown with reduced opacity and disabled CTA
- Empty state when no saved items

### 4. Saved Product Detail View
When clicking a saved product card, navigate to the existing `/store/:sellerSlug/:productSlug` route (PublicProductDetail). The detail page already has the layout matching `main_18.html`. The only change is ensuring the heart/save button reflects server state (filled = saved).

### 5. Navigation
- Add "Saved Products" nav item to `BuyerSidebar.tsx` with Heart icon, between Cart and Transactions
- Route: `/dashboard/saved`
- Add route to `App.tsx` under buyer-protected routes

### 6. Sidebar Badge (Optional)
Show saved item count badge on the Saved Products nav item, similar to the cart count pattern.

## Files Summary

| Action | File |
|--------|------|
| Migration | `saved_products` table + RLS |
| Create | `supabase/functions/saved-products/index.ts` |
| Create | `src/hooks/useSavedProducts.ts` |
| Create | `src/pages/BuyerSavedProducts.tsx` |
| Edit | `src/App.tsx` — add route |
| Edit | `src/components/marketplace/BuyerSidebar.tsx` — add nav item |
| Edit | `src/components/marketplace/MarketplaceProductCard.tsx` — server-backed heart |
| Edit | `src/pages/PublicProductDetail.tsx` — server-backed heart + save |
| Deploy | `saved-products` edge function |

