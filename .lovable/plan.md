

# Redesign CartCheckoutReview to Match Reference

## Summary

Fully redesign `src/pages/CartCheckoutReview.tsx` to match the uploaded reference screen. The current page is a minimal skeleton; the reference has a rich layout with summary stat cards, seller-grouped item cards with product images, collapsible fee breakdowns, and a detailed payment sidebar.

## Key Differences from Current

1. **Info banner** — blue banner below subtitle: "You are making one payment for multiple protected seller orders"
2. **Summary stat cards** — 4-column grid: Selected Items, Seller Groups, Subtotal, Protection Fee
3. **Fee info line** — "SafeDeal calculates protection fees separately for each seller order, then combines them into one checkout total"
4. **Seller group cards** — each has:
   - Large avatar with seller initial + colored gradient background
   - Seller name, verification badge (Verified Seller / Phone Verified), "A protected transaction will be created for this seller"
   - Item count + subtotal on right
   - Product items with image thumbnail (64px), title, description, qty, stock badge (In Stock / Low Stock), line total
   - Collapsible "Protection Fee Breakdown" section showing Paystack fee, Platform fee, total, non-refundable + cap notices
5. **Payment Summary sidebar** — Items Subtotal, Protection Fee (blue), Delivery Fee ("Calculated after payment"), Total Amount (bold large), SafeDeal Protection card with 4 check items, "Confirm & Pay ₦X" button showing total, disclaimer text
6. **No BuyerSidebar** — reference uses a top header bar (Back to Cart | SafeDeal logo | avatar). We keep BuyerSidebar for consistency but adopt the content layout.

## Data Requirements

The current `fetchCheckoutSession` fetches `checkout_sessions` and `checkout_session_items` via REST. The reference needs additional data per item: product title, description, image, stock status, and seller name/verification. The edge function data or the fetch query needs to be enriched.

**Approach**: Enrich the fetch to join product and seller data. Since we're using raw REST API calls, we'll fetch products and profiles in parallel after getting session items (product_id and seller_id are on checkout_session_items).

## File Changes

### `src/pages/CartCheckoutReview.tsx` — full rewrite

**Data fetching updates:**
- After fetching `checkout_session_items`, collect unique `product_id`s and `seller_id`s
- Fetch products: `GET /rest/v1/products?id=in.(ids)&select=id,title,short_description,primary_image,stock_quantity,reserved_quantity,status`
- Fetch seller profiles: `GET /rest/v1/profiles?id=in.(seller_ids)&select=id,display_name,phone_verified`
- Merge into items for rendering

**Layout:**
- Keep `BuyerSidebar` wrapper
- Header: "Back to Cart" link
- Title: "Review & Pay" + subtitle + blue info banner
- 4-column summary stats card (Selected Items, Seller Groups, Subtotal, Protection Fee)
- Info line about per-seller fee calculation
- 2/3 + 1/3 grid:
  - Left: seller group cards with product items, collapsible fee breakdown (using `Collapsible` from UI)
  - Right: sticky Payment Summary with subtotal, protection fee (blue), delivery fee (grey "Calculated after payment"), total, SafeDeal Protection card, Confirm & Pay button with total amount, disclaimer

**Seller group card structure:**
- Avatar with first letter of seller name + gradient bg
- Seller name + verification badge + transaction notice
- Item count + group subtotal on right
- Each product: 64px image, title, description, qty, stock badge, line total
- Collapsible fee breakdown: Paystack fee, Platform fee, total, non-refundable/cap notices

**Confirm & Pay button:** Shows total amount in button text: "Confirm & Pay ₦X,XXX"

