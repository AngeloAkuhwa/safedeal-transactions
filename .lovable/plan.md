

# Update SellerProductDetail: Multi-Select Delivery Methods

## Problem
The product edit page (`SellerProductDetail.tsx`) still uses a single `<Select>` dropdown for delivery method, while the create page was updated to use a multi-select checkbox grid.

## Changes

### `src/pages/SellerProductDetail.tsx`
1. Change `deliveryMethod` state from `string` to `string[]`
2. Import `Checkbox` from `@/components/ui/checkbox`
3. Replace the delivery method `<Select>` (lines 254-264) with the same checkbox grid used in `SellerProductCreate` — 6 options: Pickup, Delivery, Courier/Shipping, Digital/Instant, Hand Delivery, Meetup
4. Update `useEffect` initializer (line 69) to parse the JSON array from the API: `setDeliveryMethods(JSON.parse(p.delivery_method || '[]'))` with a fallback for legacy single strings
5. Update `handleSave` payload to send `delivery_methods: deliveryMethods` instead of `delivery_method: deliveryMethod`
6. Rename card title from "Delivery & Settings" to "Settings"

No backend or migration changes needed — the edge function already handles `delivery_methods` as a JSON array from the create flow update.

