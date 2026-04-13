

# Fix: Seller Storefront — Modal Data, Sidebar Archive, and Cleanup

## What was already done (Issues 1-3 — completed)

1. **CORS headers** on `seller-product-detail` edge function — fixed and deployed
2. **Category name enrichment** in `seller-products` edge function — fixed and deployed
3. **Accessibility** (`DialogTitle` + `aria-describedby`) on `ManageVisibilityModal` — fixed

## What still needs fixing (Issues 4-6)

### Issue 4: Modal shows no image or category on Edit and Preview pages

The detail endpoint returns nested objects (`product.category.name`, `product.media[0].file_url`), but both `SellerProductDetail.tsx` and `SellerProductPreview.tsx` pass flat fields (`product.category_name`, `product.primary_image_url`) which are `undefined`.

**Files:**
- `src/pages/SellerProductDetail.tsx` (lines 581-589)
- `src/pages/SellerProductPreview.tsx` (lines 584-592)

**Change:** Replace the modal product prop mapping:
```typescript
category_name: product.category?.name || null,        // was: product.category_name
primary_image_url: product.media?.[0]?.file_url || null, // was: product.primary_image_url
```

### Issue 5: Sidebar "Archive Product" button bypasses confirmation modal

The Quick Actions sidebar button calls `archiveMutation.mutate()` directly instead of opening the modal.

**File:** `src/pages/SellerProductDetail.tsx` (line 551)

**Change:** Replace `archiveMutation.mutate()` with `setVisibilityModalOpen(true)`

### Issue 6: Update `.lovable/plan.md` to reflect current state

Replace the plan file contents with a summary of all completed and newly applied fixes.

## Summary of all actions after fix

| Action | Trigger | Behavior |
|--------|---------|----------|
| Save Changes | Header button | PATCH with form fields, toast success |
| Publish | Header button (draft) | Direct PATCH `{ status: "published" }` |
| Unpublish | Header button (published) | Opens modal → PATCH `{ status: "draft" }` |
| Archive | Header OR sidebar button | Opens modal → DELETE (soft archive) |

## Files changed

1. `src/pages/SellerProductDetail.tsx` — fix modal data mapping + sidebar archive button
2. `src/pages/SellerProductPreview.tsx` — fix modal data mapping
3. `.lovable/plan.md` — update to reflect completed work

No backend changes needed.

