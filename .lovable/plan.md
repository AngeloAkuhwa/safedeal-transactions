

# Seller Dashboard Interactivity & Transactions Page

## Summary
Three key improvements: (1) make alert banner actions navigate to filtered transactions, (2) enhance Recent Activity search to cover buyer name + transaction code + item, and (3) build a full Seller Transactions page at `/seller/transactions` matching the uploaded design.

---

## 1. Alert Banner Navigation (`SellerAlertBanners.tsx`)

Currently the "View Orders" / "Upload Proof" / "Track" buttons are dead. Wire them up using `useNavigate`:
- Each alert already has `action_url` from the edge function (e.g., `/seller/transactions?filter=fulfillment-needed`)
- Replace the `<button>` with a click handler that calls `navigate(alert.action_url)`
- The component needs to accept an `onNavigate` prop or use `useNavigate` directly

## 2. Recent Activity Search Fix (`SellerRecentActivity.tsx`)

The search already filters by `transaction_code`, `buyer_name`, and `item_title` — this is correct. The issue is the search placeholder says "Search transactions..." which is vague. Update placeholder to "Search by code, buyer, or item..." for clarity.

Also, the action buttons ("Update Delivery", "View Details") are currently non-functional. Wire them:
- "Update Delivery" / "Update Status" → navigate to a transaction detail/update page
- "View Details" / "View Receipt" / "View Link" → navigate to transaction detail

## 3. Create Seller Transactions Page

### New files needed:

**`src/pages/SellerTransactions.tsx`**
Full transactions management page matching the uploaded `main_6.html` design:
- Hero section: "All Transactions" title + "Create New Transaction" CTA
- Search bar (by code, buyer, item) + status filter dropdown + date filter dropdown + export button
- Table with columns: Transaction Code, Buyer (name + email), Item (title + category + qty), Amount, Money Status badge, Transaction Status badge, Action buttons
- Pagination footer with page numbers
- Summary cards below: Total Transactions, In Progress, Completed, Total Earned
- Trust banner + Footer
- Reads `?filter=` query param to pre-filter (e.g., `fulfillment-needed` shows only `payment_secured`/`seller_preparing_delivery`)

**`src/services/seller-transactions.service.ts`**
Service to call a new `seller-transactions` edge function with filters.

**`supabase/functions/seller-transactions/index.ts`**
Edge function that:
- Authenticates + verifies seller role
- Accepts `{ search, status_filter, date_filter, page, page_size }` body
- Queries `transactions` where `seller_id = userId` with joins to `transaction_items`, `transaction_pricing`, `profiles` (buyer)
- Returns paginated results + summary counts

### Route addition (`src/App.tsx`)
Add inside seller protected group:
```
<Route path="/seller/transactions" element={<SellerTransactions />} />
```

## 4. Dashboard → Transactions Navigation

- Alert banner clicks → `/seller/transactions?filter=X`
- Recent Activity action buttons → `/seller/transactions/:transactionId` (future detail page) or for now navigate to `/seller/transactions` with the transaction highlighted
- "View All" link in Recent Activity header → `/seller/transactions`
- Quick Actions "View Drafts" → `/seller/transactions?filter=draft`

---

## Files Summary

| File | Action |
|------|--------|
| `src/components/seller/SellerAlertBanners.tsx` | Add `useNavigate`, wire action buttons |
| `src/components/seller/SellerRecentActivity.tsx` | Wire action buttons with navigate, update search placeholder |
| `src/pages/SellerTransactions.tsx` | Create — full transactions page |
| `src/services/seller-transactions.service.ts` | Create — service layer |
| `supabase/functions/seller-transactions/index.ts` | Create — edge function |
| `src/App.tsx` | Add `/seller/transactions` route |
| `src/components/seller/SellerQuickActions.tsx` | Wire navigation links |
| `src/components/seller/SellerNav.tsx` | Ensure "Transactions" link points to `/seller/transactions` |

