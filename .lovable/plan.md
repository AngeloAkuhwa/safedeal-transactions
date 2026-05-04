
## Goal

Replace remaining hardcoded/empty financial values in the admin dashboard with real database-driven data, surfaced through the existing `admin-dashboard` edge function.

## Scope

Only data wiring. No visual redesign. Money stays in NGN with 2 decimals via `formatMoney(value, "NGN")`.

## Changes

### 1. `supabase/functions/admin-dashboard/index.ts`

**Payment Health** (replace existing counts with correct status sets):
- Successful Payments: `payments` where `status in ('success','paid','completed','succeeded')`.
- Failed Payments: `payments` where `status in ('failed','cancelled')`.
- Webhook Failures: `payment_webhook_logs` where `processed_successfully = false` (last 30d).
- Reconciliation Mismatches: count successful payments in last 30d that have **no matching** `escrow_ledger_entries` deposit (`entry_type in ('deposit','escrow_credit')`) for the same `transaction_id`. Also flag held-amount vs payment-amount mismatch on `escrow_states` for those tx. If the join surface returns no candidates, return `0`. Add a `// TODO: extend reconciliation rules` comment for future duplicate-webhook detection.

**Payout Health**:
- `pending_payouts_amount`: `sum(amount)` from `payouts` where `status in ('awaiting_admin_release','awaiting_release','pending','processing')`. Use whichever statuses exist (try the broader set; safeSum tolerates missing).
- `avg_payout_hours`: average of `(completed_at - released_at)` in hours, over `payouts` where `status='completed'` and both timestamps present in last 30d. Fallback to `(completed_at - last_release_attempt_at)` then `(completed_at - updated_at)` only if `released_at` null. Return `null` if no rows.
- `spark`: 9-day buckets of completed payout counts (oldest→newest), built like the identity sparkline.

**Escrow/Releases/Refunds Trend** (`trends.escrow_releases_refunds`):
- Pull `escrow_ledger_entries` rows with `created_at >= now() - 30d`, fields `created_at, entry_type, amount`.
- Group by day (UTC `YYYY-MM-DD`).
- Map entry_types:
  - primary (Escrow Held): `entry_type in ('deposit','escrow_credit','escrow_hold')` → sum `amount`.
  - secondary (Released): `entry_type in ('payout_debit','release')` → sum `abs(amount)`.
  - tertiary (Refunded): `entry_type in ('refund_debit','refund')` → sum `abs(amount)`.
- Output 30 points `{label: 'MM-DD', primary, secondary, tertiary}` (zero-fill missing days).
- Replace the current `emptyEscrowTrend` placeholder.

Keep `trends.transactions_vs_disputes` as-is for this step (separate scope).

### 2. No frontend changes required

`TrendCharts.tsx`, `RiskAndPaymentHealth.tsx`, `IdentityAndPayoutHealth.tsx`, and `admin-dashboard.service.ts` already render these fields and are NGN/2-decimal correct via `formatMoney`. No new types.

### 3. Deploy

Redeploy the `admin-dashboard` edge function.

## Acceptance criteria

- Payment Health rows reflect live counts from `payments` + `payment_webhook_logs` + reconciliation check.
- Payout Health shows live pending NGN amount, avg hours (or `—`), and 9-day completed sparkline.
- Escrow/Releases/Refunds chart renders 30 days of grouped ledger movements.
- No hardcoded money values remain anywhere on `/admin/dashboard`.
- Zero-data case renders cleanly (0 / `—` / flat chart).
