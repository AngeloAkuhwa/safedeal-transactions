

# Buyer Disputes Dashboard -- Implementation Plan

## Overview

Build the Buyer Disputes Dashboard at `/dashboard/disputes` following the exact patterns from BuyerNotifications and BuyerTransactions. One combined edge function, service layer, and frontend components matching the uploaded HTML design.

No database migration needed -- all required tables exist (`disputes`, `transactions`, `transaction_items`, `transaction_pricing`, `profiles`, `dispute_responses`).

## Files to Create

### 1. `supabase/functions/buyer-disputes/index.ts`

Same auth pattern as buyer-transactions (Bearer token → `adminClient.auth.getUser` → `has_role('buyer')`).

**Ownership scoping**: Fetch buyer's transaction IDs via `transactions.buyer_id = userId`, then scope all dispute queries to those IDs.

**Summary counts** (partial-failure safe, zeros on error):
- `open_count`: disputes where `status in ('open', 'seller_response_pending')` and `transaction_id in buyerTxIds`
- `under_review_count`: `status = 'under_review'`
- `resolved_count`: `status = 'resolved'`
- `funds_frozen_count`: count of disputes whose linked transaction has `money_status = 'funds_frozen'` (sourced from `transactions.money_status`)

**Filtered paginated list**:
- Params: `page`, `page_size`, `status` (all/open/seller_response_pending/under_review/resolved), `search`
- Query `disputes` where `transaction_id in (buyerTxIds)`, filter by status if not "all"
- Search (MVP): scoped enrichment + in-memory matching across `disputes.description`, `disputes.reason` (mapped to label), `transactions.transaction_code`, `transaction_items.title`, `profiles.full_name`. Pre-search matching tx IDs, then filter disputes by matched tx IDs OR description ILIKE.
- Paginate with `count: "exact"`, sort by `opened_at desc`

**Enrichment** (partial-failure safe via `Promise.allSettled`):
- `transactions(id, transaction_code, status, money_status, seller_id)` -- money_status is the dashboard source
- `transaction_items(transaction_id, title)` -- first item per tx
- `transaction_pricing(transaction_id, buyer_total_amount)` -- amount display
- `profiles(id, full_name, avatar_url)` -- seller display
- `dispute_responses(dispute_id)` -- existence check for seller response status

**Seller response status derivation**:
- Row exists in `dispute_responses` → `'responded'`
- No row AND dispute `status = 'seller_response_pending'` → `'pending'`
- Otherwise → `'not_responded'`

**Reason label mapping**: `wrong_item_received` → "Wrong item received", `damaged_item_received` → "Damaged item", `item_not_as_described` → "Item not as described", `item_not_delivered` → "Item not delivered", `incomplete_order` → "Incomplete order", `suspected_fake_item` → "Suspected fake item", `other` → "Other"

**CTA resolution**:
- `status = 'resolved'` → label "View Resolution", route `/dashboard/disputes/{disputeId}`
- else → label "View Dispute", route `/dashboard/disputes/{disputeId}`
- Secondary always: "View Transaction" → `/dashboard/transactions/{transactionId}`

**Response shape** matches the approved plan contract with `summary`, `items[]`, `pagination`.

### 2. `src/services/disputes.service.ts`

Interfaces (`BuyerDisputeFilters`, `BuyerDisputeItem`, `BuyerDisputeSummary`, `BuyerDisputesResponse`) and `getBuyerDisputes(filters)` invoking `buyer-disputes` with auth header. Same pattern as `notifications.service.ts`.

### 3. `src/pages/BuyerDisputes.tsx`

Same structure as BuyerNotifications:
- BuyerNav with cached dashboard data
- Hero: destructive gradient (`bg-destructive`), title "My Disputes", subtitle, "Dispute Help" button
- Summary cards at `-mt-6`
- Trust banner (primary bg, shield icon, 3 bullet points matching HTML)
- Filters card
- Disputes table
- Empty/error states
- Footer
- React Query: `useQuery(["buyer-disputes", debouncedFilters])`, debounced search, page reset on filter change

### 4. `src/components/disputes/BuyerDisputeSummaryCards.tsx`

4-card grid matching HTML: Open Disputes (Scale, destructive), Under Review (Hourglass, warning), Resolved (CheckCircle, success), Funds Frozen (Lock, primary). Each with status badge pill top-right, `text-3xl font-bold` count, `text-sm` label.

### 5. `src/components/disputes/BuyerDisputeFilters.tsx`

Card with 4-column grid (matching HTML): Search input, Status dropdown (All/Open/Seller Response Pending/Under Review/Resolved), Date Range (disabled "coming soon"), Outcome (disabled "coming soon"). Footer row with count + Reset/Apply buttons. MVP: only Search and Status are functional.

### 6. `src/components/disputes/BuyerDisputeList.tsx`

Table matching HTML with 9 columns: Dispute ID (`#DSP-` + first 8 UUID chars, display only), Transaction (code in primary + date), Item (title + amount), Seller (avatar + name), Reason (human label), Status (badge with icon), Money Status (badge with icon), Date Opened (formatted + relative), Action (red "View Dispute" for active, grey "View Resolution" for resolved). Table header section with list icon + "All Disputes" title.

### 7. `src/components/disputes/BuyerDisputeEmptyState.tsx`

Two variants matching HTML: `no-data` (Scale icon, "No Disputes Yet", helper text, "Learn About Disputes" + "Back to Dashboard" CTAs) and `no-filter-match` ("Clear Filters" button).

### 8. `src/components/disputes/DisputeStatusBadge.tsx`

Badge with icon per status: `open` → Scale, destructive; `seller_response_pending` → Clock, warning; `under_review` → Hourglass, warning; `resolved` → CheckCircle, success.

### 9. `src/components/disputes/DisputeMoneyStatusBadge.tsx`

Badge with icon per money status: `funds_frozen` → Lock, warning; `refund_pending` → Clock, warning; `refund_issued` → ArrowLeftRight, success; `funds_releasing` → ArrowLeftRight, success; `funds_released` → ArrowLeftRight, muted. Reuses existing `MoneyStatusBadge` color patterns.

## Files to Modify

### `src/App.tsx`
Add `<Route path="/dashboard/disputes" element={<BuyerDisputes />} />` inside the buyer-protected group.

### `supabase/config.toml`
Add:
```toml
[functions.buyer-disputes]
verify_jwt = false
```

