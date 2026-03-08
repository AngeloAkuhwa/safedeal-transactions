

# Build Buyer Dashboard with Backend API

## Overview

Replace the placeholder `/dashboard` page with a full Buyer Dashboard powered by a single aggregated edge function. The dashboard matches the uploaded HTML design and follows the project's service layer architecture.

## Architecture

```text
Edge Function: buyer-dashboard
  ↓ JWT validated in code (verify_jwt = false in config)
  ↓ role check via has_role RPC
  ↓ queries: profiles, transactions, transaction_items,
  ↓          transaction_pricing, disputes, notifications
  ↓
Service: src/services/dashboard.service.ts
  ↓ supabase.functions.invoke("buyer-dashboard")
  ↓
Page: src/pages/Dashboard.tsx
  ↓ useQuery from React Query
  ↓
Components: src/components/dashboard/
```

## Files to Create/Modify

### 1. Edge Function: `supabase/functions/buyer-dashboard/index.ts`

Single endpoint returning all dashboard data. Security flow:
1. CORS preflight handling
2. Extract Bearer token from Authorization header
3. `getClaims(token)` to verify JWT and get `userId`
4. Create service-role client, call `has_role(userId, 'buyer')` RPC — reject with 403 if false
5. Run queries scoped to `buyer_id = userId`:
   - **Profile**: `profiles` table — `full_name`, `avatar_url`
   - **Metrics**: Count transactions by status (active = not completed/cancelled; awaiting_delivery = `seller_dispatched`; awaiting_verification = `delivered_awaiting_verification`); count disputes where `status != 'resolved'` and `opened_by_user_id = userId`
   - **Recent purchases** (limit 5): Join `transactions` + `transaction_items` + `transaction_pricing` + seller `profiles` — batch fetch by transaction IDs
   - **Recent notifications** (limit 3): `notifications` table where `user_id = userId`, ordered by `created_at desc`
6. Each query wrapped in try/catch — defaults to 0/empty on failure
7. Always return consistent JSON shape with CORS headers

Config addition to `supabase/config.toml`:
```toml
[functions.buyer-dashboard]
verify_jwt = false
```

### 2. Service: `src/services/dashboard.service.ts` (new)

- Export `BuyerDashboardResponse` interface
- Export `getBuyerDashboard()` — gets session token, calls `supabase.functions.invoke("buyer-dashboard")` with Authorization header
- Error handling: throw on non-2xx or missing data

### 3. Page: `src/pages/Dashboard.tsx` (rewrite)

- `useQuery("buyer-dashboard", getBuyerDashboard)` for data fetching
- Loading: centered spinner
- Error: "Could not load your dashboard" + retry button
- Empty (no purchases): friendly empty state with CTA
- Success: render all dashboard sections

### 4. Components (new files in `src/components/dashboard/`)

All use existing shadcn/ui primitives (Card, Button, Badge, Table, Avatar, Skeleton) and lucide-react icons.

| Component | Purpose |
|---|---|
| `BuyerNav.tsx` | Dashboard nav (Dashboard, Transactions, Disputes, Notifications, Profile) + bell icon + avatar + sign out. Uses auth/session services for logout. |
| `DashboardHero.tsx` | Gradient welcome section with buyer name + "Track Purchase" / "Need Help?" CTAs |
| `MetricsCards.tsx` | 4 stat cards: Active Purchases, Awaiting Delivery, Awaiting Verification, Open Disputes |
| `RecentNotifications.tsx` | Notification cards with type-based colors + action buttons (Verify Item / Track Shipment / View Dispute) |
| `RecentPurchases.tsx` | Table with columns: transaction code, item, seller, amount, status badge, money status badge, action button |
| `QuickAccess.tsx` | 2-card grid: Disputes + Track Purchases shortcuts |

### 5. Footer

Reuse existing `Footer` component from landing page at the bottom.

## Key Corrections from User's Spec

- **JWT validation**: Done in code via `getClaims()`, not via `verify_jwt = true` (per project convention)
- **Service role client**: Used server-side for `has_role` RPC check since the anon-key client scoped to the user can't call security-definer functions that need elevated access
- **Batch queries**: Fetch transaction IDs first, then batch-fetch items/pricing/seller names — no N+1 queries
- **RLS**: Edge function uses service role for aggregation, but all queries are explicitly scoped to `buyer_id = userId` — no unscoped queries
- **Partial failure resilience**: Each section query is independent; failure in one returns defaults, not a full 500

## Routing

No changes needed. `/dashboard` is already protected with `requireRole` in `ProtectedRoute`. When a buyer selects their role on `/role-selection`, they navigate to `/dashboard` which renders the new Buyer Dashboard.

## No Database Migrations

All required tables exist. RLS policies are already configured.

## Files Summary

| File | Action |
|---|---|
| `supabase/functions/buyer-dashboard/index.ts` | Create |
| `supabase/config.toml` | Add function config |
| `src/services/dashboard.service.ts` | Create |
| `src/pages/Dashboard.tsx` | Rewrite |
| `src/components/dashboard/BuyerNav.tsx` | Create |
| `src/components/dashboard/DashboardHero.tsx` | Create |
| `src/components/dashboard/MetricsCards.tsx` | Create |
| `src/components/dashboard/RecentNotifications.tsx` | Create |
| `src/components/dashboard/RecentPurchases.tsx` | Create |
| `src/components/dashboard/QuickAccess.tsx` | Create |

