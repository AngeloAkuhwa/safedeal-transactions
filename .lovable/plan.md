## Next up: Item #12 — Scope admin realtime channels

Batches A–D are complete end to end (P0 security, dashboard/list/search SQL pagination, unified audit + diff UI). The next unfinished item in the audit list is **#12 — Realtime admin channels have no row-level scoping**.

(#13 Impersonation is deferred per your instruction — it belongs to the new dedicated screen. #14 token sweep and #16 tests are P3 backlog. So #12 is the last non-deferred item before we're 100% done.)

### Problem (verified)
`src/hooks/useRealtimeAdminNotifications.ts` and the sibling admin realtime hooks subscribe to entire tables (`notifications`, `disputes`, `transactions`, `admin_actions`) with no server-side filter. At platform scale every admin browser receives every insert/update — thousands per minute — which:
- drowns the browser event loop and React state,
- pushes noisy low-severity events into toasts/badges,
- makes the "unread" counters lag or spike.

### Fix

1. **Server-side filters on every admin channel.** Change each `postgres_changes` subscription to pass a `filter:` clause so Postgres only forwards rows the admin actually cares about:
   - `notifications`: `severity=in.(high,critical)` OR `audience=eq.admin`.
   - `disputes`: `status=in.(open,escalated,under_review)`.
   - `admin_actions`: `action_type=in.(reveal_field,export_data,impersonate_start,impersonate_end,vendor_status_change,identity_review)`.
   - `transactions` (monitor): only `status=in.(flagged,frozen,disputed)` — routine status flips don't need to page every admin.

2. **"Load older" for the long tail.** The realtime stream now only carries high-signal events. For the full list the UI already paginates via the SQL endpoints from Batch B/C — add an explicit "Load older activity" button in `AdminNotifications` and the dashboard activity feed instead of streaming everything.

3. **One shared channel factory.** Introduce `src/hooks/useAdminRealtimeChannel.ts` that wraps `supabase.channel()` with:
   - a stable channel name per (table, filter),
   - automatic teardown on unmount,
   - a small in-memory de-dupe (last 200 event ids) so retries don't double-fire toasts.
   Refactor `useRealtimeAdminNotifications`, the dispute list hook, and the transactions-monitor hook to use it.

4. **Toast throttling.** Even with filters, bursts happen. Cap toast surfacing to ≤ 1 per second per channel (collapse the rest into an aggregated "+N new" badge).

5. **Backend: broadcast for cross-admin signals.** For events that don't map cleanly to a filter (e.g. "another admin just took this dispute"), add a lightweight Postgres `pg_notify` → Supabase Broadcast channel `admin:events` published from the unified `logAdminAction` helper. Admin clients subscribe once; payload contains `{action, target_type, target_id, actor}` only — no row data.

### Files touched
- `src/hooks/useRealtimeAdminNotifications.ts` (rewrite subscription with filter)
- `src/hooks/useAdminRealtimeChannel.ts` (new shared factory)
- `src/hooks/useAdminDisputeRealtime.ts`, `src/pages/AdminTransactions.tsx` realtime block (refactor to factory + filters)
- `src/pages/AdminNotifications.tsx` (add "Load older", wire throttled toasts)
- `supabase/functions/_shared/audit.ts` (optional broadcast emit on `logAdminAction`)

### Out of scope
- Impersonation (#13) — deferred to the new impersonation screen.
- Design-token sweep (#14) and integration tests (#16) — P3 backlog.

After #12 lands, the P0 + P1 + P2 audit list is 100% complete and only the explicitly-deferred P3 items remain.