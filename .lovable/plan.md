

# Fix Seller Dashboard Data Integrity

## Problems Found

After inspecting the actual database data, here are the integrity issues:

### 1. Wrong "Delivery Proof Needed" Alert Logic
The edge function flags transactions with `status IN ('payment_secured', 'seller_preparing_delivery')` as "awaiting delivery proof." This is incorrect:
- **SD-2026-000001** has status `payment_secured` — seller hasn't even started preparing. This is NOT a delivery proof issue.
- **SD-2026-000002** has status `seller_preparing_delivery` — seller is preparing, hasn't dispatched yet. Also NOT a delivery proof issue.

Delivery proof is only relevant AFTER dispatch (`seller_dispatched`) or delivery claim. The correct logic should flag `seller_dispatched` transactions that are missing entries in `delivery_proof_files`, or transactions in `delivered_awaiting_verification` without proof.

**Fix**: Replace the alert condition. Create two separate alerts:
- **"Fulfillment action needed"** for `payment_secured` / `seller_preparing_delivery` — these need the seller to prepare and dispatch
- **"Delivery proof needed"** for `seller_dispatched` transactions missing proof files (cross-check with `delivery_proof_files` table)

### 2. Hardcoded Fake Badge Values
The metrics cards show `"↑ 12%"` as a trend badge — this is hardcoded and not derived from data. It's misleading. Remove trend badges entirely or replace with count-based labels (e.g., show the number of transactions contributing to that metric).

### 3. Metrics Verification (These Are Correct)
- Transactions Created: 6 ✓
- Awaiting Buyer Payment: ₦0 (no transactions in `awaiting_buyer`/`awaiting_payment`) ✓
- Funds Held in Escrow: ₦1,998,750 (SD-000001 + SD-000002 with `funds_held_in_escrow`) ✓
- Funds Pending Release: ₦0 (no `funds_releasing` transactions) ✓
- Payouts Completed: ₦926,250 (one completed payout) ✓

## Changes

### `supabase/functions/seller-dashboard/index.ts`
- Change `deliveryProofNeededTxIds` logic: use `seller_dispatched` status instead of `payment_secured`/`seller_preparing_delivery`
- Add a new check for `delivery_proof_files` to only flag dispatched transactions that are actually missing proof
- Add a separate "fulfillment_action_needed" alert for `payment_secured` / `seller_preparing_delivery` transactions
- Add `seller_dispatched` to delivery proof check

### `src/components/seller/SellerAlertBanners.tsx`
- Add config for new `fulfillment_action_needed` alert type (e.g., blue/primary color with Package icon)

### `src/components/seller/SellerMetricsCards.tsx`
- Remove hardcoded `"↑ 12%"` badge from Transactions Created card
- Replace with dynamic count-based context or remove badges that aren't data-driven

## Files Changed (3 files)

| File | Change |
|------|--------|
| `supabase/functions/seller-dashboard/index.ts` | Fix alert logic to match actual transaction states |
| `src/components/seller/SellerAlertBanners.tsx` | Add `fulfillment_action_needed` alert config |
| `src/components/seller/SellerMetricsCards.tsx` | Remove fake hardcoded trend badges |

