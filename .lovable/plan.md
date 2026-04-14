

# Fix "Session not found" on Cart Checkout Review

## Root Cause

Three issues are causing the checkout review page to fail:

1. **Wrong user context**: The `CartCheckoutReview` page queries `checkout_sessions` via the Supabase REST API with the user's JWT. RLS enforces `auth.uid() = buyer_id`. If you're logged in as the seller (which the session logs confirm — `seller@samplestore.test`), the query returns empty and triggers "Session not found". However, this will also fail for the buyer because of issue #2.

2. **Wrong column names in profile fetch**: The review page queries `profiles` for `display_name` and `phone_verified` — neither column exists. The correct columns are `full_name` (on profiles) and `phone_verified` (on `account_verifications`). This causes the REST query to return an error/empty, breaking the seller info display.

3. **No product SELECT RLS for buyers**: The `products` table likely lacks a policy allowing buyers to read published products by ID, which would cause the product detail fetch to return empty.

## Fix Plan

### 1. `src/pages/CartCheckoutReview.tsx` — Fix data fetching

- Change profile query from `select=id,display_name,phone_verified` to `select=id,full_name` (drop `phone_verified` since it's not on profiles)
- For verification badges, either skip them or join `account_verifications` via a separate query
- Update all references from `display_name` to `full_name` in the rendering code
- Add better error logging so the actual REST response is visible in console

### 2. Switch from REST API to edge function approach

Since RLS makes cross-table queries complex, the better fix is to create a dedicated edge function `checkout-review` that:
- Authenticates the buyer
- Fetches the checkout session, items, products, seller profiles, and verification status using the service role
- Returns enriched data in one response

This mirrors how every other page in the app works (edge functions for data fetching).

### Recommended approach: New `checkout-review` edge function

**`supabase/functions/checkout-review/index.ts`**:
- Accept GET with `?session_id=...`
- Verify buyer auth + role
- Confirm `checkout_sessions.buyer_id = authenticated user`
- Fetch session items, join products (title, image, stock), seller profiles (full_name), account_verifications (phone_verified)
- Return complete enriched payload

**`src/pages/CartCheckoutReview.tsx`**:
- Replace raw REST calls with a single fetch to `checkout-review?session_id=...`
- Fix `display_name` → `full_name` references
- Fix `phone_verified` to come from the enriched response

### 3. No migration needed

Tables and RLS policies are already correct. The fix is purely in the data-fetching layer and column name references.

