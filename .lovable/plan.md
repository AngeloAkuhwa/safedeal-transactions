

# Multi-Item Cart Checkout with Grouped Payment

## Summary

Transform the single-product checkout into a true multi-item cart with grouped checkout. Buyers select items from their cart, pay once, and SafeDeal creates separate per-seller transactions underneath for independent fulfillment, disputes, and payouts.

## Architecture Decision

**Option A: One payment, multiple transactions** — chosen because each seller relationship needs independent escrow, delivery tracking, dispute resolution, and payout handling.

## Database Changes

### New Tables

**1. `cart_items`** — buyer's saved cart

```sql
CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, product_id)
);
-- RLS: buyers CRUD own rows only
-- updated_at trigger
```

**2. `checkout_sessions`** — groups selected cart items into one payment attempt

```sql
CREATE TABLE public.checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- pending | payment_initiated | completed | expired | cancelled
  currency_code text NOT NULL DEFAULT 'NGN',
  subtotal_amount numeric(18,2) NOT NULL DEFAULT 0,
  total_protection_fee numeric(18,2) NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: buyers SELECT/INSERT own rows
-- updated_at trigger
```

**3. `checkout_session_items`** — line items within a checkout session

```sql
CREATE TABLE public.checkout_session_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid NOT NULL REFERENCES checkout_sessions(id),
  cart_item_id uuid REFERENCES cart_items(id),
  product_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(18,2) NOT NULL,
  line_total numeric(18,2) NOT NULL,
  transaction_id uuid,  -- set after transaction creation
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: via checkout_session buyer ownership
```

### Schema Additions

**4. `transactions` table** — add columns:
- `source_product_id uuid` — links storefront purchases to product
- `checkout_session_id uuid` — links to grouped checkout session

**5. `payments` table** — add column:
- `checkout_session_id uuid` — references the grouped checkout

**6. Enable realtime on `products`**:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
```

## Edge Functions

### 7. `buyer-cart/index.ts` (new)

Cart CRUD:
- **GET**: Return all cart items joined with product data (title, price, stock, status, primary image, seller name). Compute `available_quantity = stock_quantity - reserved_quantity` per item.
- **POST `add`**: Validate product is published, active, public, `quantity <= available_quantity`. Upsert `cart_items`.
- **POST `remove`**: Delete cart item. If a linked `awaiting_payment` transaction exists for same buyer+product, cancel it and release reserved stock.
- **POST `update_quantity`**: Validate `quantity <= available_quantity`. Update cart row.

### 8. `cart-checkout/index.ts` (new)

Multi-item grouped checkout:
1. Accept `{ cart_item_ids: string[] }` — selected items to check out
2. Validate ALL selected items: stock available, product published/active/public, price snapshot
3. If ANY item fails validation: return error listing which items need attention (no partial checkout)
4. Group items by `seller_id`
5. Create one `checkout_session` with totals
6. For each seller group:
   - Check for existing `awaiting_payment` transaction for same buyer + seller + product(s) — reuse if found (idempotency)
   - Otherwise create new transaction with `source_product_id`, `checkout_session_id`
   - Create `transaction_items`, `transaction_pricing`, `transaction_delivery_terms`, `transaction_participants`, `transaction_links`, `escrow_states`
   - Reserve stock (`reserved_quantity += quantity`)
7. Create `checkout_session_items` linking each line to its transaction
8. Compute aggregate pricing: sum of all per-transaction protection fees
9. Return `{ checkout_session_id, transactions: [{id, share_token, transaction_code, seller_name, items, subtotal}], totals }`

### 9. `initiate-paystack-payment/index.ts` — update

Add support for `checkout_session_id` as an alternative to `shareToken`:
- If `checkout_session_id` provided: fetch all linked transactions, validate all are `awaiting_payment`, sum `total_amount` across all, create single Paystack payment
- Set `checkout_session_id` on the `payments` record
- Store `checkout_session_id` in Paystack metadata

### 10. `paystack-webhook/index.ts` — update

After successful payment with a `checkout_session_id`:
- Find all transactions linked to that checkout session
- For each transaction: update status to `payment_secured`, update escrow, create ledger entries, create agreement snapshot, notify seller
- For each product: decrement `stock_quantity`, release `reserved_quantity`. Set `status = 'out_of_stock'` (keep `is_active = true`) if stock hits 0
- Delete purchased `cart_items` rows
- Update `checkout_sessions.status = 'completed'`

### 11. `storefront-checkout/index.ts` — update

Make idempotent:
- Before creating transaction, check for existing `awaiting_payment` tx where `buyer_id + source_product_id` match
- If found with same quantity: return existing
- If found with different quantity: revalidate stock/price, update, return existing
- Set `source_product_id` on new transactions

## Frontend Changes

### 12. `src/services/cart.service.ts` (new)

- `getCartItems()` — GET buyer-cart
- `addToCart(productId, quantity)` — POST add
- `removeFromCart(productId)` — POST remove
- `updateCartQuantity(productId, quantity)` — POST update
- `checkoutSelected(cartItemIds: string[])` — POST cart-checkout

### 13. `src/pages/BuyerCart.tsx` (new)

Full cart page at `/dashboard/cart`:
- Each item: checkbox, product image, title, unit price, quantity selector, line total
- Stock status badges per item: In Stock / Low Stock / Quantity Exceeds Stock / Sold Out
- **Checkbox selection**: individual checkboxes + select all
- **Selected items summary panel**: grouped subtotal, total protection fee, grand total
- **Seller grouping labels** within the list
- **Action buttons**: Remove Selected, Checkout Selected
- **Validation warnings**: unavailable items highlighted, quantity mismatch prompts
- **Realtime**: subscribe to `products` table changes — badges update live
- Empty state when cart is empty

### 14. `src/pages/CartCheckoutReview.tsx` (new)

Post-selection review page at `/dashboard/cart/checkout`:
- Shows all selected items grouped by seller
- Per-seller subtotals and protection fee breakdown
- Grand total across all sellers
- Non-refundable fee notice
- Trust/escrow protection card
- "Confirm & Pay" button → calls `initiate-paystack-payment` with `checkout_session_id`

### 15. `src/pages/PublicProductDetail.tsx` — update

- On mount (authenticated): check if product is in buyer's cart
- If in cart: show "View in Cart" button → navigates to `/dashboard/cart`
- If not in cart: show "Add to Cart" button → calls `addToCart()`, swaps to "View in Cart"

### 16. `src/pages/StorefrontCheckout.tsx` — update

- Add realtime subscription on `products` for current product
- If stock drops to 0: show out-of-stock alert, disable confirm
- This page remains for single-product direct checkout (bypassing cart)

### 17. `src/components/marketplace/BuyerSidebar.tsx` — update

- Add "Cart" nav item with `ShoppingCart` icon → `/dashboard/cart`
- Badge shows **unique cart line count** (number of distinct products)

### 18. `src/App.tsx` — update

- Add routes: `/dashboard/cart` → `BuyerCart`, `/dashboard/cart/checkout` → `CartCheckoutReview`

## Key Rules

| Rule | Detail |
|---|---|
| Availability | `available_quantity = stock_quantity - reserved_quantity` everywhere |
| Stock at 0 | `status = 'out_of_stock'`, `is_active` unchanged, product stays visible |
| Transaction grouping | One transaction per seller per checkout session |
| Payment | One Paystack payment per checkout session covering all transactions |
| Idempotency | Reuse existing `awaiting_payment` tx for same buyer+product |
| Partial failure | Block entire checkout if any item fails validation; tell buyer which items need attention |
| Cart badge | Unique line count, not summed quantity |
| Remove from cart | Cancel linked tx only if `awaiting_payment` + same buyer + same product |
| Fee model | ₦250 floor, ₦2,500 cap, non-refundable — applied per-transaction, then summed |
| Expiry cleanup | Release reserved stock, null cart references, cart item persists for fresh checkout |
| Checkout model | Multi-item cart, one grouped payment, separate per-seller transactions |

## Flow

```text
Product Page → "Add to Cart" → cart_items row
Cart Page → select items → "Checkout Selected"
  → cart-checkout edge function validates all, creates checkout_session + per-seller transactions
  → CartCheckoutReview page shows grouped summary
  → "Confirm & Pay" → initiate-paystack-payment with checkout_session_id
  → Paystack popup → webhook → all transactions activated, stock deducted, cart cleaned
```

