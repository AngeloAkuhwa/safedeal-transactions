

# Refine Export Dialogs: 8 Precision Fixes

Based on the review feedback, here are the specific corrections needed for both export dialogs.

## Changes

### 1. `ExportDisputesDialog.tsx` — Stop using `currentItems`, always fetch

**Problem**: "Current filtered view" uses `currentItems` which is only the current page slice, not the full filtered dataset.

**Fix**: Remove `currentItems` prop. For "filtered" scope, fetch with the same filters passed as props (status, reason, search) with `page_size: 500`. Enable the query for all scopes including "filtered".

### 2. Both dialogs — Re-fetch on scope/date change (already works)

The `useQuery` key already includes `scope`, `dateFilter`, and resolved filters, so React Query re-fetches automatically when these change. No code change needed — this is already correct.

### 3. `ExportPayoutsDialog.tsx` — Add "On Hold" scope, align with page states

Add scope options: `on_hold` and `processing` to match actual payout states from the UI.

### 4. Both dialogs — Add date range label clarification

Add a small helper text below the date range selector:
- Payouts: "Filters by release date"
- Disputes: "Filters by date opened"

Note: The date range select is currently visual-only (not wired to the API). For now, keep it as-is since the backend doesn't support date filtering yet — but add a TODO comment.

### 5. Both dialogs — Cap preview table, show full stats

Show only first 20 rows in preview table with a note like "Showing first 20 of 145 records". Summary stats and CSV export use the full dataset.

### 6. Both dialogs — Add error state

Show an error message in the preview area when the query fails, with a retry button.

### 7. Disputes CSV — Use raw `money_impact` and `status` values from backend

Already using `d.money_impact` and `d.status` from the API response (not UI badge text). Just clean up the `.replace(/_/g, " ")` to use the label maps instead for consistency.

### 8. Both dialogs — Explicit modal-selection-driven export

Already correct — `handleDownload` uses `rows` which is derived from the current query. No change needed.

## Files Modified

| File | Changes |
|---|---|
| `ExportDisputesDialog.tsx` | Remove `currentItems` prop; always fetch for all scopes; cap preview to 20 rows; add error state; add date label hint |
| `ExportPayoutsDialog.tsx` | Add `on_hold`/`processing` scopes; cap preview to 20 rows; add error state; add date label hint |
| `SellerDisputes.tsx` | Remove `currentItems` prop from `ExportDisputesDialog` usage |

