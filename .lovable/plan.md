

# Wire All Buyer CTAs + Create Transaction Detail Page

## Overview

Create the missing `/dashboard/transactions/:transactionId` page as a full transaction tracking hub, wire all static CTA buttons on the dashboard to real routes, and add a centralized notification route resolver.

## Changes

### 1. New Edge Function: `supabase/functions/transaction-detail/index.ts`

Fetches comprehensive transaction data for the buyer. Accepts `{ transaction_id }`, validates buyer ownership, returns:
- Transaction: code, status, money_status, dispute_status, timestamps (created_at, delivered_at, verification_deadline_at, completed_at)
- Item: title, description, quantity, condition, brand, model
- Pricing: item_amount, platform_fee, processing_fee, buyer_total, currency_code
- Delivery terms: method, expected_delivery_date, verification_window_hours, address
- Delivery tracking: courier_name, tracking_number, tracking_url, shipped_at, delivered_at
- Delivery proof files: file URLs from delivery_proof_files joined with files
- Seller profile: full_name, avatar_url
- Escrow state: state, held_amount, released_amount, frozen_amount, refunded_amount
- Transaction status history: from money_status_history + transaction status changes
- Dispute summary: dispute id, status, reason, opened_at (if exists)
- Agreement snapshot: locked_at (if exists)
- Next action: derived from transaction status (same logic as `derivePrimaryAction`)

Add `[functions.transaction-detail] verify_jwt = false` to config.toml.

### 2. New Page: `src/pages/BuyerTransactionDetail.tsx`

Route: `/dashboard/transactions/:transactionId`

Layout: 3-column grid (2 cols main + 1 col sidebar) matching the uploaded HTML design.

**Sections** (following the uploaded design exactly):
- **Header**: Transaction code, created date, status badge, "Track Order" / primary CTA + "More Actions" dropdown
- **Escrow Protection Banner**: Shows held amount and escrow active message
- **Next Action Card** (sidebar on desktop, top on mobile): State-driven guidance with countdown timer for verification deadline. Buttons: "Verify Item Received" → `/verify`, "Raise Dispute" → inline or dispute flow. Other actions: Download Receipt, Contact Support, Report Issue
- **Item Details**: Image placeholder, title, quantity, condition, category, description
- **Delivery Details**: Method, expected date, destination address, delivery evidence thumbnails, courier reference
- **Transaction Timeline**: Vertical timeline showing all status transitions (completed steps in green, current in warning/amber, future in grey)
- **Buyer Protection Card**: Escrow explanation, "What happens next" checklist
- **Contact Seller Card**: Placeholder for messaging
- **Seller Information** (sidebar): Avatar, name, verified badge, member since, response time
- **Payment Summary** (sidebar): Item price, fees breakdown, total, money status badge, download receipt button

**Contextual action buttons** at bottom or in sidebar:
- Verify Item → `/dashboard/transactions/:transactionId/verify` (when `delivered_awaiting_verification`)
- View Locked Agreement → `/dashboard/transactions/:transactionId/agreement` (when agreement exists)
- View Dispute → `/dashboard/disputes/:disputeId` (when dispute exists)

### 3. New Service: `src/services/transaction-detail.service.ts`

```ts
export const getTransactionDetail = async (transactionId: string) => { ... }
```

### 4. Update `src/App.tsx`

Add route:
```tsx
<Route path="/dashboard/transactions/:transactionId" element={<BuyerTransactionDetail />} />
```

### 5. Wire `src/components/dashboard/RecentPurchases.tsx`

Add `useNavigate`. Each row's action button becomes clickable:
- `delivered_awaiting_verification` → `/dashboard/transactions/:transactionId/verify`
- All other statuses → `/dashboard/transactions/:transactionId`

### 6. Wire `src/components/dashboard/RecentNotifications.tsx`

Add `useNavigate`. Route resolution logic based on notification fields:
- `dispute_update` type → `/dashboard/disputes` (no dispute_id available from dashboard endpoint)
- `delivery_update` / `transaction_update` with `transaction_id` → `/dashboard/transactions/:transactionId`
- Security/system types → `/dashboard/profile`
- Fallback: no navigation

### 7. Update `supabase/config.toml`

Add `[functions.transaction-detail]` with `verify_jwt = false`.

## Files Summary

| File | Action |
|------|--------|
| `supabase/config.toml` | Add transaction-detail function config |
| `supabase/functions/transaction-detail/index.ts` | New edge function |
| `src/services/transaction-detail.service.ts` | New service |
| `src/pages/BuyerTransactionDetail.tsx` | New page |
| `src/App.tsx` | Add route |
| `src/components/dashboard/RecentPurchases.tsx` | Wire CTAs with navigate |
| `src/components/dashboard/RecentNotifications.tsx` | Wire CTAs with navigate |

