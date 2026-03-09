

# Plan: Decline Transaction with Confirmation Dialog + Cancelled Page

## Overview
When user clicks "Decline Transaction", show a warning confirmation dialog first. If confirmed, call a backend function to cancel the transaction and navigate to a new "Transaction Cancelled" page matching the HTML design.

## Changes

### 1. Update `src/pages/BuyerTransactionReview.tsx`
- Add `AlertDialog` import and state (`showDeclineDialog`)
- `handleDecline` now sets `showDeclineDialog = true` instead of navigating
- On confirm: call `supabase.functions.invoke("decline-transaction", { body: { shareToken } })`, then navigate to `/t/${shareToken}/cancelled`
- On cancel: close dialog, do nothing
- Dialog text: "Are you sure you want to cancel this transaction? This action cannot be undone. The transaction will be permanently terminated and the seller will be notified."

### 2. Create `supabase/functions/decline-transaction/index.ts`
- Accepts `{ shareToken }` (no JWT required — anonymous buyers can decline)
- Uses service role client to:
  1. Resolve `shareToken` → `transaction_id` via `transaction_links`
  2. Validate transaction status is `awaiting_buyer` or `awaiting_payment`
  3. Update `transactions.status` → `cancelled` (state machine allows this)
  4. Insert into `transaction_status_history` (reason: "Buyer declined transaction")
  5. Deactivate share link (`is_active = false`)
  6. Insert notification for seller
- Returns `{ success: true, transaction_code }`

### 3. Create `src/pages/TransactionCancelled.tsx`
Matching the HTML design:
- Gray gradient hero with Ban icon + "Transaction Cancelled" title
- Status Summary: two cards — "Cancelled" (gray) + "No Funds Released" (blue)
- Cancellation Reason card with collapsible "Other possible reasons"
- "Your Account is Safe" info card (blue tint)
- Two buttons: "Return to Homepage" + "Contact Support"
- Bottom banner about starting new transactions

### 4. Update `src/App.tsx`
- Add route: `/t/:shareToken/cancelled` → `TransactionCancelled`

### 5. Update `supabase/config.toml`
- Add `[functions.decline-transaction]` with `verify_jwt = false`

### Files Summary
| File | Action |
|------|--------|
| `src/pages/BuyerTransactionReview.tsx` | Edit — add AlertDialog confirmation |
| `supabase/functions/decline-transaction/index.ts` | Create — backend cancellation logic |
| `src/pages/TransactionCancelled.tsx` | Create — cancelled page UI |
| `src/App.tsx` | Edit — add route |
| `supabase/config.toml` | Edit — add function config |

