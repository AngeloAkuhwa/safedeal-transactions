

# Plan: Fix data inconsistencies on Seller Transactions, Payouts & Disputes tabs

## What's correct (no fix needed)

For Chioma Okafor verified against the database:

- **Transactions tab** quick stats are all numerically correct:
  - Transactions = **17** (drafts excluded)
  - Awaiting Buyer Payment = **7** (4 awaiting_buyer + 3 awaiting_payment)
  - In Fulfillment = **2** (both `seller_dispatched`)
  - Net Revenue Released = **₦957,965.00** across **3 completed**

- The reason `In Fulfillment (2) + Completed (3) ≠ Total (17)` is that the 4-card grid intentionally omits `disputed (2)`, `cancelled (2)`, and `timed_out (1)`. The numbers are right; the UI just doesn't show those buckets, which is why it *feels* off.

## Real bugs to fix

### Bug P1 (HIGH) — Payout history shows ₦0.00 Gross & Fees for every row

**Where:** `supabase/functions/seller-payouts/index.ts` line 184.

**Cause:** Edge function selects `service_fee_amount` from `transaction_pricing`, but that column does not exist. The real columns are `item_amount`, `platform_fee_amount`, `processing_fee_amount`, `seller_net_amount`, `buyer_total_amount`. Because the field is missing, all `gross_amount` and `fees` values fall back to `0`. Verified against current API response — all 3 payout history rows return `gross_amount: 0, fees: 0`.

**Fix:** Update the SELECT to `item_amount, platform_fee_amount, processing_fee_amount, seller_net_amount, currency_code`. Compute:
- `gross_amount = item_amount` (what the seller priced the item at) — or use `buyer_total_amount` if we want to show full buyer charge. Pick `item_amount` to stay consistent with seller-net = item_amount − fees.
- `fees = platform_fee_amount + processing_fee_amount`
- `net_payout = payouts.amount` (already correct).

### Bug P2 (MEDIUM) — "On Hold / Failed" KPI excludes funds frozen by disputes

**Where:** `supabase/functions/seller-payouts/index.ts` lines 84, 106-108, 374.

**Cause:** `on_hold_failed` only sums `payouts.status = 'failed'` rows (₦0 today). Disputed transactions with `money_status='funds_frozen'` (₦906,750 net for Chioma) are real money on hold but only appear in the bottom `blocked_funds` panel. Sellers reading the headline "On Hold / Failed" assume it's complete.

**Fix:** Add `funds_frozen` seller-net to the `on_hold_failed` total. Concretely, after the existing `failedAmount` loop, also sum `seller_net_amount` of transactions where `money_status='funds_frozen'`. Update the card label to **"On Hold / Failed"** subtitle "Includes failed payouts and disputed funds frozen in escrow." Expected new value for Chioma: **₦906,750.00** (still ₦0 failed + ₦906,750 frozen).

### Bug P3 (MEDIUM) — Held in Escrow KPI vs Upcoming Releases

`heldInEscrow` only sums `funds_held_in_escrow` (₦1,998,750) — correct. **But** `funds_frozen` (disputed, ₦906,750) is also money technically in escrow. To prevent double-counting if we adopt P2, keep "Held in Escrow" definition as **clean escrow only** (current), and let "On Hold / Failed" cover frozen+failed. Document this in the tooltips already added to the cards.

**Fix:** Update tooltip copy on "Held in Escrow" → "Your protected earnings currently locked in escrow, awaiting buyer confirmation. Disputed/frozen amounts appear under On Hold / Failed."

### Bug D1 (HIGH) — Disputes "Payouts Blocked" KPI uses gross while the row list uses net

**Where:** `supabase/functions/seller-disputes/index.ts` line 159 (selects `buyer_total_amount`) vs line 192-193 (sums `buyer_total_amount` into `summary.blocked_payout_amount`).

**Cause:** The KPI sums `buyer_total_amount` (gross paid by buyer = ₦967,200), but the seller-payouts function and the seller's actual at-risk money is the **net** (₦906,750). Two screens show different "blocked" totals for the same disputes, which is exactly the kind of contradiction we just fixed elsewhere.

**Fix:** Switch `seller-disputes` to select and sum `seller_net_amount` instead of `buyer_total_amount`. Also pass `seller_net_amount` as the per-row `amount` in `blocked_payouts[]` and `items[].buyer_total_amount` (rename to `seller_net_amount` in the response since that's what we're now returning). Frontend `SellerDisputeSummaryCards.tsx` Payouts Blocked card and the row-level money column in `SellerDisputeTable` both already display this field — they just need the field semantically renamed/relabeled.

Expected after fix: `blocked_payout_amount = ₦906,750.00` matching the Payouts tab's blocked funds rows exactly.

### Bug D2 (LOW) — Disputes list `buyer_total_amount` shown as a "buyer total" but is actually used as the seller-facing money column

Same as D1: rename the field in the API contract from `buyer_total_amount` to `seller_net_amount` and update the corresponding TypeScript interface in `src/services/seller-disputes.service.ts`. Update column header in `SellerDisputeTable` from "Amount" or "Buyer Total" to "Net at Risk" with an info tooltip "The seller net amount currently held while this dispute is being reviewed."

### UX U1 (LOW) — Transactions tab summary cards omit cancelled/disputed/timed-out buckets, causing apparent contradiction

The 4-card layout shows `Total | Awaiting Payment | In Fulfillment | Net Revenue Released` but the user expects the visible state buckets to add up to Total. They don't because `disputed (2) + cancelled (2) + timed_out (1) = 5` are silent.

**Fix (no logic change):** Add a single line under the "Transactions" card subtitle showing the breakdown:
> "17 total · 7 awaiting payment · 2 in fulfillment · 3 completed · 2 disputed · 2 cancelled · 1 timed out"

Pull the extra counts from a small extension to `summary` returned by `seller-transactions`: `disputed_count`, `cancelled_count`, `timed_out_count`. This kills the "the math doesn't add up" confusion without redesigning the card grid.

## Files to change

1. **`supabase/functions/seller-payouts/index.ts`**
   - Line 184: SELECT `item_amount, platform_fee_amount, processing_fee_amount, seller_net_amount, currency_code`.
   - Line 234-235: `gross_amount = pricing.item_amount`, `fees = (platform_fee_amount + processing_fee_amount)`.
   - After line 109: also add `funds_frozen` seller-net to `failedAmount` (rename internal variable to `onHoldFailed` for clarity). Use the seller-net values fetched in the existing `pricingMap` block (lines 144-158); add a parallel pass over `blockedTxIds` (which already covers disputed) into the on_hold total.

2. **`supabase/functions/seller-disputes/index.ts`**
   - Line 159: change SELECT to `seller_net_amount, currency_code` (drop `buyer_total_amount`).
   - Lines 192-193: sum `seller_net_amount` into `summary.blocked_payout_amount`.
   - Line 198-208: per-row `amount = seller_net_amount`.
   - Line 364: same — return `seller_net_amount` instead of `buyer_total_amount`.
   - Line 452: rename returned field `buyer_total_amount` → `seller_net_amount`.

3. **`supabase/functions/seller-transactions/index.ts`**
   - Lines 273-281: extend `summary` with `disputed_count`, `cancelled_count`, `timed_out_count`, `refunded_count` (already filter from `allRows`).

4. **`src/services/seller-disputes.service.ts`**
   - Update `SellerDispute` and related interfaces: rename `buyer_total_amount` → `seller_net_amount`.

5. **`src/services/seller-transactions.service.ts`**
   - Add `disputed_count`, `cancelled_count`, `timed_out_count`, `refunded_count` to `SellerTransactionsSummary`.

6. **`src/components/seller-disputes/SellerDisputeTable.tsx`**
   - Replace "Buyer Total" column header with "Net at Risk" + InfoTip.
   - Bind to new `seller_net_amount` field.

7. **`src/components/seller-disputes/SellerDisputeSummaryCards.tsx`**
   - Update tooltip copy on "Payouts Blocked" → "Your seller net currently held due to active disputes."

8. **`src/pages/SellerPayouts.tsx`**
   - Update "On Hold / Failed" subtitle to "Failed payouts + funds frozen by disputes" and add an InfoTip with the same text.
   - Update "Held in Escrow" InfoTip per Bug P3.

9. **`src/pages/SellerTransactions.tsx`**
   - Inside the "Transactions" summary card, add a single small text line below the count showing the per-status breakdown (uses the new summary fields).

10. **Re-deploy** edge functions: `seller-payouts`, `seller-disputes`, `seller-transactions`.

## Expected results for Chioma after fix

| Metric | Before | After |
|---|---|---|
| **Payouts** Total Released | ₦926,250.00 | ₦926,250.00 (unchanged) |
| **Payouts** Pending Release | ₦31,715.00 | ₦31,715.00 (unchanged) |
| **Payouts** Held in Escrow | ₦1,998,750.00 | ₦1,998,750.00 (unchanged) |
| **Payouts** On Hold / Failed | ₦0.00 | ₦906,750.00 (now includes disputed-frozen) |
| **Payouts** Per-row Gross/Fees | ₦0.00 / ₦0.00 (broken) | Real values, e.g. SD-2026-000021 → Gross ₦12,345 / Fees ₦250 / Net ₦12,095 |
| **Disputes** Payouts Blocked KPI | ₦967,200.00 | ₦906,750.00 (now matches Payouts blocked-funds list) |
| **Disputes** per-row money | ₦676,000 / ₦291,200 (gross) | ₦633,750 / ₦273,000 (seller net) |
| **Transactions** card breakdown | hidden | "17 total · 7 awaiting · 2 in fulfillment · 3 completed · 2 disputed · 2 cancelled · 1 timed out" |

## Risk

- All read-side aggregation/label fixes. No DB schema, no state machine, no triggers.
- Adding `funds_frozen` to "On Hold / Failed" is a definition broadening; the InfoTip + label change makes it explicit so sellers aren't surprised.
- Renaming `buyer_total_amount` → `seller_net_amount` in `seller-disputes` is a contract change; service interface and the one consumer component are updated in the same patch.
- Net amounts on Disputes screen become smaller numbers — clearly labeled "Net at Risk" so it doesn't feel like a downgrade.

