## Goal
Make notifications real-time across the app, and wire real email delivery via Resend using the saved `RESEND_API_KEY`. SMS stays queued/pending until a provider is chosen. No web push.

## Confirmed inputs
- `RESEND_API_KEY` already saved as project secret.
- Sender: `SafeDeal <onboarding@resend.dev>` (Resend restricts this to the account owner's own verified email; noted as a limitation in the admin banner).
- Resend called **directly** at `https://api.resend.com/emails` with `Authorization: Bearer $RESEND_API_KEY` — no connector gateway wiring needed since the key is already in env.

## Part A — Realtime fan-out

### A1. Migration — enable realtime
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_deliveries;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.notification_deliveries REPLICA IDENTITY FULL;
```
`notifications` RLS already scopes per user, so subscribers only see their own rows.

### A2. `src/hooks/useRealtimeNotifications.ts`
- Subscribes to `postgres_changes` on `notifications` filtered by `user_id=eq.<uid>` (INSERT + UPDATE).
- On INSERT: invalidates `["buyer-notifications"]`, `["seller-notifications"]`, `["notification-summary"]`, `["dashboard"]`; shows toast unless tab is hidden.
- Cleans up channel on unmount.

### A3. Mount points (no UI redesign)
`BuyerNav.tsx`, seller nav shell, `BuyerNotifications.tsx`, `SellerNotifications.tsx`, `Dashboard.tsx`, `SellerDashboard.tsx` (dashboards: invalidation only).

### A4. Admin Notification Center realtime
`useRealtimeAdminNotifications` in `AdminNotifications.tsx`:
- Subscribes to `notifications` + `notification_deliveries` (INSERT + UPDATE, no user filter — admin scope).
- Debounced (~750 ms) invalidation of `["admin-notifications"]` to absorb broadcast bursts.
- "Last sync" reflects live events.

Existing `admin-notifications-action` broadcast already inserts one `notifications` row per recipient — A1 makes those live automatically.

## Part B — Real email delivery via Resend

### B1. Edge function `supabase/functions/process-notification-deliveries/index.ts`
Runs on `pg_cron` every 1 minute (see B2).

Per run:
1. Uses service-role client.
2. Selects up to 50 `notification_deliveries` where `channel='email'` AND `delivery_status='pending'` AND `attempt_count < 3`, oldest first.
3. Joins `notifications` (title, message, user_id, related_transaction_id, metadata) and `profiles` (email, full_name).
4. Checks `notification_preferences.email_notifications` for that user + type. If opt-out, mark `delivery_status='suppressed'` and skip.
5. Sends via Resend directly:
   ```ts
   fetch("https://api.resend.com/emails", {
     method: "POST",
     headers: {
       "Content-Type": "application/json",
       Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
     },
     body: JSON.stringify({
       from: "SafeDeal <onboarding@resend.dev>",
       to: [profile.email],
       subject: notification.title,
       html: renderEmail(notification, profile),
     }),
   });
   ```
6. On 200: `delivery_status='sent'`, `sent_at=now()`, `provider_response=<resend id>`.
7. On non-2xx: increment `attempt_count`, store body in `provider_response`; stays `pending` until 3 attempts, then `failed`.
8. SMS rows (`channel='sms'`) are skipped entirely — left pending, no attempt bump.

Response captured via `response.ok` check + `await response.text()` on failure (per gateway error-surfacing rules, same pattern for direct API).

### B2. Cron schedule (insert tool, not migration)
Enable `pg_cron` + `pg_net`, then:
```sql
select cron.schedule(
  'process-notification-deliveries',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://cfkdasmhlqswpunugbkf.supabase.co/functions/v1/process-notification-deliveries',
    headers:='{"Content-Type":"application/json","apikey":"<anon>","Authorization":"Bearer <anon>"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
```

### B3. Email HTML
Simple inline-styled template built in the edge function:
- White background, sky-blue accent (brand identity), Inter-ish system font stack.
- Header: "SafeDeal".
- Body: notification `title` (H2) + `message` (P).
- CTA button when `metadata.route` is present → `${APP_URL}${route}` (APP_URL from env, fallback to project preview URL).
- Footer: "You're receiving this because SafeDeal email notifications are enabled. Manage preferences: <link to /dashboard/profile#notifications>".
- No React Email scaffolding for this iteration (kept lean, single function file).

### B4. Admin banners
- Small note in `AdminNotifications.tsx` header: "Email sender: onboarding@resend.dev (owner-only until custom domain configured)".
- Small note: "SMS provider not configured — SMS rows are queued and not sent".

### B5. Realtime tie-in
Because A1 enables realtime on `notification_deliveries`, worker status flips (`pending → sent | failed`) surface live in admin Failed table + KPI cards with no extra plumbing.

## Part C — Presence / typing

- **Online dot** on admin Failed + Recent Activity tables via existing `useOnlinePresence().isOnline(userId)`.
- **Broadcast composer hint**: "≈ X recipients online now" under the audience selector, computed from resolved audience ∩ presence set.
- **Typing indicator** — added ONLY in `src/components/transactions/MessageThread.tsx` via a new `useTypingIndicator(threadId)` using Supabase channel `broadcast` events (no DB writes). Not added to notifications.

## Part D — Out of scope
- Web push / service worker / VAPID.
- Marketing / bulk email.
- SMS sends (queued, not delivered).
- Auth email delivery (unchanged).
- Custom Resend sender domain (using `onboarding@resend.dev` until you provide a verified domain).

## Files touched
- Migration: realtime + REPLICA IDENTITY on 2 tables.
- Cron schedule (via insert tool).
- New edge function: `supabase/functions/process-notification-deliveries/index.ts`.
- New hooks: `useRealtimeNotifications.ts`, `useRealtimeAdminNotifications.ts`, `useTypingIndicator.ts`.
- Small edits: `BuyerNav.tsx`, seller nav shell, `BuyerNotifications.tsx`, `SellerNotifications.tsx`, `Dashboard.tsx`, `SellerDashboard.tsx`, `AdminNotifications.tsx`, `MessageThread.tsx`.
- No changes to: existing notification UI design, KPI card design, drawer, business logic, or `admin-notifications-action`.

## Build order
1. Realtime migration.
2. `process-notification-deliveries` edge function.
3. pg_cron schedule via insert tool.
4. Realtime hooks + mount points.
5. Admin presence dots + "online now" hint + banners.
6. Typing indicator in `MessageThread.tsx`.
