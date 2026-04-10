

# Fix: Evidence Preview, Update Delivery Navigation, and Item Titles

## Issues Found

### 1. Evidence preview on dispute page
The evidence data is returned correctly from the backend with valid Cloudinary URLs. The `SellerViewBuyerClaim` and `SellerEvidenceSection` components both render evidence thumbnails using `getCloudinaryThumbnail`. The buyer claim section shows evidence for buyer-uploaded files. However, the **Seller Evidence section** only receives `data.seller_response.evidence` — if the seller has not submitted any evidence, this section will be empty, and the `SellerViewBuyerClaim` only shows buyer-side evidence. This is working as designed. The likely issue is that the seed/test evidence images use a fake Cloudinary cloud name (`safedeal`) that doesn't resolve, causing broken image tags. Real uploaded images (with cloud `dgmcdk4lq`) render fine. No code fix needed for this — the components work correctly with real uploads.

### 2. "Update Delivery" button on transaction detail page does NOT navigate
**Root cause**: In `SellerTransactionDetail.tsx` line 175-178, the "Update Delivery" button has **no `onClick` handler** — it's just a static `<Button>` with no navigation:
```tsx
<Button size="sm" className="gap-2">
  <Truck className="h-4 w-4" />
  Update Delivery
</Button>
```
**Fix**: Add `onClick={() => navigate(`/seller/transactions/${transactionId}/delivery`)}` to the button.

### 3. Transaction item titles showing "Untitled Item" in Transactions list
**Root cause**: In `seller-transactions` edge function (line 122), the query selects a `category` column that **does not exist** in the `transaction_items` table:
```ts
.select("transaction_id, title, category, quantity")
```
PostgREST returns an error for invalid columns, causing the entire items query to fail silently. The `itemMap` stays empty, so all transactions fall back to "Untitled Item". The dashboard endpoint works correctly because it only selects `"transaction_id, title"`.

**Fix**: Remove `category` from the select clause (it doesn't exist in the schema). Use `condition_label` or nothing instead.

## Files Modified

| File | Change |
|---|---|
| `src/pages/SellerTransactionDetail.tsx` | Add `onClick` with `navigate` to "Update Delivery" button |
| `supabase/functions/seller-transactions/index.ts` | Remove non-existent `category` from `transaction_items` select query |

