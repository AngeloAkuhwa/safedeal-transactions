# Admin Notification Center — Full Plan (v2)

Port the uploaded HTML into a new admin page `/admin/notifications`, matching the reference 1:1 (dark slate cards, colored icon chips, KPI grid, filters, failed-deliveries table, delivery-performance bars, broadcast composer, recent activity log), wrapped in the existing `AdminLayout` (the sidebar already has a "Notifications" nav item).

---

## 1. Source-of-truth tables (read side)

Everything the screen displays is derived from tables that already exist. No schema changes required for v1.

| Screen area | Primary table(s) | Fields used | Join / derivation |
|---|---|---|---|
| **KPI: Sent Today** | `notifications` | `created_at`, `status` | `count(*) where created_at >= today AND status IN ('sent','read')` |
| **KPI: Failed Deliveries** | `notification_deliveries` | `delivery_status`, `created_at` | `count(*) where delivery_status='failed' AND created_at >= today` |
| **KPI: SMS Failures / Email Failures** | `notification_deliveries` | `channel`, `delivery_status` | grouped by `channel` where `delivery_status='failed'` (24h) |
| **KPI: In-App Delivery Rate** | `notifications` | `channel='in_app'`, `status` | `sent+read / total` for `channel='in_app'` (24h) |
| **KPI: Retry Queue** | `notification_deliveries` | `delivery_status='failed'`, `attempt_count < 3` | count of open retries |
| **Delivery Performance bars** | `notification_deliveries` | `channel`, `delivery_status` | success rate per channel (in_app/email/sms) last 24h |
| **Failed Deliveries table** | `notification_deliveries` ⨝ `notifications` ⨝ `profiles` ⨝ `transactions`/`disputes` | delivery: `channel, delivery_status, provider_response, attempt_count, sent_at`; notif: `title, type, related_transaction_id, related_dispute_id`; profile: `full_name, email, avatar_url`; txn: `code`; dispute: `id` | latest delivery row per notification where `delivery_status='failed'` |
| **Recent Activity log** | `notifications` ⨝ latest `notification_deliveries` ⨝ `profiles` | title, type, channel, status, created_at, recipient | last 20 |
| **Header "Live" + last sync** | client clock | — | polls every 30s |

Enums already in place: `notification_type` (transaction_update, payment_update, delivery_update, dispute_update, verification_update, security_alert, system_message, direct_message), `notification_channel` (in_app, email, sms, push), `notification_status` (pending, sent, failed, read), `delivery_status` (same shape).

---

## 2. Write side — how admin actions affect user-facing tables

Every button on the screen is scoped so we know exactly which user-side table it touches. v1 wires the read-only surface + audit trail; the two write actions (Retry, Broadcast) are behind the same edge function and produce concrete user-visible effects.

### 2a. Retry (per-row in Failed Deliveries table)
- **Writes to** `notification_deliveries`: bumps `attempt_count`, sets `delivery_status='pending'` then `'sent'`/`'failed'`, updates `sent_at`, `provider_response`.
- **Writes to** `notifications`: if final attempt succeeds, sets `status='sent'` (so the user's bell icon / `/dashboard/notifications` list starts showing it as delivered).
- **Writes to** `audit_logs`: `action='notification_retried'`, `actor_user_id=admin`, `target_user_id=recipient`, `metadata={notification_id, channel, attempt}`.
- **User-side effect**: the recipient's `SellerNotifications` / `BuyerNotifications` page reflects the new `status`; unread badge (from `notifications.is_read`) is untouched.

### 2b. Broadcast Message (composer)
- **Writes to** `notifications`: one row per targeted user (`user_id`, `type='system_message'`, `channel`, `title`, `message`, `metadata={broadcast_id, priority, audience}`).
- **Writes to** `notification_deliveries`: one row per (notification × selected channel) starting at `delivery_status='pending'`.
- **Respects** `notification_preferences`: skips users whose relevant flag is off (e.g. `system_alerts=false` for system_message; `marketing_messages=false` for marketing broadcasts).
- **Audience filtering** uses existing tables:
  - "All users" → `profiles`
  - "Buyers only" / "Sellers only" → `user_roles` where `role IN ('buyer','seller')`
  - "Verified users only" → `profiles` where verification flag is set
  - "Custom segment" → deferred (UI shows disabled option in v1)
- **Writes to** `admin_actions`: `action_type='broadcast_sent'`, `admin_user_id`, `action_notes=title`.
- **User-side effect**: recipients see the new item in their notifications list immediately (row exists in `notifications`); email/SMS delivery follows via `notification_deliveries`.

### 2c. "View User / View Transaction / View Dispute" quick links
- Read-only navigation to existing admin routes (`/admin/users/:id`, `/admin/transactions/:id`, `/admin/disputes/:id`). No writes.

### 2d. Export Report
- Client-side CSV of the current filtered rows. No writes. (Optional follow-up: log to `audit_logs` as `notifications_exported`.)

---

## 3. Files

**New**
- `src/pages/AdminNotifications.tsx`
- `src/components/admin/notifications/NotificationKpiCards.tsx` — 6 KPI cards.
- `src/components/admin/notifications/NotificationFiltersBar.tsx` — search + Channel/Status/Type selects + Failed-Only toggle.
- `src/components/admin/notifications/FailedDeliveriesTable.tsx` — retry-status pill, User/Dispute/Txn quick links, Retry + Details actions.
- `src/components/admin/notifications/DeliveryPerformance.tsx` — per-channel progress bars.
- `src/components/admin/notifications/BroadcastComposer.tsx` — title, body, priority, audience, channel checkboxes + amber warning banner.
- `src/components/admin/notifications/RecentActivityTable.tsx`
- `src/services/admin-notifications.service.ts` — typed wrappers for the two edge functions.
- `supabase/functions/admin-notifications/index.ts` — read aggregator (KPIs, performance, failed list, recent).
- `supabase/functions/admin-notifications-action/index.ts` — `retry` and `broadcast` writes (admin-role gated; writes to `notifications`, `notification_deliveries`, `admin_actions`, `audit_logs`).

**Edit**
- `src/App.tsx` — add `<Route path="/admin/notifications" element={<AdminNotifications />} />`.

**No migrations.** All required tables already exist (`notifications`, `notification_deliveries`, `notification_preferences`, `profiles`, `user_roles`, `admin_actions`, `audit_logs`). If we later want to track broadcast campaigns as first-class objects, we'd add a `broadcasts` table then — out of scope now.

---

## 4. Design fidelity
- `AdminLayout` `fullBleed` with a custom `headerSlot` mirroring the reference: title "Notification Center", subtitle, green "Live" pill, "Last sync: X min ago", right-aligned "Export Report" + "Broadcast Message" buttons.
- Existing semantic tokens + tailwind color families used elsewhere in admin (blue/red/orange/purple/amber/emerald with `/10` bg + `/20` border) to match the HTML palette.
- Icons via `lucide-react`: Send, AlertTriangle, Smartphone, Mail, Bell, RefreshCw, Search, Filter, Megaphone, Eye, Receipt, Scale, User, CheckCircle2, XCircle, Info.

## 5. Security
- Both edge functions call `requireAdmin` (same helper used by `admin-user-detail`).
- Broadcast enforces `notification_preferences` server-side so an admin can't override a user's opt-out for marketing.
- All writes leave an `audit_logs` row.

## 6. Out of scope (v1)
- Realtime subscriptions (poll every 30s instead).
- First-class `broadcasts` table / scheduled sends.
- "Custom segment" audience builder.
