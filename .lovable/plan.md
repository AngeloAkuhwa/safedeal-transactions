

# Fix: Evidence Previews, Upload Proof Navigation, and Image Fallbacks

## Issues Identified

### 1. "Upload Proof" button doesn't navigate to delivery page
In `SellerTransactions.tsx`, the action button onClick only handles `awaiting_buyer` and `seller_preparing_delivery` statuses. When status is `seller_dispatched` (which shows "Upload Proof"), it falls through to the generic detail page. Same issue for `payment_secured` ("Start Fulfillment").

**Fix**: Add routing for `seller_dispatched` and `payment_secured` to navigate to the delivery update page.

### 2. Evidence images not rendering
The images from real uploads have valid `secure_url` values and the edge functions correctly prefer `secure_url` over `file_url`. The `getCloudinaryThumbnail` function should produce working URLs. However, there are two issues:
- Seed data files use a non-existent Cloudinary cloud (`safedeal`), so those will always show broken images
- The image components have no error fallback — when an image fails to load, it shows a broken image icon with alt text instead of a graceful fallback

**Fix**: Add `onError` handlers to `<img>` tags in evidence components to fall back to a filename display when images fail to load. This handles both seed data and any transient CDN issues.

### 3. Delivery proof image on seller dispute page also broken
Same root cause — the `EvidenceFileCard` in `SellerEvidenceSection` and `SellerViewBuyerClaim` both use `<img>` without error fallback.

## Changes

| File | Change |
|---|---|
| `src/pages/SellerTransactions.tsx` | Add `seller_dispatched` and `payment_secured` routes to delivery page in action button onClick |
| `src/components/seller-disputes/SellerViewBuyerClaim.tsx` | Add `onError` fallback on `<img>` to show filename when image fails |
| `src/components/seller-disputes/SellerEvidenceSection.tsx` | Add `onError` fallback on `<img>` in `EvidenceFileCard` |
| `src/components/disputes/BuyerClaimSection.tsx` | Add same `onError` fallback for buyer-side dispute evidence images |
| `src/components/disputes/DeliveryProofSection.tsx` | Add same `onError` fallback for delivery proof images |

## Technical Detail

For image error fallback, each `<img>` tag gets:
```tsx
onError={(e) => {
  const target = e.currentTarget;
  target.style.display = 'none';
  target.parentElement?.classList.add('fallback-active');
}}
```
With a sibling fallback div that shows filename + icon when the image fails.

For the navigation fix:
```tsx
if (["seller_dispatched", "payment_secured", "seller_preparing_delivery"].includes(tx.transaction_status)) {
  navigate(`/seller/transactions/${tx.transaction_id}/delivery`);
}
```

