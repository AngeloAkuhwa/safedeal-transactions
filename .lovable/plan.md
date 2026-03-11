

# Seller Dashboard + Dual-Role Support

## Scope
Build the seller dashboard with real backend data, update routing for dual-role support, and ensure buyers/sellers can coexist on the same account with role-specific navigation.

---

## 1. Update Role Selection + Routing

### `src/pages/RoleSelection.tsx`
- On load, if user already has roles, redirect based on role: buyer → `/dashboard`, seller → `/seller`, both → `/dashboard` (default to buyer)
- After selecting "seller", navigate to `/seller`
- After selecting "buyer", keep `/dashboard`
- Keep dual-role info cards (they're accurate)

### `src/App.tsx`
- Add new `ProtectedRoute` group with `requireRole="seller"`:
  ```
  <Route element={<ProtectedRoute requireRole="seller" />}>
    <Route path="/seller" element={<SellerDashboard />} />
  </Route>
  ```

### `src/components/auth/ProtectedRoute.tsx`
- On `wrong-role`: fetch user's actual roles, redirect to their available dashboard (`/dashboard` for buyer, `/seller` for seller) instead of `/role-selection`
- Only redirect to `/role-selection` if user has zero roles

### `src/components/landing/Header.tsx`
- "Dashboard" button: fetch user roles, link to `/dashboard` if buyer, `/seller` if seller-only, `/dashboard` if both

---

## 2. Create Seller Dashboard Edge Function

### `supabase/functions/seller-dashboard/index.ts`
Mirrors `buyer-dashboard` pattern:
- Auth via JWT, verify `has_role(userId, 'seller')`
- Parallel queries:
  - **Profile**: `profiles` for name/avatar
  - **Metrics**: count transactions by status where `seller_id = userId`, sum amounts from `transaction_pricing`
  - **Alerts**: check `delivery_proof_files`, `delivery_confirmations`, `payouts` for banner triggers
  - **Recent activity**: 6 most recent transactions with buyer name, item title, amount, status
  - **Quick action counts**: draft count

Response shape matching your spec:
```json
{
  "seller": { "full_name", "avatar_url" },
  "alerts": [...],
  "metrics": { "transactions_created_count", "awaiting_buyer_payment_amount", "funds_held_in_escrow_amount", "funds_pending_release_amount", "payouts_completed_amount" },
  "recent_activity": [...],
  "quick_actions": { "draft_count" }
}
```

Add to `supabase/config.toml`:
```toml
[functions.seller-dashboard]
verify_jwt = false
```

---

## 3. Create Seller Dashboard Service

### `src/services/seller-dashboard.service.ts`
- TypeScript interfaces for `SellerDashboardResponse`, `SellerMetrics`, `SellerAlert`, `SellerActivity`
- `getSellerDashboard()` calling `seller-dashboard` edge function with auth token

---

## 4. Create Seller Nav Component

### `src/components/seller/SellerNav.tsx`
Mirror `BuyerNav` structure with seller-specific links:
- Dashboard → `/seller`
- Transactions → `/seller/transactions`
- Payouts → `/seller/payouts`
- Disputes → `/seller/disputes`
- Profile → `/seller/profile`
- Shows "Seller Account" label under user name
- Green accent for seller branding (using `text-success`)

---

## 5. Create Seller Dashboard Page

### `src/pages/SellerDashboard.tsx`
Matching the uploaded HTML design:

- **SellerNav** at top
- **Alert banners** (3 types): amber (delivery proof needed), blue (buyer verification active), green (payout releasing)
- **Hero section**: "Welcome back, [name]" + subtitle "Manage your protected transactions and monitor payments" + "Create Protected Transaction" CTA button
- **Metrics grid**: 2 rows
  - Row 1: Transactions Created (count) | Awaiting Buyer Payment (amount)
  - Row 2: Funds Held in Escrow (amount) | Funds Pending Release (amount) | Payouts Completed (amount, green)
- **Recent Activity table**: search bar + filter, columns: Transaction Code, Buyer (name + email), Item (title + category + qty), Amount, Status badge with action button
- **Pagination**: "Showing 1-6 of N" with page numbers
- **Quick Actions**: 4-card grid (Create Transaction, View Drafts, Sales Analytics, Account Settings)
- **Trust banner**: gradient section "SafeDeal Protection Active" with stats
- **Footer**

Seller-specific sub-components in `src/components/seller/`:
- `SellerAlertBanners.tsx`
- `SellerDashboardHero.tsx`
- `SellerMetricsCards.tsx`
- `SellerRecentActivity.tsx`
- `SellerQuickActions.tsx`
- `SellerTrustBanner.tsx`

---

## 6. No Database Changes Needed

All required tables already exist: `transactions`, `transaction_items`, `transaction_pricing`, `payments`, `escrow_states`, `payouts`, `delivery_proof_files`, `delivery_confirmations`, `disputes`, `notifications`, `profiles`, `user_roles`.

The `seller_transactions_view` already exists for seller-scoped data. The edge function uses service role so RLS is bypassed server-side after role verification.

---

## Files Summary

| File | Action |
|------|--------|
| `src/App.tsx` | Edit: add `/seller` route |
| `src/pages/RoleSelection.tsx` | Edit: route to correct dashboard per role |
| `src/components/auth/ProtectedRoute.tsx` | Edit: smart wrong-role redirect |
| `src/components/landing/Header.tsx` | Edit: role-aware dashboard link |
| `supabase/functions/seller-dashboard/index.ts` | Create |
| `supabase/config.toml` | Edit: add seller-dashboard config |
| `src/services/seller-dashboard.service.ts` | Create |
| `src/pages/SellerDashboard.tsx` | Create |
| `src/components/seller/SellerNav.tsx` | Create |
| `src/components/seller/SellerAlertBanners.tsx` | Create |
| `src/components/seller/SellerDashboardHero.tsx` | Create |
| `src/components/seller/SellerMetricsCards.tsx` | Create |
| `src/components/seller/SellerRecentActivity.tsx` | Create |
| `src/components/seller/SellerQuickActions.tsx` | Create |
| `src/components/seller/SellerTrustBanner.tsx` | Create |

