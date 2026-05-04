
## Goal

Wire the remaining admin dashboard pieces (Trend chart switcher, Recent Activity, Critical Alerts, Sidebar Badges) to real database values. No demo data.

## Changes

### 1. New edge function: `supabase/functions/admin-dashboard-trend/index.ts`

- Accepts `?window=7D|30D|90D` (default `7D`).
- Auth: same JWT + `has_role('admin')` check as `admin-dashboard`.
- Loads `transactions(created_at)` and `disputes(created_at)` over the window via service role.
- Buckets rows into daily UTC dates; zero-fills missing days.
- Response:
  ```json
  {
    "primary_label": "Transactions",
    "secondary_label": "Disputes",
    "points": [{ "label": "MM-DD", "date": "YYYY-MM-DD", "primary": n, "secondary": n }]
  }
  ```
- CORS: `Access-Control-Allow-Methods: GET, OPTIONS`.

### 2. `supabase/functions/admin-dashboard/index.ts`

**Recent Activity** (replace current 3-item history block) — pull and merge latest from:
- `transactions` where `status='completed'` ordered by `updated_at` desc, limit 10 → `transaction_completed`.
- `money_status_history` where `new_status='funds_released'` desc, limit 10 → `escrow_released`.
- `profiles` ordered by `created_at` desc, limit 10 → `user_registered`.
- `disputes` ordered by `opened_at` desc, limit 10 → `dispute_opened`.
- `disputes` where `resolved_at is not null` desc, limit 10 → `dispute_resolved`.
- `payouts` where `status='failed'` ordered by `failed_at` desc, limit 10 → `payout_failed`.
- `refunds` where `status='completed'` ordered by `completed_at` desc, limit 10 → `refund_issued`.

Map each to:
```ts
{ id, kind, title, subtitle, amount?: number, currency?: 'NGN', at_iso, action_href? }
```
Sort by `at_iso` desc, slice 10.

**Critical Alerts** — generate dynamically. Read thresholds from `system_settings` (keys: `escrow_balance_min_threshold`, `dispute_queue_overflow_threshold`, `webhook_failure_spike_threshold`, `failed_payout_spike_threshold`, `stale_transaction_spike_threshold`). Fallbacks: dispute=30, webhook=5, failed_payout=5, stale=10. Escrow alert only if a threshold setting exists. Produce alerts only when condition is met. Each alert: `{id, title, description, severity, at_iso}`.

**Sidebar Badges** — replace current values:
- `disputes`: open + under_review + seller_response_pending count.
- `identity`: `identity_submissions where status='pending_review'` count.
- `payouts`: failed (retry_allowed=true) + awaiting_release count.
- `flagged_users`: distinct `target_user_id` from `admin_actions` in last 7 days where action_type in ('flag_user','freeze_transaction','escalate_case'); fallback 0.
- `exports`: 0 (no exports table).

### 3. `src/services/admin-dashboard.service.ts`

- Extend `AdminActivityItem.kind` union to include: `dispute_opened`, `dispute_resolved`, `payout_failed`, `refund_issued`. Add optional `amount?: number`, `currency?: string`, `action_href?: string | null`.
- Extend `AdminAlert.severity` already supports red/yellow/blue (no change).
- Replace `buildTransactionsDisputesTrend` with real fetch:
  ```ts
  export async function getAdminDashboardTrend(window: '7D'|'30D'|'90D'): Promise<TrendSeries>
  ```
  → invokes `admin-dashboard-trend` with `?window=...` and current session token. Reuses 401/403 handling.

### 4. `src/components/admin/dashboard/TrendCharts.tsx`

- Use React Query: `useQuery({ queryKey: ['admin-dashboard-trend', win], queryFn: () => getAdminDashboardTrend(win), staleTime: 30_000 })`.
- Initial 7D data still seeded by `initialTransactions` via React Query `initialData` when `win === '7D'`.
- Show small inline spinner overlay inside the chart card while fetching a new window; the rest of the dashboard does not reload.

### 5. `src/components/admin/dashboard/RecentActivity.tsx`

- Extend `ICONS` mapping for new kinds (`dispute_opened` → AlertTriangle red, `dispute_resolved` → CheckCircle emerald, `payout_failed` → XCircle red, `refund_issued` → Undo2 yellow).
- Render optional `amount` formatted with `formatMoney(amount, currency || 'NGN')` next to the title when present.
- Clicking the row navigates via `useAdminNav` if `action_href` present.

### 6. Deploy `admin-dashboard` and `admin-dashboard-trend`

## Acceptance

- 7D / 30D / 90D switcher refetches from `admin-dashboard-trend` only; chart card shows local loading; rest of dashboard stays put.
- Recent Activity lists up to 10 real events from 7 sources, newest first.
- Critical Alerts only render when DB-backed conditions are exceeded; empty state shown otherwise.
- Sidebar badges reflect real counts.
- No demo/hardcoded values remain in these sections.
