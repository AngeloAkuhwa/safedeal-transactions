## Problem

Clicking **Checkout Selected Items** on `/dashboard/cart` calls the `cart-checkout` edge function with only the cart item IDs. The Air Jordan product has three delivery methods enabled (`["pickup","delivery","courier_shipping"]`), so the backend correctly rejects with:

```
"Delivery method required (multiple options)"
```

The cart UI never asks the buyer to pick a delivery method (or an address/phone), even though `cart-checkout` already accepts a `delivery_selections` array. Single-product checkout (`StorefrontCheckout.tsx`) does this correctly; cart checkout skipped it.

This is purely a missing UI step in the cart flow — no backend logic changes needed.

## Fix — collect delivery selection per cart item before calling `cart-checkout`

### 1. Add a "Delivery options" step on the cart page

In `src/pages/BuyerCart.tsx`:

- For each selected cart item whose product has more than one enabled delivery method, render an inline delivery picker directly inside the cart row (radio group of the product's enabled methods, mapped through `resolveDeliveryMethod`). When the product has exactly one enabled method, auto-select it silently.
- When the chosen method is `courier_shipping` or `delivery`, show an address form (line1, line2, city, state, postal_code, country=NG) under the picker.
- When the chosen method is `pickup`, `meetup`, or `hand_delivery`, show an optional contact-phone field (default to the buyer's profile phone).
- Track selections in component state keyed by `cart_item_id`:
  ```ts
  Record<string, { delivery_method: string; delivery_address?: {...}|null; contact_phone?: string|null }>
  ```

### 2. Block the checkout button until each selected item is valid

Update `handleCheckout` in `BuyerCart.tsx` so it:

- Iterates the selected cart items, confirms each has a method chosen, and (when required) a complete address.
- Surfaces inline validation errors on the offending rows + a toast (`"Choose delivery options for all selected items"`); does not call the edge function.
- When valid, builds the `delivery_selections` array and passes it through.

### 3. Forward selections through the service layer

In `src/services/cart.service.ts`, extend `checkoutSelected` to accept and forward the selections:

```ts
export type CartDeliverySelection = {
  cart_item_id: string;
  delivery_method: string;
  delivery_address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country_code?: string } | null;
  contact_phone?: string | null;
};

export async function checkoutSelected(
  cartItemIds: string[],
  deliverySelections: CartDeliverySelection[],
) { ... body: JSON.stringify({ cart_item_ids, delivery_selections }) }
```

The `cart-checkout` edge function already reads `body.delivery_selections` and matches by `cart_item_id` / `product_id`, so no edge-function change is required.

### 4. Preserve the chosen selections through the review step

The selections are needed only at checkout-creation time (cart-checkout writes them into `transaction_delivery_terms` immediately). `CartCheckoutReview` continues to display whatever the backend stored — no change needed there.

## Out of scope

- No changes to `cart-checkout`, `storefront-checkout`, `verify-paystack-payment`, or `paystack-webhook` (the stock/payment-fee fixes from earlier stay as-is).
- No DB schema changes.
- No change to the single-item `/store/.../checkout` flow.

## Validation

1. Reload `/dashboard/cart` with the Air Jordan item. The card now shows a delivery-method radio group (Pickup / Delivery / Courier shipping) and, when needed, an address form.
2. Without choosing a method, the **Checkout Selected Items** button shows a validation toast and does not POST.
3. After choosing **Pickup** (or any single method), clicking checkout succeeds, navigates to `/dashboard/cart/checkout?session=...`, and the resulting transaction's delivery terms reflect the chosen method.
4. The earlier validation error `"Delivery method required (multiple options)"` no longer occurs.