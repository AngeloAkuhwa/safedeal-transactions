

# Seller Transaction Detail Page + Conditional Action Routing

## Summary

Two distinct experiences when navigating from the transactions list:
- **"View Link"** button (awaiting_buyer status) → `/seller/transactions/:id/share` — reuses the `TransactionSuccess` component with fetched data
- **Row click / "Start Fulfillment" / other actions** → `/seller/transactions/:id` — new detail page matching the uploaded design

## Changes

### 1. New Edge Function: `seller-transaction-detail`
Fetches full transaction data for the seller, including: transaction (code, status, money_status, share_token, created_at), buyer info (name, email, phone from participants), item details, pricing (computed), delivery terms, escrow state, agreement snapshot, status history (for timeline), and derives a `next_action` based on current status.

### 2. New Service: `src/services/seller-transaction-detail.service.ts`
Typed interface + function calling the edge function.

### 3. New Page: `src/pages/SellerTransactionDetail.tsx`
Full detail page matching the uploaded design:
- **Header**: transaction code, status badges, "Copy Buyer Link" + context-aware action button (e.g. "Update Delivery")
- **3-column grid**: Buyer Info card, Payment Summary card, Delivery Terms card
- **2-column grid**: Item Details card (with product image if available), Agreement Status card
- **Transaction Timeline**: vertical timeline from status_history, with completed/current/pending states
- **Next Action Panel**: gradient card with checklist based on current status
- **Quick Actions**: 4-button grid (Update Delivery, View Tracking, Copy Buyer Link, Contact Support)
- Uses `SellerNav`, `Footer`, breadcrumbs

### 4. New Page: `src/pages/SellerTransactionShare.tsx`
Fetches transaction data from the same edge function and renders the existing `TransactionSuccess` component, mapping the API response to the component's props.

### 5. Conditional Routing in `SellerTransactions.tsx` and `SellerRecentActivity.tsx`
Update action button `onClick` handlers:
- `awaiting_buyer` → navigate to `/seller/transactions/:id/share`
- All other statuses → navigate to `/seller/transactions/:id`
- Row click (body) → always `/seller/transactions/:id`

### 6. Route Registration in `App.tsx`
Add under seller protected routes:
```
/seller/transactions/:transactionId → SellerTransactionDetail
/seller/transactions/:transactionId/share → SellerTransactionShare
```

| File | Action |
|------|--------|
| `supabase/functions/seller-transaction-detail/index.ts` | Create — edge function |
| `src/services/seller-transaction-detail.service.ts` | Create — service layer |
| `src/pages/SellerTransactionDetail.tsx` | Create — full detail page |
| `src/pages/SellerTransactionShare.tsx` | Create — share page reusing TransactionSuccess |
| `src/pages/SellerTransactions.tsx` | Edit — conditional action routing |
| `src/components/seller/SellerRecentActivity.tsx` | Edit — conditional action routing |
| `src/App.tsx` | Edit — add 2 new routes |

