# Phase 12 — Item details on transaction page + payment success modal + clean single-page receipt

Builds on the previous fix (success-modal "Item" blank — wrong column in `resolve-share-token`). This phase fixes the related symptoms on the transaction detail page and the printed receipt.

## 1. Buyer success modal "Item" row blank

**Root cause:** `supabase/functions/resolve-share-token/index.ts` selects `transaction_items(... warranty_terms)` — the actual column is `warranty_info`. PostgREST errors silently; the code then does `item: itemRes.data || null`, so `item` is always `null` for every transaction. Verified by hitting the function directly for share token `d2cXftZNsV5YdyAajE87SX7W`: returns `"item": null` even though the row exists with title "Air Jordan Retro 10 Shoe Model".

**Fix:** Edit `supabase/functions/resolve-share-token/index.ts`:
- Change `warranty_terms` → `warranty_info` in the `transaction_items` select.
- Log `*Res.error` for the parallel queries so this kind of silent failure surfaces in edge logs.
- Keep the response shape (`item.warranty_terms`) by aliasing `warranty_info:warranty_info` and mapping to `warranty_terms` in the response object, so the existing `ReviewData` interface continues to work.

## 2. Transaction tracking page shows blank product image

**Root cause:** `supabase/functions/transaction-detail/index.ts` only fetches `product_media` when `tx.source_offer_id` is set (the offer flow). For cart/storefront checkouts the transaction has `source_product_id` instead, so `product_media` is left as `[]` and the `<ProductMediaGallery>` on `BuyerTransactionDetail` renders the empty-image placeholder.

**Fix:** Edit `supabase/functions/transaction-detail/index.ts`:
- Build the `productIds` array from BOTH `tx.source_product_id` (single-product case) AND `buyer_specific_offer_items` (offer case). Dedupe.
- Additionally, if no product media is found AND `transaction_media` rows exist, fall back to those (so legacy/offer-claimed transactions with custom media still work).
- Run the existing `product_media` query against the merged `productIds` list.

No changes to `BuyerTransactionDetail.tsx`, `ProductMediaGallery`, or the service type — `product_media` keeps the same shape.

## 3. Printed receipt produces 6 blank-padded pages instead of 1

**Root cause:** `src/components/transactions/TransactionReceipt.tsx` print CSS uses `visibility: hidden` to hide the rest of the app:

```css
body * { visibility: hidden !important; }
#safedeal-receipt-root, #safedeal-receipt-root * { visibility: visible !important; }
```

`visibility: hidden` removes the paint but **keeps the layout**, so the dashboard's full-height sections still occupy paper, producing the receipt on page 1 followed by 5 blank pages.

**Fix:** Replace the visibility trick with `display: none` for everything except the receipt root, and make the receipt the only flowing element while printing:

```css
@media print {
  html, body { background: #fff !important; margin: 0 !important; }
  body > *:not(#safedeal-receipt-root) { display: none !important; }
  #safedeal-receipt-root {
    display: block !important;
    position: static !important;
    width: 100% !important;
    background: #fff !important;
    color: #111 !important;
  }
  #safedeal-receipt-root * { color: #111 !important; }
  @page { margin: 16mm; size: A4; }
}
#safedeal-receipt-root { display: none; }   /* on-screen */
```

This removes the empty trailing pages. Receipt content itself is unchanged.

## Out of scope
- No schema, RLS, escrow, or payment-engine changes.
- No UI redesign of the receipt or transaction page beyond the print stylesheet.

## Verification
1. Re-hit `resolve-share-token` for the existing test transaction → `item.title` populated; success modal "Item" row shows the title.
2. Open `/dashboard/transactions/<id>` for a cart-bought transaction → "Item Details" gallery shows the product photo (Air Jordan).
3. Print the same transaction's receipt → Print preview shows **1 page**, total = "1 sheet of paper", no blank trailing pages.
