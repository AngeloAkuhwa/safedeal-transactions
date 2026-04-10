

# Seller Disputes Screen — Implementation Plan

## Summary
Build a full Seller Disputes page at `/seller/disputes` with a new edge function (`seller-disputes`) for data, a service layer, and a component-rich page following the exact SafeDeal design patterns from SellerTransactions, SellerPayouts, and BuyerDisputes.

## Technical Details

### 1. Edge Function: `supabase/functions/seller-disputes/index.ts`
Mirror the `buyer-disputes` edge function but scoped to seller:
- Auth + role check for `seller`
- Scope disputes via `transactions.seller_id = userId`
- Summary: `open_count`, `awaiting_response_count`, `under_review_count`, `resolved_count`, `blocked_payout_amount`
- Filters: search, status, reason, date range, action-needed toggle
- Enrichment: buyer profiles, transaction items, pricing, dispute responses (to determine seller response state), seller_response_due_at from disputes table
- Blocked payouts: query transactions in disputed state with money_status = `funds_frozen` and join pricing for amounts
- Return: `summary`, `items[]`, `action_needed[]`, `blocked_payouts[]`, `pagination`

### 2. Service: `src/services/seller-disputes.service.ts`
- Types for `SellerDisputeItem`, `SellerDisputeSummary`, `SellerDisputeBlockedPayout`, `SellerDisputeActionItem`, filter types, response type
- `getSellerDisputes(filters)` function invoking the edge function

### 3. Page: `src/pages/SellerDisputes.tsx`
Layout follows SellerPayouts pattern (nav, header, metrics, info banner, two-column with table + sidebar):

- **SellerNav** with Disputes active
- **Hero header** — gradient background matching SellerTransactions style, title "Disputes", subtitle with trust line
- **Summary Cards** (4-5) — same card pattern as SellerPayouts `SummaryCard`: Open Disputes, Awaiting Your Response (urgent), Under Review, Resolved, Payouts Blocked (amount)
- **Trust Banner** — same card style as Payouts "How Payouts Work" (`Card` with `border-primary/10 bg-primary/[0.02]`), 3 trust bullets with check icons
- **Two-column layout** (`lg:grid-cols-3`):
  - **Left (col-span-2)**: Filter row + Disputes table in a Card
  - **Right sidebar**: Action Needed panel + Blocked Payouts panel

### 4. Components (all in `src/components/seller-disputes/`)

| Component | Purpose |
|---|---|
| `SellerDisputeSummaryCards.tsx` | 5 metric cards |
| `SellerDisputeTrustBanner.tsx` | "How SafeDeal Handles Disputes" info card |
| `SellerDisputeFilters.tsx` | Search, status, reason, date, action-needed filters |
| `SellerDisputeTable.tsx` | Main table with columns: Dispute ID, Txn Code, Buyer, Item, Reason, Status, Money Impact, Response Deadline, Date, Action |
| `SellerDisputeActionPanel.tsx` | Right sidebar "Action Needed" card |
| `SellerDisputeBlockedPanel.tsx` | Right sidebar "Blocked by Dispute" card |
| `SellerDisputeEmptyState.tsx` | Empty state with trust messaging |

### 5. Badges & Status
- Reuse existing `DisputeStatusBadge` and `DisputeMoneyStatusBadge` components
- Add extended status values for seller-specific statuses (awaiting_seller_response mapped to existing `seller_response_pending`)
- Money impact badges: Funds Held, Payout Blocked, Refund Pending, No Impact

### 6. Contextual Row Actions
- `Respond Now` (primary) — if seller hasn't responded yet
- `View Resolution` — if resolved
- `View Case` — default
- `View Transaction` — always available via txn code link

### 7. Routing
Add to `App.tsx` under seller protected routes:
```
<Route path="/seller/disputes" element={<SellerDisputes />} />
```

### 8. Empty State
Shield icon, "You have no disputes right now" message, trust-reinforcing support text, CTA to View Transactions.

## Files Created
| File | Description |
|---|---|
| `supabase/functions/seller-disputes/index.ts` | Edge function |
| `src/services/seller-disputes.service.ts` | Service layer |
| `src/pages/SellerDisputes.tsx` | Main page |
| `src/components/seller-disputes/SellerDisputeSummaryCards.tsx` | Summary metrics |
| `src/components/seller-disputes/SellerDisputeTrustBanner.tsx` | Trust info banner |
| `src/components/seller-disputes/SellerDisputeFilters.tsx` | Filter controls |
| `src/components/seller-disputes/SellerDisputeTable.tsx` | Main disputes table |
| `src/components/seller-disputes/SellerDisputeActionPanel.tsx` | Action needed sidebar |
| `src/components/seller-disputes/SellerDisputeBlockedPanel.tsx` | Blocked payouts sidebar |
| `src/components/seller-disputes/SellerDisputeEmptyState.tsx` | Empty state |

## Files Modified
| File | Change |
|---|---|
| `src/App.tsx` | Add `/seller/disputes` route |

