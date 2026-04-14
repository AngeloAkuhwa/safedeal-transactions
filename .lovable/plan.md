

# Build "Complete Your Purchase" Checkout Page

## Summary

Create a new full-page checkout review screen that authenticated buyers see after clicking "Buy with SafeDeal Protection." It mirrors the reference design exactly (minus the Delivery Fee line, per your model). Clicking "Confirm & Continue to Payment" creates a transaction and redirects to the existing Paystack payment page.

## Pricing Clarification

The reference image shows ₦12,300 for a ₦1,230,000 item. Our actual model would compute: tier rate 2.9% = ₦35,670, but **capped at ₦2,000**. So the fee displayed will be ₦2,000 (with a "capped" indicator). This is correct per your fee policy.

Payment Summary will show:
- Item Subtotal
- SafeDeal Protection Fee (computed via `computePricing()`)
- **Total Amount**

## Files to Create

### 1. `src/pages/StorefrontCheckout.tsx`
Full-page checkout matching the reference layout pixel-for-pixel:

**Layout:** BuyerSidebar + main content area with header ("← Back to Product" / "🔒 Secure Checkout")

**Left column (2/3):**
- **Order Summary** — product image (96×96 rounded), title, short description, category badge, stock badge, quantity display, line price
- **Seller Information** — avatar, full name, TRUSTED/Verified badge, star rating, transaction count
- **Delivery Method** — delivery method card with blue highlight, estimated days, "Insured Delivery" and "Real-time Tracking" badges
- **Purchase Agreement** — bordered section with blue accent, "Terms protected by SafeDeal escrow:" header, bullet list from `agreement_terms`

**Right column (1/3, sticky):**
- **Payment Summary** — Item Subtotal, SafeDeal Protection Fee (with "(capped)" badge when at ₦2,000), divider, Total Amount in bold
- **SafeDeal Protection card** — green-tinted card with 4 bullet points (escrow, 48hr window, refund protection, dispute support)
- **"Confirm & Continue to Payment" button** — gradient blue, lock icon, full width
- **Terms text** — small print about Terms of Service

**Data source:** Fetches product + seller data via `public-product-detail` edge function. Reads `qty` from URL search params.

**On confirm:** Calls `storefront-checkout` edge function → receives `share_token` → navigates to `/t/:shareToken/pay`

### 2. `src/services/storefront-checkout.service.ts`
- `createStorefrontTransaction(productId, quantity, sellerId)` — authenticated call to `storefront-checkout` edge function
- Returns `{ share_token, transaction_id }`

### 3. `supabase/functions/storefront-checkout/index.ts`
New edge function that creates a transaction from a storefront product purchase:
- Authenticates buyer via JWT
- Validates buyer role
- Fetches product (must be published, in stock, quantity available)
- Fetches seller profile
- Generates transaction code + share token
- Creates transaction record (`status: 'awaiting_payment'`, `money_status: 'not_secured'`)
- Creates related records: `transaction_items`, `transaction_pricing` (via `computePricing`), `transaction_delivery_terms`, `transaction_participants` (buyer + seller), `transaction_links`
- Sets `buyer_id` on transaction to authenticated user
- Returns `{ share_token, transaction_id }`
- Decrements product `stock_quantity`

Uses auto-transition pattern: skips `draft` → `awaiting_buyer` and goes straight to `awaiting_payment` since the buyer is already present and authenticated.

**State machine consideration:** The DB trigger enforces transitions. For storefront purchases, the transaction is inserted directly as `awaiting_payment` (not updated from draft), so the trigger doesn't fire on insert — only on updates.

## Files to Modify

### 4. `src/App.tsx`
- Add protected buyer route: `/store/:sellerSlug/:productSlug/checkout` → `StorefrontCheckout`

### 5. `src/pages/PublicProductDetail.tsx`
- Update `handleBuyCTA` for authenticated users: navigate to `/store/${sellerSlug}/${productSlug}/checkout?qty=${quantity}` instead of showing a toast

## No database changes needed
Existing transaction tables handle everything.

