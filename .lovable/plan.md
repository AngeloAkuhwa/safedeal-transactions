

# Plan: Make Service Fee Rate Dynamic From Backend

## Summary
Add `service_fee_amount` and `service_fee_rate` to all backend pricing responses (computed server-side), then update all 6 frontend fee displays to show "Service Fee (X.X%)" with "Includes payment processing" helper text.

## Backend Changes

### 1. Edge Functions — Add computed fields to pricing responses

All 3 edge functions that return pricing will add two new fields alongside existing ones (no breaking changes):

**`supabase/functions/resolve-share-token/index.ts`** (line ~106-129)
- After fetching `pricingRes`, compute and add to response:
  ```
  service_fee_amount = platform_fee_amount + processing_fee_amount
  service_fee_rate = service_fee_amount / item_amount  (or 0 if item_amount is 0)
  ```

**`supabase/functions/transaction-agreement/index.ts`** (line ~103-117)
- Same computation added to pricing in the response object.

**`supabase/functions/transaction-detail/index.ts`** (line ~113-115 in pricing response)
- Same computation added to pricing in the response object.

### 2. Service interfaces — Add new fields

**`src/services/review.service.ts`** — Add to pricing interface:
- `service_fee_amount: number`
- `service_fee_rate: number`

**`src/services/agreement.service.ts`** — Add to pricing interface:
- `service_fee_amount: number`
- `service_fee_rate: number`

**`src/services/transaction-detail.service.ts`** — Add to `TransactionDetailPricing`:
- `service_fee_amount: number`
- `service_fee_rate: number`

## Frontend Changes — 6 locations

All follow the same pattern: replace separate "Platform Fee" / "Processing Fee" / "Service Fee" lines with a single line:

```
Service Fee (X.X%)         ₦amount
Includes payment processing
```

Where `X.X` = `(service_fee_rate * 100).toFixed(1)` from backend data.

### Files to update:

| # | File | Current display |
|---|------|----------------|
| 1 | `src/pages/BuyerTransactionReview.tsx` (line ~736) | "Service Fee" — no rate |
| 2 | `src/pages/BuyerTransactionDetail.tsx` (lines ~663-674) | Two lines: "Platform Fee" + "Processing Fee" |
| 3 | `src/pages/BuyerTransactionDetail.tsx` (lines ~755-766) | Same two lines (sidebar) |
| 4 | `src/pages/BuyerTransactionTracking.tsx` (lines ~537-548) | Two lines: "Platform Fee" + "Processing Fee" |
| 5 | `src/components/agreement/LockedSnapshotCard.tsx` (line ~129) | "Platform Fee" only |
| 6 | `src/components/transactions/TransactionReceipt.tsx` (lines ~141-152) | Two lines: "Platform Fee" + "Processing Fee" |

Each location: replace the fee line(s) with a single "Service Fee (X.X%)" line using `pricing.service_fee_amount` and `pricing.service_fee_rate`, plus a small muted helper "Includes payment processing" below.

For `BuyerTransactionReview.tsx`, also update line ~120 to use `data.pricing?.service_fee_amount` instead of manually summing platform + processing fees.

## No DB migration needed
The computation is derived from existing `transaction_pricing` columns (`platform_fee_amount`, `processing_fee_amount`, `item_amount`). No schema changes required.

