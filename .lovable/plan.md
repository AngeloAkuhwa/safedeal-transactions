

# Fix Cart Badge Sync + Add Sidebar Collapse

## Problems
1. Sidebar uses query key `["buyer-cart-count"]` while the cart page uses `["buyer-cart"]`. When items are added/removed, only `["buyer-cart"]` gets invalidated, so the sidebar badge stays stale.
2. The sidebar has no collapse/expand toggle on desktop.

## Solution

### 1. Unify cart query key
Change `BuyerSidebar.tsx` to use `queryKey: ["buyer-cart"]` (same as cart page). This means any `invalidateQueries({ queryKey: ["buyer-cart"] })` from add/remove/checkout operations automatically refreshes the sidebar badge count too.

### 2. Ensure all cart mutations invalidate the shared key
In `BuyerCart.tsx`, after remove/update/checkout calls, add `queryClient.invalidateQueries({ queryKey: ["buyer-cart"] })`. Also do the same in `MarketplaceProductCard` and `PublicProductDetail` where "Add to Cart" is called — invalidate `["buyer-cart"]` so the sidebar badge updates immediately.

### 3. Add desktop collapse toggle
Add a `collapsed` state to `BuyerSidebar`. When collapsed, the sidebar shrinks to ~64px showing only icons (and the cart badge as a dot). A toggle button (chevron icon) at the top or bottom lets the user expand/collapse at will. The nav items hide their labels when collapsed but keep icons visible.

## Files to change

| File | Change |
|------|--------|
| `src/components/marketplace/BuyerSidebar.tsx` | Fix query key to `["buyer-cart"]`, add collapse state + toggle button, show icon-only mode when collapsed |
| `src/pages/BuyerCart.tsx` | Ensure remove/update handlers invalidate `["buyer-cart"]` (already mostly done, verify) |
| `src/components/marketplace/MarketplaceProductCard.tsx` | After `addToCart`, invalidate `["buyer-cart"]` |
| `src/pages/PublicProductDetail.tsx` | After `addToCart`, invalidate `["buyer-cart"]` |

No backend or migration changes needed.

