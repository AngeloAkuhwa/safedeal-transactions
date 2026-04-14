

# Add "Update Stock" Modal to Seller Storefront

## What changes

When a seller clicks the stock/quantity area on a product card in the storefront grid, an "Update Stock" modal opens (matching the reference design). The seller can adjust quantity with +/- buttons, quick-set buttons (5, 10, 0), and direct input. Saving calls the existing PATCH endpoint to update `stock_quantity`.

## Files

### 1. New: `src/components/storefront/UpdateStockModal.tsx`

A Dialog-based modal receiving:
- `open` / `onOpenChange`
- `product` (id, title, category_name, unit_price, currency_code, stock_quantity, status, primary_image_url)
- `onSave(productId, newQuantity)` callback

UI (from reference):
- Header: Boxes icon + "Update Stock" title
- Product summary card: image thumbnail, title, category + price, stock status badge + product status badge
- "Current Stock" label with `{quantity} units` on right
- +/- buttons flanking a number input with "units" suffix
- Quick-set buttons row: "Set 5", "Set 10", "Set 0"
- Status preview box: shows computed "In Stock" / "Low Stock" / "Out of Stock" based on input value
- Info text: "Products with 0 stock remain visible but cannot be purchased until restocked."
- Footer: Cancel + "Save Stock Update" primary button

### 2. Modified: `src/components/storefront/SellerProductCard.tsx`

- Add `onUpdateStock` optional callback prop
- Make the stock quantity area (lines 115-123) clickable — wrap it or add an onClick that calls `onUpdateStock` with `e.stopPropagation()`

### 3. Modified: `src/pages/SellerStorefront.tsx`

- Add `stockProduct` state (the product to update stock for)
- Pass `onUpdateStock` to each `SellerProductCard`
- Import and render `UpdateStockModal`
- `onSave` handler: call `updateProduct(productId, { stock_quantity })`, invalidate queries, show toast

No backend changes needed — the PATCH endpoint already supports `stock_quantity`.

