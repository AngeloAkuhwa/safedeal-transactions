

# Plan: Add Agreement Review CTA for Awaiting Payment Status

## Problem
When a transaction is in `awaiting_payment` status, the Next Action Card shows "Payment Required" text but has no actionable button. The buyer needs a clear path to the agreement review/confirmation screen to proceed with payment.

## Changes

### 1. `supabase/functions/transaction-detail/index.ts`
- Update `deriveNextAction` for `awaiting_payment` case: set `action: "review_agreement"` instead of `null`

### 2. `src/pages/BuyerTransactionDetail.tsx` — `NextActionCard`
- Add a new conditional block for `txStatus === "awaiting_payment"`:
  - Primary button: "Review Agreement & Pay" → navigates to `/dashboard/transactions/${txId}/agreement`
  - Uses `FileText` icon, styled like the existing verify button (white bg on warning gradient)

Two small, targeted edits. No new files needed.

