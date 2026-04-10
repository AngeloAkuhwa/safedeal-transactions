

# Replace Delivery Method with Multi-Select Supported Methods

## What changes

Replace the single delivery method dropdown on Step 4 with a checkbox list of delivery methods the seller's business supports. This means a product can support multiple delivery methods (e.g. both Pickup and Shipping), and the buyer picks their preferred one at purchase time.

## Changes

### `src/pages/SellerProductCreate.tsx`
- Change `deliveryMethod` state from `string` to `string[]` (array)
- Replace `<Select>` with a checkbox group using `<Checkbox>` components for: Pickup, Delivery, Courier/Shipping, Digital/Instant, Hand Delivery, Meetup
- Update `createMutation` payload to send `delivery_methods: deliveryMethods` (array) instead of `delivery_method`
- Rename step label from "Delivery & Settings" to "Settings"

### `supabase/functions/seller-products/index.ts`
- Accept `delivery_methods` (string array) instead of `delivery_method` (string)
- Store as JSON array in the existing `delivery_method` column (text field, store as JSON string)

### `supabase/functions/seller-product-detail/index.ts`
- Accept `delivery_methods` in PATCH, store as JSON string
- Return parsed array in GET response

### `src/services/seller-storefront.service.ts`
- Update `CreateProductPayload` interface: `delivery_methods?: string[]` instead of `delivery_method?: string`

No database migration needed -- the existing `delivery_method` text column can store a JSON array string.

