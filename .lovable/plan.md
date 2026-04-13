# Seller Storefront — All Fixes Applied

## Completed

1. **CORS headers** — Added `Access-Control-Allow-Methods` to `seller-product-detail` edge function
2. **Category enrichment** — `seller-products` list endpoint now returns `category_name`
3. **Accessibility** — `ManageVisibilityModal` has `DialogTitle` + `aria-describedby`
4. **Modal data mapping** — Fixed `SellerProductDetail` and `SellerProductPreview` to map nested detail response (`category.name`, `media[0].file_url`) to modal props
5. **Sidebar archive button** — Now opens confirmation modal instead of archiving directly

## Action Summary

| Action | Trigger | Behavior |
|--------|---------|----------|
| Save Changes | Header button | PATCH with form fields |
| Publish | Header button (draft) | Direct PATCH `{ status: "published" }` |
| Unpublish | Header button (published) | Opens modal → PATCH `{ status: "draft" }` |
| Archive | Header OR sidebar button | Opens modal → DELETE (soft archive) |
