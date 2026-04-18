
# Fix: Show product images & videos in Locked Agreement Snapshot

## Problem
Buyer sees empty image placeholders in `LockedSnapshotCard` → "Product Images" section. The agreement loads via `transaction-agreement` edge function but never returns the product media (images/videos) for buyer-specific offers.

## Root cause
The `transaction-agreement` edge function fetches `transaction_items` and `transaction_media`, but for **private-offer** transactions:
- `transaction_media` is empty (sellers attach media to **products**, not transactions, in the new offer flow).
- `buyer_specific_offer_items` stores `primary_media_url` (single thumbnail), but the offer's products hold the full image/video gallery in the `product_media` table.

So the snapshot card has nothing to render → falls back to 4 empty placeholders.

## Plan

### 1. Backend: enrich `transaction-agreement` with product media
File: `supabase/functions/transaction-agreement/index.ts`

- After fetching the transaction, look up linked offer:
  ```ts
  buyer_specific_product_offers WHERE transaction_id = tx.id
  ```
- If an offer exists, fetch its items + linked products + media:
  ```ts
  buyer_specific_offer_items (offer_id) → product_id[]
  product_media WHERE product_id IN (...) ORDER BY display_order
    JOIN files (file_url, secure_url, mime_type, original_file_name)
  ```
- Merge into response as a new `productMedia: [{ product_id, file_url, secure_url, mime_type, media_type, display_order }]` array.
- Also include `bundleItems` (snapshot rows) so multi-item bundles render properly instead of just `transaction_items.title`.
- Keep existing `media: transaction_media` for legacy non-offer transactions (fallback).

### 2. Service type update
File: `src/services/agreement.service.ts`
- Add `productMedia?: MediaItem[]` and `bundleItems?: BundleItem[]` to `AgreementData`.

### 3. UI: render images + videos
File: `src/components/agreement/LockedSnapshotCard.tsx`
- "Product Images" section:
  - Source priority: `data.productMedia` (offer flow) → `data.media` (legacy).
  - Filter `mime_type` starting with `image/` → grid of thumbnails (click to open lightbox/new tab).
  - Filter `mime_type` starting with `video/` → render `<video controls poster=…>` with native preview controls.
- Empty state only when both lists are empty.
- "Item Details" section:
  - If `bundleItems.length > 1`, render a small itemized list (title × qty @ unit price) instead of the single-line description.

### 4. No DB migration needed
All required tables (`product_media`, `files`, `buyer_specific_offer_items`) already exist with appropriate access via service role inside the edge function.

## Files touched
- `supabase/functions/transaction-agreement/index.ts` — fetch + return product media & bundle items
- `src/services/agreement.service.ts` — extend response type
- `src/components/agreement/LockedSnapshotCard.tsx` — render images grid + video player + bundle list

## Out of scope
- Lightbox component (use simple click-to-open in new tab; can upgrade later)
- Editing media after agreement lock (already prevented by edit lock)
