

# Plan: Reconcile "Completed" transactions with Payout Released status

## What the data actually says

For Chioma, all 3 completed transactions are **legitimately** in different stages of payout. Verified against DB:

| Tx Code | Tx status | Money status | Payout exists? | Payout status |
|---|---|---|---|---|
| SD-2026-000005 | completed | funds_released | yes | **completed** (paid 2026-03-06) |
| SD-2026-000019 | completed | funds_released | yes | **pending** (₦19,620 — never initiated) |
| SD-2026-000021 | completed | funds_released | yes | **pending** (₦12,095 — never initiated) |

So the "3 completed" count on the Transactions tab is **correct** (the buyer's side of the deal is done — money is released from escrow to the seller's payout queue). The Payouts tab showing only **1 released + 2 pending** is also **correct** (the bank transfer to Chioma's account has only happened for the first one).

**These are two different things being measured**, and the current UI labels make them look like they should match.

## The real bug

The label **"Net Revenue Released"** on the Transactions page sums `transaction_pricing.seller_net_amount` for all `status='completed'` transactions = **₦957,965.00**. But on the Payouts page, **"Total Released"** sums `payouts.amount WHERE payout.status='completed'` = **₦926,250.00** (only SD-2026-000005). The two screens use the same word "released" to mean two different things:

- Transactions page: "released **from escrow**" (money is no longer locked, owed to seller)
- Payouts page: "released **to your bank**" (actually deposited)

That's the contradiction the user is seeing. The numbers are right; the wording lies.

## Fix

### Frontend label changes (no logic changes)

1. **`src/pages/SellerTransactions.tsx`** — rename Revenue summary card:
   - Label: `Net Revenue Released` → **`Net Earned (Completed)`**
   - Subtitle: `{n} completed · after SafeDeal fees` → **`{n} completed · escrow released, payout in progress`**
   - Tooltip: "Total amount you've earned from completed deals after SafeDeal fees. Some may still be queued for bank transfer — see the Payouts tab for actual deposit status."

2. **`src/pages/SellerPayouts.tsx`** — clarify "Total Released":
   - Label stays `Total Released`
   - Subtitle: add **`Paid into your bank account`**
   - Tooltip: "Money already deposited to your bank account. Earnings from completed deals that haven't been transferred yet appear under Pending Release."

3. **`src/pages/SellerPayouts.tsx`** — clarify "Pending Release":
   - Subtitle: **`Earned · awaiting bank transfer`**
   - Tooltip: "Money the buyer has released to you but that hasn't been deposited to your bank account yet. Usually settles in 1-3 business days."

### Backend correctness fix (HIGH)

The two pending payouts for SD-2026-000019 (₦19,620) and SD-2026-000021 (₦12,095) are **stuck**. They were created when the transaction completed but `initiated_at` is `null` and they've been sitting in `pending` status. There is no scheduled job advancing them. This is a real operational bug, not just a labeling issue.

4. **`supabase/functions/seller-payouts/index.ts`** — add a "stuck payout" detection:
   - For each payout with `status='pending'` AND `created_at < now() - interval '24 hours'` AND `initiated_at IS NULL`, surface them in a new section `stuck_payouts[]` returned by the API.
   - Frontend renders a small alert above the Upcoming Releases card: **"2 payouts pending bank transfer for over 24 hours — contact support if not received in 1-3 business days."**

5. **Operational follow-up (out of scope for this code change)**: a future cron job (`process-pending-payouts`) should pick up `payouts.status='pending'` rows and either initiate the bank transfer via Paystack Transfer API or escalate. For now, the UI just makes them visible so they aren't silently lost.

### Verification table fix (LOW)

6. **`src/pages/SellerTransactions.tsx`** — under the "Net Earned (Completed)" card, add a tiny breakdown line:
   > "₦926,250.00 paid to bank · ₦31,715.00 pending bank transfer"
   
   Pulled from the existing `seller-payouts` API by computing `totalReleased` and `pendingRelease` for completed transactions only.

## Files to change

1. `src/pages/SellerTransactions.tsx` — relabel Revenue card, add bank-vs-pending breakdown line.
2. `src/pages/SellerPayouts.tsx` — refine subtitle/tooltip on Total Released and Pending Release; render `stuck_payouts` alert.
3. `supabase/functions/seller-payouts/index.ts` — add `stuck_payouts[]` to response payload (pending + null `initiated_at` + older than 24h).
4. `src/services/seller-payouts.service.ts` — add `stuck_payouts` to `SellerPayoutsResponse` interface.

## Expected results for Chioma after fix

| Card | Before | After |
|---|---|---|
| Transactions → "Net Revenue Released" | ₦957,965.00 | "**Net Earned** ₦957,965.00 · ₦926,250 paid to bank · ₦31,715 pending bank transfer" |
| Payouts → "Total Released" | ₦926,250.00 | ₦926,250.00 · subtitle "Paid into your bank account" |
| Payouts → "Pending Release" | ₦31,715.00 | ₦31,715.00 · subtitle "Earned · awaiting bank transfer" |
| Payouts → new alert | — | "2 payouts pending bank transfer for over 24 hours" |

## Risk

- All read-side label/copy changes plus one additive API field. No DB schema, no state machine, no triggers, no money movement.
- The two stuck payouts are a real operational issue that should also be addressed by a Paystack Transfer cron job in a follow-up plan; this plan only makes them visible so they aren't silently lost.

