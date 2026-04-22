

# Plan: Clarify seller dashboard money labels, formatting & status wording

Scope: copy/format/tooltip-only changes on the seller dashboard and seller transactions page. No layout redesign, no API or DB changes.

## 1. Always show full money values (no K / M rounding)

**`src/pages/SellerTransactions.tsx`**
- Delete the `formatCompact()` helper.
- Revenue summary card uses `formatCurrency(summary.total_earned, "NGN")` → renders `₦957,965.00` instead of `₦958.0K`.
- Existing `formatCurrency` already uses 2 decimals — verify `minimumFractionDigits: 2` (it does) and add `maximumFractionDigits: 2` to prevent stray extra digits.

No other file currently rounds; `SellerMetricsCards`, `SellerRecentActivity`, `seller-payouts`, and dashboard hero already format with 2 decimals.

## 2. Rename the four summary cards on Seller Transactions page

Replace generic labels with the standardized money vocabulary:

| Current | New label | New subtitle |
|---|---|---|
| ALL TIME — Total Transactions | TRANSACTIONS — Total Transactions | All protected deals you've created |
| AWAITING PAYMENT | AWAITING BUYER PAYMENT | Buyer hasn't paid yet · count |
| IN FULFILLMENT | IN FULFILLMENT | Paid · being delivered · count |
| REVENUE — `₦958.0K` — "3 completed · total net" | NET REVENUE RELEASED — `₦957,965.00` — "{n} completed · after SafeDeal fees" |

## 3. Transaction table: explicit Gross / Net labels

**`src/pages/SellerTransactions.tsx`** Amount column (lines 275–284):
- Replace the unlabeled bold amount + dim "Net:" line with two explicitly-labeled rows:
  - `Gross: ₦12,345.00`
  - `Net to seller: ₦12,095.00`
- Both always rendered (even when equal), so sellers never have to guess which number is which.
- Wrap the column header "Amount" with an info tooltip explaining gross vs net.

## 4. Rename Money Status badge wording

**`src/components/transactions/MoneyStatusBadge.tsx`**
- `funds_held_in_escrow` → label "Funds in Escrow" (was "Funds Held" — ambiguous)
- `funds_releasing` → "Pending Release" (was "Releasing")
- `funds_released` → "Released to You" (was "Released")
- Other labels kept.

## 5. Rename one confusing status label

**`src/pages/SellerTransactions.tsx`** + **`src/components/seller/SellerRecentActivity.tsx`**
- `delivered_awaiting_verification` → label "Awaiting Buyer Review" (was "Buyer Verification" / "Awaiting Verification").
- Status filter dropdown: change item value `buyer-verification` display text to "Awaiting Buyer Review" (keep the URL value to avoid breaking deeplinks).

All other status labels stay as-is.

## 6. Seller Dashboard metric cards — clarify wording

**`src/components/seller/SellerMetricsCards.tsx`** — copy-only:

| Card | Current subtitle | New subtitle |
|---|---|---|
| Transactions Created | "Total protected deals" | "All protected deals you've created" |
| Awaiting Buyer Payment | "Buyer started checkout, payment not completed" | "Gross amount · buyer hasn't paid yet" |
| Awaiting Buyer Review | "Buyer hasn't reviewed agreement yet" | "Gross amount · buyer hasn't reviewed agreement" |
| Funds Held in Escrow | "Securely held" | "Your net earnings currently locked in escrow" |
| Funds Pending Release | "Processing release" | "Net approved · not yet paid out" |
| Payouts Completed | "Total received" | "Net released to you after SafeDeal fees" → also rename label to **Net Revenue Released** |

## 7. Add hover info tooltips

Use the existing `@/components/ui/tooltip` (Radix) primitives wrapped in a `<TooltipProvider>` at each page root if not already mounted.

Add a small `<Info className="h-3.5 w-3.5 text-muted-foreground/60" />` next to these labels, with tooltip copy:

| Label | Tooltip copy |
|---|---|
| Gross | "The total amount paid by the buyer before SafeDeal fees." |
| Net to seller | "The amount you earn after SafeDeal fees are deducted." |
| Funds Held in Escrow | "Your protected earnings currently held by SafeDeal until the transaction is confirmed." |
| Funds Pending Release | "Money approved for payout but not yet sent." |
| Net Revenue Released | "Total amount released to you from completed transactions, after SafeDeal fees." |
| Awaiting Buyer Payment | "Buyer started checkout but payment isn't complete yet. Shown as gross buyer amount." |
| Awaiting Buyer Review | "Buyer needs to inspect the item before funds can be released." |
| Money Status (table column header) | "Where the buyer's money currently sits in the SafeDeal escrow flow." |

Locations where the icons + tooltips appear:
- Seller dashboard 6 metric cards (next to each card label)
- Seller transactions table — "Amount" header and inside the cell next to "Gross" / "Net to seller"
- Seller transactions 4 summary cards (next to "Net Revenue Released" specifically)

## 8. Files touched (summary)

1. `src/pages/SellerTransactions.tsx` — remove `formatCompact`, relabel summary cards, rewrite Amount column with Gross/Net rows, update status filter dropdown text, add tooltips.
2. `src/components/seller/SellerMetricsCards.tsx` — update card label/subtitle copy, rename "Payouts Completed" → "Net Revenue Released", add tooltip icons.
3. `src/components/seller/SellerRecentActivity.tsx` — rename `delivered_awaiting_verification` label to "Awaiting Buyer Review".
4. `src/components/transactions/MoneyStatusBadge.tsx` — clearer labels for `funds_held_in_escrow`, `funds_releasing`, `funds_released`.

## What is NOT changing
- Edge functions, services, DB queries — all numbers come from the same canonical fields already returned (`seller_net`, `amount`, `total_earned`, etc.).
- Layouts, card grid, table column order, routing.
- Buyer-side pages (this request is seller-only).

## Verification after implementation
- Revenue card on `/seller/transactions` reads `₦957,965.00` (was `₦958.0K`).
- Row SD-2026-000021 shows two labeled lines: `Gross: ₦12,345.00` / `Net to seller: ₦12,095.00`.
- Status dropdown shows "Awaiting Buyer Review" (not "Buyer Verification").
- Hovering each ⓘ icon displays the plain-language tooltip.
- All money values across both pages show 2 decimal places, no K/M.

