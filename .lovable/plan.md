## Scope (bundled A + B + C)

### Fix A — Terminal-status guards on Review & Pay pages

`src/pages/BuyerTransactionAgreement.tsx` and `src/pages/BuyerPaymentSummary.tsx`:

- After the transaction loads, branch on `tx.status` before rendering pay UI.
- For `cancelled`, `expired`, `completed`, `disputed`, `refunded` → render a terminal banner with:
  - Icon + heading matching the status (e.g. "Transaction Cancelled", "Agreement Expired")
  - Transaction code and the cancellation/terminal timestamp
  - Subtext explaining payment is no longer possible
  - Primary CTA: **Back to Marketplace** (`/buyer/marketplace`)
  - Secondary CTA: **Back to Dashboard** (`/dashboard`)
- Hide Pay button, Decline button, Retry, and the "Awaiting Payment / Payment Pending" badges in these states.
- Only `awaiting_payment` keeps today's full pay/retry flow.

### Fix B — Payment Failed modal: real error + smart CTA

In the modal rendered by `BuyerPaymentSummary.tsx` (or its child component):

- Capture the JSON `error` field returned by `initiate-paystack-payment` (currently swallowed by the SDK's generic "non-2xx" string). Use a direct `fetch` against the function URL (per our PATCH/DELETE pattern memory) to read the body on non-2xx, or parse `error.context.body` from `supabase.functions.invoke`.
- Display the real message as the modal subtitle.
- When the error string matches `/Invalid state: status=(cancelled|expired|completed|disputed|refunded)/`:
  - Replace "Retry Payment" with **Back to Marketplace**.
  - Change heading to "Transaction No Longer Payable".
  - Hide the "No funds were deducted / safely retry" reassurance block (since retry isn't valid).
- All other 4xx/5xx → keep today's Retry Payment + Return to Review + Contact Support actions.

### Fix C — Consistent cancellation writes (no schema change)

`supabase/functions/decline-transaction/index.ts` and `supabase/functions/buyer-cart/index.ts` (the `remove` action's two `UPDATE transactions SET status='cancelled'` blocks at lines ~224 and ~296):

- In the same `UPDATE`, also set `cancelled_at = new Date().toISOString()` and `money_status = 'cancelled'` when current `money_status` is `not_secured` or `payment_pending`.
- Immediately after the update, `INSERT` into `transaction_status_history`:
  - `old_status` = the value read before the update
  - `new_status` = `'cancelled'`
  - `changed_by_user_id` = the acting buyer
  - `reason` = `"Buyer declined transaction"` (decline-transaction) / `"Cart item removed during pending checkout"` (buyer-cart)
- If `money_status` transitioned, also insert a matching `money_status_history` row with the same reason.
- Idempotent: skip the history insert if the row was already `cancelled` (no-op update returned 0 rows).

No DB migration required — both history tables and the `cancelled_at` / `money_status` columns already exist.

## Out of scope (deferred)

- `awaiting_payment` hard-expiry rule, cron, and `initiate-paystack-payment` freshness check (covered in a separate follow-up plan).
- One-off cleanup migration for historical stale `awaiting_payment` rows.
- Backfilling `cancelled_at` / history for already-cancelled rows.
- Any change to Paystack code paths, pricing, escrow math, or the cart row-locking we just shipped.

## Files modified

- `src/pages/BuyerTransactionAgreement.tsx`
- `src/pages/BuyerPaymentSummary.tsx`
- `supabase/functions/decline-transaction/index.ts`
- `supabase/functions/buyer-cart/index.ts`

## Verification

1. Reload the failing share token `/t/CrSMOKX5IiUQ5igTMn4omfCu/pay` → Review/Pay pages should now show the "Transaction Cancelled" terminal banner instead of "Awaiting Payment".
2. Click any leftover pay flow that bypasses the banner → the Payment Failed modal should now read "Invalid state: status=cancelled" with a "Back to Marketplace" CTA, not a Retry button.
3. From the cart, remove a product with an active checkout session → query `transaction_status_history` for that tx → confirm a new row exists with `new_status='cancelled'` and reason `"Cart item removed during pending checkout"`, and `transactions.cancelled_at` is now non-null.
4. Decline a fresh awaiting-payment transaction → same audit checks for the decline reason.
