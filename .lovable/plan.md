
# Fix plan: rider confirmation page shows "Transaction not found"

## Diagnosis
The rider link itself is being issued and rotated correctly now:
- `seller-transaction-detail` is returning an active `rider_link`
- `rotate-delivery-token` successfully creates a fresh token
- the rider page loads, so routing is fine

The remaining failure is inside `supabase/functions/delivery-token-lookup/index.ts`.

### Root cause
`delivery-token-lookup` fetches:
```ts
admin.from("transactions").select("id, transaction_code, status, item_title")
```
But the `transactions` table does not have an `item_title` column. The item title lives in `transaction_items` (and can also exist in the locked agreement snapshot).

Because that query error is currently ignored inside `Promise.all`, `tx` becomes null and the function returns the misleading message:
- `"Transaction not found"`

So the page is not failing because the token is bad anymore; it is failing because the lookup function is querying the wrong column and masking the real error.

## What I will change
1. **Fix the lookup query**
   - Update `delivery-token-lookup` to fetch transaction base data from `transactions` using only real columns
   - Fetch item title separately from `transaction_items`
   - Add fallback to agreement snapshot title or `"Order item"` if needed

2. **Harden error handling**
   - Stop ignoring errors from the transaction/buyer/seller/item fetches
   - Return a real backend error only when the transaction truly cannot be loaded
   - Log the failing branch clearly so this kind of issue is visible next time

3. **Keep the response shape unchanged**
   - Continue returning:
     - `transaction_code`
     - `item_title`
     - `seller_name`
     - `buyer_name_first`
     - `masked_buyer_phone`
     - `has_phone`
     - `token_status`
   - So no frontend API contract changes are required

4. **Regression coverage**
   - Add a focused edge-function test for `delivery-token-lookup` covering:
     - valid token + transaction item title
     - fallback title path
     - invalid token path

## Files to update
- `supabase/functions/delivery-token-lookup/index.ts`
- optionally: `supabase/functions/delivery-token-lookup/*test*.ts` for regression coverage

## Technical implementation details
- Replace:
  ```ts
  .from("transactions").select("id, transaction_code, status, item_title")
  ```
  with:
  - transaction query: `id, transaction_code, status`
  - separate `transaction_items` query: `title`
- Handle each query result explicitly instead of silently destructuring `data`
- Prefer `transaction_items.title` for the rider screen since that is the real source of item display data in the rest of the app

## Expected outcome
After this fix, opening the rider confirmation link should load the correct order details instead of showing:
- `Transaction not found`

The rider should then be able to:
- view the delivery info
- send OTP to the buyer
- complete handoff confirmation normally
