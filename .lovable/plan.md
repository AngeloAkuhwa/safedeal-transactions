# Fix Delivery Performance on Admin Notifications

## Root cause (verified)

The Delivery Performance panel reads all three channels (`in_app`, `email`, `sms`) from the `notification_deliveries` table. Confirmed with a live query on the last 24h:

- `notification_deliveries`: only 5 rows, all `email` / `failed`. Zero rows for `in_app` or `sms`.
- `notifications`: 77 `in_app` rows (5 `sent`, 72 `pending`) and 5 `email` rows (`pending`).

In-app notifications never write to `notification_deliveries` — they are delivered the instant a row lands in `notifications` (that's what the bell + realtime hook consume). So the panel is structurally incapable of showing anything for in_app, and the KPI "In-App delivery rate" is stuck at 0%.

Email shows 0% delivered because every attempt in the last 24h genuinely failed (Resend 401 — the `RESEND_API_KEY` connector key on the worker is unauthorized). That's a separate credentials issue, not a metrics bug — but the panel should still reflect it truthfully once in-app is fixed.

## Fix (backend only, one file)

Edit `supabase/functions/admin-notifications/index.ts`:

1. Compute `in_app` performance from the `notifications` table (already loaded as `notifs` / `notifsPrev`), not from `notification_deliveries`:
   - `total` = count of `notifs.channel === 'in_app'`
   - `sent`  = count where `status IN ('sent','read')` OR `is_read = true` OR `status = 'pending'` (in-app is delivered on insert; only `failed` counts as not-delivered)
   - `failed` = count where `status = 'failed'`
   - `rate` = `sent / total` when `total > 0`
2. Keep `email` and `sms` sourced from `latestDels` (unchanged).
3. Apply the same in-app-from-notifications logic to the KPI `in_app_rate` (and its `in_app_delta` prev-window twin) so the top KPI and the panel stay consistent.
4. No schema change, no frontend change, no new query — the data is already fetched in the same function.

## Note on the failing emails

The 5 email deliveries failing with `401 unauthorized` are unrelated to this metrics fix — they're the Resend gateway rejecting the connector key. Fixing metrics will correctly show `email: 0% delivered (0/5)` until the Resend connection is re-linked. Happy to address that separately if you want.
