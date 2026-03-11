

# Export Preview for Seller Transactions

## Summary
Add an export preview dialog that opens when clicking "Export." It shows a styled preview of all transactions matching the current filters (status + date range), with a date range selector inside the dialog, summary stats, and download buttons for CSV/PDF.

## Changes

### 1. `src/components/seller/ExportPreviewDialog.tsx` (new)
- Dialog/sheet component with a clean preview layout
- Date range dropdown at the top (reuses the same options: Today, This Week, This Month, This Quarter, All Time) — defaults to the currently selected date filter from the parent page
- Fetches ALL matching transactions (no pagination, up to 500) via the existing `getSellerTransactions` service with `page_size: 500`
- Preview table showing: Transaction Code, Buyer Name, Item, Amount, Status, Date
- Summary bar at top: total count, total amount, completed count
- "Download CSV" and "Close" buttons at the bottom
- CSV generation happens client-side using the previewed data — builds a CSV string and triggers a download via `Blob` + anchor click

### 2. `src/pages/SellerTransactions.tsx` (edit)
- Add state `exportOpen` boolean
- Wire the Export button to open the dialog, passing current `statusFilter` and `dateFilter` as defaults
- Import and render `ExportPreviewDialog`

## Technical Details
- No new edge function needed — reuses `seller-transactions` with `page_size: 500` and no search
- CSV columns: Transaction Code, Buyer, Email, Item, Qty, Amount, Currency, Status, Money Status, Date
- The dialog preview table uses alternating row colors and compact font sizing for a clean report feel
- Date filter inside the dialog is independent so user can adjust the export range without changing the page filters

## Files

| File | Action |
|------|--------|
| `src/components/seller/ExportPreviewDialog.tsx` | Create — dialog with preview table + CSV download |
| `src/pages/SellerTransactions.tsx` | Edit — wire Export button to open dialog |

