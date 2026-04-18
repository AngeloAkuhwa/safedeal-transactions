
# Continue Batch 5 — Final Polish Pass

Picking up from the approved refined spec. Backend + resolver + edit guard are in place. Remaining work is UI polish + bundle support + navigation entry points.

## What's left

### 1. Multi-item builder in `SellerCreateTransaction.tsx`
- Add "Add another item" button in step 2 (Item Details)
- Each item: title, short description, quantity, unit price, condition summary, primary media
- Items stored as array in wizard state
- Send `items[]` array to `create-transaction` publish action
- Step 3 (Agreement) and Step 4 (Review) updated to show bundle subtotal
- Service `publishTransaction` already accepts items array — verify shape

### 2. Wizard rebrand → "Create Private Offer"
- Page title, breadcrumb, hero copy, all step headers updated
- Submit CTA: "Create Private Offer"
- `TransactionSuccess.tsx` modal:
  - Headline: "Private Offer Created"
  - Primary asset: copyable `offer_url` with WhatsApp + Email + Copy actions
  - Remove the secondary transaction `share_url` from this view (transaction doesn't exist yet)
  - Add "View in Private Offers" link → `/seller/offers`

### 3. `seller-offers` UI surface
- New page `SellerPrivateOffers.tsx` at `/seller/offers` — list with status filters, item count column, expiry, intended buyer email
- New page `SellerOfferDetail.tsx` at `/seller/offers/:offerId` — bundle items + offer events + cancel/regenerate token actions (gated by edit matrix from §5 of spec)
- Wire into `seller-offers` edge fn (already returns nested items + tx summary per spec)

### 4. Navigation entry points
- `SellerNav.tsx` → add "Private Offers" link with offer count badge
- `BuyerNav.tsx` → add "Private Offers" link with unread count badge
- Seller dashboard quick actions → swap "Create Protected Transaction" → "Create Private Offer"

### 5. Storefront "Private" badge + filter
- `SellerStorefront.tsx`: add "All / Public / Private" filter chip, render `<Badge variant="outline">Private</Badge>` on cards where `visibility_type='buyer_specific'`
- `seller-products` LIST already returns `visibility_type` — verify and add to card prop
- `MarketplaceProductCard.tsx` / `SellerProductCard.tsx` → conditional badge

### 6. Admin bundle-aware detail
- `AdminOfferDetail.tsx` → render items table with snapshot fields (title, qty, unit price, line total, current product status)
- `AdminOffers.tsx` list → add "Items" column

### 7. Verify edge fns match locked spec
- `claim-offer` → confirm reuse-or-create rule matches table in §2 (draft / awaiting_buyer / awaiting_payment → reuse; cancelled / timed_out → create new; payment_secured+ → resume to detail)
- `paystack-webhook` → confirm offer flips to `purchased` only after hold success
- `create-transaction` publish → confirm no transaction created (only products + offer + offer_items + event)

## Files to touch

**Modify:**
- `src/pages/SellerCreateTransaction.tsx` — multi-item, rebrand
- `src/components/seller/TransactionSuccess.tsx` — offer-link primary
- `src/components/seller/SellerNav.tsx` — Private Offers link
- `src/components/dashboard/BuyerNav.tsx` — Private Offers link
- `src/pages/SellerStorefront.tsx` — filter chip + Private badge
- `src/components/storefront/SellerProductCard.tsx` — Private badge
- `src/services/create-transaction.service.ts` — multi-item payload (verify)
- `src/services/seller-offers.service.ts` — detail + cancel/regenerate
- `src/pages/AdminOfferDetail.tsx` — items table
- `src/pages/AdminOffers.tsx` — items column
- `src/App.tsx` — add `/seller/offers`, `/seller/offers/:offerId`
- `supabase/functions/seller-offers/index.ts` — verify items + tx summary in response

**Create:**
- `src/pages/SellerPrivateOffers.tsx`
- `src/pages/SellerOfferDetail.tsx`

## Out of scope (deferred)
- Background scheduler for `expire_stale_offers()` (function exists; called on-read for now)
- Email notifications to buyers on offer creation
- Offer duplication action

Reply **"Approved"** to implement.
