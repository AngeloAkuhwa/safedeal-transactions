

# Plan: Route "Review Agreement & Pay" to the Share Token Review Page

## Problem
The "Review Agreement & Pay" button on the transaction detail page navigates to `/dashboard/transactions/:id/agreement` (the Locked Agreement screen), but the actual payment flow lives on the `/t/:shareToken` review page. The buyer needs to be routed there instead.

## Changes

### 1. `supabase/functions/transaction-detail/index.ts`
- Add `share_token` to the transaction SELECT query (line 87): `"id, transaction_code, status, money_status, dispute_status, buyer_id, seller_id, created_at, updated_at, share_token"`
- Include `share_token` in the response transaction object

### 2. `src/services/transaction-detail.service.ts`
- Add `share_token: string | null` to the `TransactionDetailResponse.transaction` interface

### 3. `src/pages/BuyerTransactionDetail.tsx`
- Pass `shareToken` to `NextActionCard`
- Change the `awaiting_payment` button's `onClick` from navigating to `/dashboard/transactions/${txId}/agreement` to `/t/${shareToken}` when `shareToken` is available
- Fall back to the agreement route if no share token exists

Three small, targeted edits across three files.

