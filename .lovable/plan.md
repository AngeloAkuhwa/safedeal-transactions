

# Font Size & Dimension Corrections for Buyer Transactions Page

Comparing the uploaded HTML design screenshots against the current code, here are the specific sizing mismatches and corrections needed.

## Changes Required

### 1. `src/pages/BuyerTransactions.tsx` -- Header Section

**Current**: `text-2xl sm:text-3xl` title, `text-sm` subtitle
**HTML design**: Title is clearly larger (~`text-3xl`), subtitle is ~`text-base` (not `text-sm`), and the subtitle text differs.

Changes:
- Title: `text-2xl sm:text-3xl` is acceptable -- the HTML renders at roughly 30px which maps to `text-3xl`. Keep as-is but do NOT go larger (no `text-4xl` or `lg:text-4xl` -- that would be oversized).
- Subtitle: Change from `text-sm mt-1` to `text-base text-muted-foreground mt-1` -- the design shows a noticeably larger subtitle than `text-sm`.
- Subtitle copy: Change to "Track and manage all your SafeDeal transactions"
- Header padding: `py-6 sm:py-8` is fine, matches the design spacing.

### 2. `src/components/transactions/TransactionFilters.tsx` -- Filter Card

**Current**: No card wrapper, pills use `text-sm`, search/dropdowns are inline without labels.
**HTML design**: Wrapped in a rounded card with padding. Labels ("Search Transactions", "Transaction Status", "Money Status") above each input in `text-sm font-semibold`. Inputs are full-width stacked. Status tabs at the bottom of the card use `text-sm`.

Changes:
- Wrap entire section in `rounded-xl border bg-card p-5 sm:p-6 space-y-4`
- Add label text above each field: `text-sm font-medium text-foreground mb-1.5`
- Search input: keep `text-sm` (default Input size), full-width
- Transaction Status dropdown: full-width (not the current narrow pill tabs approach -- the HTML shows a full-width Select for status, with the tabs below as a separate row)
- Money Status dropdown: full-width
- Status tabs row: `text-sm` with counts, laid out horizontally with wrapping. Current sizing (`text-sm`, `px-3.5 py-1.5`) is correct.
- Tab count badges: `text-xs` in `h-5 min-w-5` -- correct as-is.

### 3. `src/components/transactions/TransactionTable.tsx` -- Table

**Current**: 6 columns, all text `text-sm`/`text-xs`, item title merged with transaction code.
**HTML design**: 5 visible columns (Transaction, Item Details, Seller, Amount, Transaction Status). Transaction column shows code in `text-sm font-semibold` and date in `text-xs`. Item details column shows title in `text-sm font-semibold` with category/qty in `text-xs`. Seller shows name in `text-sm` with "Verified" in `text-xs`. Amount in `text-sm font-semibold` with currency code in `text-xs` below.

Changes:
- Table header text: use `text-xs font-medium uppercase tracking-wider text-muted-foreground` (matches the HTML's `TRANSACTION`, `ITEM DETAILS`, `SELLER`, `AMOUNT`, `TRANSACTION STATUS` uppercase headers)
- Transaction column: code in `text-sm font-semibold`, date in `text-xs text-muted-foreground`
- Item Details column: title in `text-sm font-semibold`, category + qty in `text-xs text-muted-foreground`
- Seller column: name in `text-sm`, "Verified" label in `text-xs text-muted-foreground`
- Amount column: value in `text-sm font-semibold`, currency code in `text-xs text-muted-foreground` below
- Status column: badge text stays `text-xs` (correct)
- Remove Money Status and Action columns from the main table view (HTML design shows only 5 columns: Transaction, Item Details, Seller, Amount, Transaction Status -- no separate Money Status or Action columns visible)

### 4. `src/components/transactions/TransactionPagination.tsx`

**Current**: `text-sm` for "Showing X-Y of Z"
**HTML design**: Same sizing. No changes needed -- current implementation matches.

### 5. `src/components/transactions/TransactionStatusBadge.tsx`

**Current**: `text-xs font-medium` text-only badges
**HTML design**: Badges include small icons before text, `text-xs` or `text-sm` size with icon + label. Colors match status (green for Completed/Delivered, blue for In Transit, red for In Dispute, grey for Processing).

Changes:
- Add small icon (3.5 size) before label text
- Keep `text-xs font-medium`

### 6. General spacing

- Content area padding `px-4 sm:px-6 lg:px-8 py-6` is correct
- `space-y-6` between sections is correct
- Table card `rounded-xl border` is correct
- Table row vertical padding could be slightly increased -- HTML rows have generous padding (~`py-4 px-4`)

## Files to Modify

| File | Changes |
|---|---|
| `src/pages/BuyerTransactions.tsx` | Subtitle size `text-sm` → `text-base`, update copy |
| `src/components/transactions/TransactionFilters.tsx` | Add card wrapper, add field labels, add Transaction Status dropdown (full-width), stack vertically |
| `src/components/transactions/TransactionTable.tsx` | Split into Transaction + Item Details columns, uppercase headers with `text-xs tracking-wider`, show currency below amount, add seller "Verified" sublabel, increase row padding |
| `src/components/transactions/TransactionStatusBadge.tsx` | Add status icons |
| `src/components/transactions/MoneyStatusBadge.tsx` | No size changes needed |

No backend changes needed.

