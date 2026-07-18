## Goal
Remove all remaining fake/hardcoded values on the Notification Center so every number, label, and list comes from real project tables.

## Current state (verified)
- KPI cards, delivery performance, failed queue, and recent activity already query `notifications` + `notification_deliveries` via `admin-notifications` edge function — real data.
- Broadcast/retry writes go to real tables via `admin-notifications-action`.

## What's still fake / misleading (only these)
1. **KPI trend deltas** in `KpiCards` fall back to hardcoded strings: `"+18%"`, `"+5%"`, `"+12%"`, `"+8%"`, `"-23%"` when the edge function doesn't return them (it never does). The "In-App Rate" trend also just re-prints the value.
2. **Broadcast audience labels** in `BroadcastComposer` say `"Active Transactions Only"` and `"Premium Members"` but the backend actually resolves `buyers` → users with `buyer` role and `sellers` → users with `seller` role from `user_roles`, and `verified` → approved `identity_submissions`. Labels don't match behavior.
3. Placeholder text in Broadcast title/message inputs is fine (placeholders, not data), but keep only if it's clearly a hint.

## Plan

### 1. Edge function `admin-notifications` — return real 24h-over-24h trends
- Query a second window: `[now-48h, now-24h)` for the same aggregates (sent, failed, sms_failures, email_failures, retry_queue, in_app_rate).
- Compute `_delta` percent for each KPI:
  - `delta = prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 1000) / 10`
- Return `kpis.sent_delta`, `failed_delta`, `sms_delta`, `email_delta`, `in_app_delta`, `retry_delta` plus a `compared_to: "yesterday"` string.
- Keep existing shape backward-compatible.

### 2. Service typing
- Extend `AdminNotifKpis` in `src/services/admin-notifications.service.ts` with the optional `*_delta: number` fields.

### 3. UI `KpiCards`
- Remove hardcoded `"+18%"`/etc fallbacks.
- Render each trend from the real `*_delta` number:
  - Format `+X%` / `-X%` / `0%`.
  - Color: green if favorable direction, red if unfavorable, muted if 0. (Favorable: `sent_delta` up = good; `failed`, `sms`, `email`, `retry` up = bad; `in_app_rate` up = good.)
- "In-App Rate" card: keep value as `X%`, show `in_app_delta` (pp change) with sub `"vs yesterday"`.
- If a delta is missing/undefined, render `—` instead of a fake number.

### 4. Broadcast audience labels — match real backend behavior
In `BroadcastComposer` `Select`:
- `all` → "All Users"
- `buyers` → "Buyers (users with buyer role)"
- `sellers` → "Sellers (users with seller role)"
- `verified` → "Verified Users (identity approved)"
Remove the misleading "Active Transactions Only" / "Premium Members" strings.

### 5. Sanity pass
- Grep the page for any remaining literal counts, percentages, or arrays; confirm nothing else is hardcoded.
- No schema changes, no new tables.

## Files touched
- `supabase/functions/admin-notifications/index.ts` (add prev-window aggregates + deltas)
- `src/services/admin-notifications.service.ts` (extend `AdminNotifKpis`)
- `src/pages/AdminNotifications.tsx` (`KpiCards` real deltas, `BroadcastComposer` accurate audience labels)

## Out of scope
No design/layout changes, no new sections, drawer/dashboards untouched.
