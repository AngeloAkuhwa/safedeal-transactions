

# Seller Payouts Page — Full Implementation

## Overview

Create the Seller Payouts page from scratch, matching the detailed design spec. The page has no existing implementation — the SellerNav already links to `/seller/payouts` but the route, page, service, and edge function all need to be created.

## Architecture

```text
SellerPayouts.tsx
  ├── SellerNav (existing)
  ├── 4 Summary Cards (Released, Pending, Held, On Hold/Failed)
  ├── How Payouts Work (4-step lifecycle)
  └── Two-column layout
       ├── Left: Payout History table (search, filters, pagination)
       └── Right sidebar
            ├── Upcoming Releases card
            ├── Blocked / Delayed Funds card
            └── Payout Account card
```

## Files to Create/Edit

### 1. Edge Function: `supabase/functions/seller-payouts/index.ts`

Queries with service role client after JWT verification + seller role check:

- **Summary**: Aggregate `payouts` by status (completed, pending/processing, failed) + `escrow_states` held amounts for current seller
- **Payout History**: Join `payouts` → `transactions` → `transaction_items` + `transaction_pricing` + buyer `profiles`. Supports pagination (page/limit), status filter, search query. Returns: payout_id, transaction_code, buyer_name, item_title, gross_amount, fees, net_payout, release_date, status
- **Upcoming Releases**: Transactions where `money_status = funds_held_in_escrow` AND status in (`delivered_awaiting_verification`, `seller_dispatched`) — join with `transaction_items`, `transaction_pricing`, buyer `profiles`, include `verification_deadline_at` for countdown
- **Blocked/Delayed**: Transactions where status is `disputed` or payouts with `failed` status — include blocker reason
- **Payout Account**: Seller profile bank info placeholder + `account_verifications.payout_verified` status
- **Seller profile**: name + avatar for nav

### 2. Service: `src/services/seller-payouts.service.ts`

Typed interfaces + `getSellerPayouts(page, limit, statusFilter, search)` function invoking the edge function.

### 3. Page: `src/pages/SellerPayouts.tsx`

Full page with:
- **4 summary cards**: Total Released (green, with 30-day trend note), Pending Release (orange), Held in Escrow (blue), On Hold/Failed (red/warning)
- **How Payouts Work** section: 4-step horizontal lifecycle with icons (Payment Held → Buyer Confirms/Auto-Release → Payout Processing → Funds Sent)
- **Payout History table** (left 2/3): Search input, filter by status, export button. Columns: Payout ID, Transaction Code, Buyer, Item, Gross, Fees, Net Payout, Release Date, Status, Action. Status badges: Released (green), Processing (blue), Scheduled (orange), On Hold (yellow), Failed (red). Actions: View Details, Download Receipt, Retry, Contact Support. Pagination at bottom
- **Right sidebar** (1/3):
  - **Upcoming Releases**: Cards with transaction code, item, buyer, amount, release trigger (auto-release countdown, buyer confirmation pending), status badge
  - **Blocked/Delayed Funds**: Warning-toned cards with blocker reason (dispute, verification needed, manual review)
  - **Payout Account**: Bank name, account name, masked number, verification status, last payout date, typical processing time, Edit button. Warning state if verification incomplete
- **Empty states**: No payouts yet, no upcoming releases, no blocked funds
- Currency: NGN formatted as ₦

### 4. Route: `src/App.tsx`

Add `<Route path="/seller/payouts" element={<SellerPayouts />} />` inside the seller protected routes.

### 5. Config: `supabase/config.toml`

Add `[functions.seller-payouts]` with `verify_jwt = false`.

## Technical Notes

- Edge function uses `adminClient` (service role) for all queries to bypass RLS, after verifying JWT + seller role in code
- Payout history pagination defaults to 10 per page
- The `payouts` table has: id, seller_id, transaction_id, amount, currency_code, status (pending/processing/completed/failed/cancelled), provider_reference, initiated_at, completed_at, failed_at, failure_reason
- Upcoming releases are derived from transaction state (not payouts table) since payouts are only created when funds are actually being released
- Money status distinctions (transaction status vs escrow status vs payout status) are clearly reflected in badges and labels throughout

