

# Export Modal for Seller Payouts and Seller Disputes

## Approach

Replicate the `ExportPreviewDialog` pattern from the Transactions page into two new components, each with page-specific data, scope options, and CSV fields.

## New Files

### 1. `src/components/seller/ExportPayoutsDialog.tsx`

- Same Dialog structure as `ExportPreviewDialog`
- Props: `open`, `onOpenChange`, `currentStatusFilter`, `currentSearch`
- **Scope select**: Current filtered view / All payouts / Released only / Pending only / Failed only
- **Date range select**: All Time / This Week / This Month / This Quarter
- Fetches data via `getSellerPayouts()` with appropriate filters when dialog opens
- Preview table columns: Payout ID, Transaction Code, Buyer, Item, Gross, Fees, Net, Status, Release Date
- Summary bar: record count, total net amount, released count
- CSV fields: Payout ID, Transaction Code, Buyer, Item, Gross Amount, Fees, Net Payout, Currency, Status, Release Date, Failure Reason, Bank Name, Masked Account
- Filename: `safedeal-payouts-YYYY-MM-DD.csv` (or `safedeal-payouts-filtered-...`)
- Footer: Cancel + Download CSV buttons

### 2. `src/components/seller-disputes/ExportDisputesDialog.tsx`

- Same Dialog structure
- Props: `open`, `onOpenChange`, `currentStatusFilter`, `currentReasonFilter`, `currentSearch`, `items` (for filtered view)
- **Scope select**: Current filtered view / All disputes / Open only / Awaiting response / Under review / Resolved only
- **Date range select**: All Time / This Week / This Month / This Quarter
- Fetches data via `getSellerDisputes()` with scope-driven filters when dialog opens
- Preview table columns: Dispute ID, Transaction Code, Buyer, Item, Reason, Status, Money Impact, Opened Date
- Summary bar: record count, open count, resolved count
- CSV fields: Dispute ID, Transaction Code, Buyer, Item, Reason, Status, Money Impact, Response Deadline, Date Opened, Last Updated, Resolution Date, Resolution Summary, Refund Amount, Release Amount
- Filename: `safedeal-disputes-YYYY-MM-DD.csv` (or `safedeal-disputes-filtered-...`)
- Footer: Cancel + Download CSV buttons

## Modified Files

### 3. `src/pages/SellerPayouts.tsx`

- Add `exportOpen` state
- Import and render `ExportPayoutsDialog`
- Wire existing Export button's `onClick` to `setExportOpen(true)` instead of doing nothing

### 4. `src/components/seller-disputes/SellerDisputeFilters.tsx`

- Remove inline `exportDisputesCsv` function
- Accept new prop `onExportClick` callback
- Wire Export button to call `onExportClick()` instead of direct CSV download

### 5. `src/pages/SellerDisputes.tsx`

- Add `exportOpen` state
- Import and render `ExportDisputesDialog`
- Pass `onExportClick={() => setExportOpen(true)}` to `SellerDisputeFilters`

## UX Consistency

Both new dialogs will share identical layout with the existing `ExportPreviewDialog`:
- Same `max-w-4xl max-h-[85vh]` sizing
- Same header with title + subtitle
- Same controls bar with filters + summary stats
- Same preview table with alternating row colors
- Same footer with Cancel + Download CSV
- Toast on successful download

