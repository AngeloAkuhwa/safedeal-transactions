## Problem
Manual retry from the admin UI is blocked once a delivery hits 3 attempts. All rows in the Failed table show `Failed 3/3`, so:
- The `Retry` button hits `admin-notifications-action` which returns `409 max_attempts_reached` and does nothing.
- Even if status flipped to `pending`, the worker query filters `attempt_count < 3` and would skip the row.
Result: no way for an admin to re-send a failed email/notification.

## Fix (small, backend-only + tiny UI toast wording)

### 1. `admin-notifications-action` — allow admin-initiated retry regardless of attempt count
File: `supabase/functions/admin-notifications-action/index.ts`, `action === "retry"` branch.
- Remove the `>= 3` block.
- Reset the row for a fresh worker pickup:
  - `delivery_status = 'pending'`
  - `attempt_count = 0` (admin override — audit log still records that a human forced it)
  - `sent_at = null`
  - `provider_response = null`
- Also reset the parent notification row so the UI status matches:
  - `notifications.status = 'pending'` where `id = del.notification_id` and current status is `failed` or `sent`.
- Keep the existing `audit_logs` entry, and add `manual_admin_retry: true` + previous `attempt_count` to the metadata so we can prove it wasn't an automatic retry.

### 2. Add `action === "retry_all_failed"` (bulk)
Same file, new branch. Admin-only.
- Accepts optional `{ channel?: 'email'|'sms', notification_type?: string }` for scoping; defaults to all failed email rows in the last 24h (matches the visible Failed table window).
- Selects `notification_deliveries` where `delivery_status = 'failed'` (and the optional filters).
- Batches the same reset as (1) in chunks of 200.
- Returns `{ success: true, retried: N }`.
- Writes one summarized `audit_logs` row (`notifications_bulk_retried`, count, filters) instead of one per delivery.

### 3. UI wiring — `AdminNotifications.tsx` + `admin-notifications.service.ts`
- `retryNotificationDelivery` already exists and will now succeed on 3/3 rows without code changes (backend allows it).
- `handleRetryAll` currently loops the single-row endpoint and skips `!retriable` rows. Replace it with a single call to a new service function `retryAllFailedNotifications({ channel: 'email' })` that hits the new bulk action.
- Remove the `retriable` gating on the row-level Retry button (`r.retriable && …` and `disabled={!r.retriable …}`). Every failed row is retriable now; keep the spinner while `retrying === r.delivery_id`.
- On success, toast `Queued N deliveries for retry` and invalidate the `admin-notifications` query so the badge/table refresh via existing realtime hook.

### 4. Worker — no change needed
`process-notification-deliveries` already picks up `delivery_status = 'pending' AND attempt_count < 3`. Because step 1 resets `attempt_count` to 0, the next cron tick (≤1 min) sends the email through the Resend gateway using the just-configured `RESEND_FROM_EMAIL`.

## Not touched
- Retry cap for automatic worker retries stays at 3 (unchanged).
- Broadcast composer, KPI cards, filters, presence dots, realtime hooks, cron schedule.
- No schema changes; `notification_deliveries` already has `attempt_count`, `provider_response`, `sent_at`.

## Verification after build
1. Click Retry on a `Failed 3/3` row → toast "Retry queued", row flips to `Pending 0/3` within a second (realtime), then to `Sent` after the next cron tick if Resend accepts (or back to `Failed 1/3` with the new provider error, which is now visible for debugging).
2. Click "Retry All Failed" → toast reports the count, all failed email rows flip to pending in one round trip.
3. `audit_logs` shows `notification_retried` (single) or `notifications_bulk_retried` (bulk) rows attributed to the current admin.
