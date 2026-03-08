

# Buyer Transactions -- Implementation Plan

The provided spec is fully aligned with the previously refined plan. No gaps remain. Here is the implementation-ready plan.

## Files to Create

### 1. `supabase/functions/buyer-transactions/index.ts`

Edge function using the same proven pattern as `buyer-dashboard`:
- **Auth**: `adminClient.auth.getUser(token)` + `has_role(userId, 'buyer')` RPC
- **CORS**: Same headers as buyer-dashboard
- **Config**: `verify_jwt = false` in config.toml (validate in code per project pattern)

**3-phase query strategy** (all scoped to `buyer_id = userId`):

**Phase 1 -- Status counts** (partial-failure safe, defaults to zeros):
- Fetch all buyer transaction `(id, status, dispute_status)`
- Compute in memory: `all`, `processing` (awaiting_buyer/awaiting_payment/payment_secured/seller_preparing_delivery), `in_transit` (seller_dispatched), `delivered` (delivered_awaiting_verification), `completed`, `disputed` (dispute_status != 'none'), `cancelled` (cancelled + timed_out)

**Phase 2 -- Filtered paginated list** (FAILURE = 500 error, not empty list):
- Parse query params from URL: `search`, `transaction_status`, `money_status`, `page` (default 1, clamp 1+), `page_size` (default 8, clamp 1-50), `sort_by` (default created_at), `sort_order` (default desc)
- Map UI tab to enum arrays for filtering
- Search across `transaction_code` (ILIKE). For item title and seller name search: pre-query `transaction_items` and `profiles` to get matching transaction IDs, then use `.in("id", matchedIds)` combined with `or`
- Return with `count: "exact"` for pagination

**Phase 3 -- Batch enrichment** (partial-failure safe, fallback "Untitled Item" / "Unknown Seller" / 0 / "NGN"):
- Collect transaction IDs + seller IDs from Phase 2
- Parallel fetch: `transaction_items` (title, category:description, quantity), `transaction_pricing` (buyer_total_amount, currency_code), seller `profiles` (full_name)
- Build maps, merge into rows

**`primary_action` derivation** (transaction_status based):
- `awaiting_payment` → `continue_payment`
- `payment_secured` / `seller_preparing_delivery` / `seller_dispatched` → `track_order`
- `delivered_awaiting_verification` → `verify_item`
- `disputed` or `dispute_status != 'none'` → `view_dispute`
- `completed` → `view_receipt`
- default → `view_details`

### 2. `src/services/transactions.service.ts`

- Export `BuyerTransactionFilters` interface (search, transaction_status, money_status, page, page_size, sort_by, sort_order)
- Export `BuyerTransactionRow`, `StatusCounts`, `BuyerTransactionsResponse` interfaces
- `getBuyerTransactions(filters)`: get session, invoke edge function with auth header, pass filters as body (edge function reads from body), throw on auth/server errors

### 3. `src/pages/BuyerTransactions.tsx`

- Fetch buyer profile from React Query cache (`buyer-dashboard` key) or lightweight profile query for nav
- Filter state via `useState`, debounced search (300ms)
- `useQuery(["buyer-transactions", filters])` drives the table
- States: loading skeleton, error + retry, empty (no purchases ever), filter-empty (no matches for current filters)
- Layout: `BuyerNav` → header (title + subtitle) → filters → table → pagination → Footer

### 4. `src/components/transactions/TransactionFilters.tsx`

- Search input with placeholder "Search by transaction ID, item name, or seller..."
- Transaction Status dropdown (All Statuses, Awaiting Payment, Payment Secured, Seller Preparing Delivery, Seller Dispatched, Awaiting Verification, Disputed, Completed, Cancelled)
- Money Status dropdown (All Money Statuses, Not Secured, Payment Pending, Funds Held in Escrow, Funds Frozen, Funds Releasing, Funds Released, Refund Pending, Refund Issued)
- Clear Filters button
- Status pill tabs with counts from API (All, Processing, In Transit, Delivered, Completed, In Dispute, Cancelled)

### 5. `src/components/transactions/TransactionTable.tsx`

- Columns matching HTML: Transaction/Item Details (code + title + category + qty + date), Seller, Amount, Transaction Status badge, Money Status badge, Action button
- Row click → `/dashboard/transactions/{id}` (placeholder route for now)
- Action button color/label based on `primary_action`
- Mobile: card layout

### 6. `src/components/transactions/TransactionStatusBadge.tsx`

Color-coded badge for transaction status values.

### 7. `src/components/transactions/MoneyStatusBadge.tsx`

Color-coded badge for money status values (green: held/released, amber: pending, red: frozen).

### 8. `src/components/transactions/TransactionPagination.tsx`

- "Showing X-Y of Z transactions" text
- Previous/Next + numbered page buttons

### 9. `src/components/transactions/TransactionsEmptyState.tsx`

Two variants:
- **No data**: "You do not have any protected purchases yet." + "Back to Dashboard" + "Learn how SafeDeal works" CTAs
- **No filter match**: "No purchases match your current filters." + Clear Filters button

## Files to Modify

### `src/components/dashboard/BuyerNav.tsx`

Add `useLocation()` to highlight the active nav link (compare `pathname` with `link.href`).

### `src/App.tsx`

Add route inside existing buyer-protected group:
```tsx
<Route path="/dashboard/transactions" element={<BuyerTransactions />} />
```

## No database migrations needed

Access is enforced in the edge function via `buyer_id = userId` scoping. Existing RLS policies on `transactions` do not block the service-role admin client used in the edge function.

