## Audit result

Executed:
- A1 Realtime migration (`REPLICA IDENTITY FULL` + publication on `notifications` / `notification_deliveries`).
- A2 `useRealtimeNotifications.ts` (per-user toasts + query invalidation).
- A3 Mounted in `BuyerNav.tsx` and `SellerNav.tsx`.
- A4 `useRealtimeAdminNotifications.ts` mounted in `AdminNotifications.tsx` (debounced invalidation).
- A5 Broadcast writes rows — untouched, works via A1.
- B2 `process-notification-deliveries` edge function exists, cron scheduled, respects `notification_preferences`, retry/attempt logic in place.
- B3 Inline-styled HTML with brand header + CTA + preferences link.
- B5 SMS rows left pending.
- C `useTypingIndicator.ts` wired into `MessageThread.tsx`.

Pending (real gaps found):
1. **B1 gateway wiring** — worker calls `https://api.resend.com/emails` directly with `Authorization: Bearer ${RESEND_API_KEY}`. Plan says route via Lovable connector gateway (`https://connector-gateway.lovable.dev/resend/emails` with `Authorization: Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key: ${RESEND_API_KEY}`). Also needs `RESEND_FROM_EMAIL` env var so we don't hardcode the sender.
2. **C presence dots** — `AdminNotifications.tsx` does not import `useOnlinePresence`; Failed / Recent Activity tables have no green dot next to recipient.
3. **C "online now" hint** — Broadcast composer has no `≈ X recipients online now` line under the audience selector.
4. **SMS-pending banner** — no visible "SMS provider not configured — rows queued" banner in `AdminNotifications.tsx` (only a generic worker status banner exists).

## Plan to close the gaps (small, additive, no redesign)

### 1. Switch worker to connector gateway
File: `supabase/functions/process-notification-deliveries/index.ts`
- Replace the `fetch("https://api.resend.com/emails", …)` call with:
  ```
  POST https://connector-gateway.lovable.dev/resend/emails
  Authorization: Bearer ${LOVABLE_API_KEY}
  X-Connection-Api-Key: ${RESEND_API_KEY}
  ```
- Read `LOVABLE_API_KEY` from env; keep the existing `RESEND_API_KEY` check.
- Read `from` from `RESEND_FROM_EMAIL` env (fallback `SafeDeal <onboarding@resend.dev>` with a warning log).
- Keep existing retry / `attempt_count` / `provider_response` logic.
- Keep `response.ok` check + error body capture (already there).

### 2. Presence dots in `AdminNotifications.tsx`
- Import `useOnlinePresence` and call `const { isOnline } = useOnlinePresence();` at the top of the page.
- In the Failed deliveries table row and Recent Activity table row, render `<PresenceDot online={isOnline(row.user_id)} />` (existing component) next to recipient name/email — same visual pattern used in `AdminUsers.tsx`.

### 3. "Online now" hint in Broadcast composer
- In `BroadcastComposer` (inside `AdminNotifications.tsx`), after resolving the currently selected audience list (already fetched for the recipient count), compute `onlineCount = audienceIds.filter(id => isOnline(id)).length`.
- Render a small muted line under the audience selector: `≈ {onlineCount} recipients online now` (hidden when audience is empty).

### 4. SMS-pending banner
- In `AdminNotifications.tsx`, add a lightweight yellow banner above the tables when the KPI payload reports any queued SMS rows: `SMS provider not configured — SMS notifications are queued and will send once a provider is wired.`
- No backend change needed — the existing KPI query already returns per-channel counts; if not, add `sms_pending` to the `admin-notifications` KPI response (small addition).

### 5. Secret to add
`RESEND_FROM_EMAIL` — will request via `add_secret` after you confirm the exact verified sender address (e.g. `notifications@safedeal.ng`), or I default to `SafeDeal <onboarding@resend.dev>` (test-only) if you want to defer.

## Not touched
Notification list design, KPI card design, drawer, `admin-notifications-action`, in-app notification path, existing worker retry logic. All changes are additive.
