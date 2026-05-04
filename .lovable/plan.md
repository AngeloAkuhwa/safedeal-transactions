## Goal
Make the four KPI cards on `/admin/dashboard` 100% database-driven, with safe handling of zero/missing data and proper NGN money formatting.

## Schema findings
- `transactions` has **no `needs_admin_review`** column. Closest equivalent is `needs_release_review` (boolean) plus `dispute_status`. We will use these as flagged signals.
- `user_sessions` has `last_seen_at` and `is_active` — usable for the preferred "Active Users" source.
- `escrow_states` exposes `held_amount` and `frozen_amount` — already what the spec requires.
- `profiles` exists as a fallback for "registered users".

## Backend changes — `supabase/functions/admin-dashboard/index.ts`

Update `buildDashboardPayload` so the four KPIs match the spec exactly.

1. **Total Transactions**
   - `total_transactions` = `count(*)` from `transactions`.
   - `total_transactions_delta_pct`: compare last 30 days vs the prior 30 days using `created_at`. Existing `calculateDeltaPct` is fine, but treat "no previous data" as `null` (unavailable), not `0` or `100`.

2. **Escrow Balance**
   - `escrow_balance_amount` = `sum(held_amount) + sum(frozen_amount)` from `escrow_states` (already correct — keep, ensure 2 dp via `toFixed(2)`).
   - `escrow_balance_delta_pct`: compute by snapshotting today's vs 30‑days‑ago value using `escrow_ledger_entries` (`balance_after` at cutoff). If no historical data, return `null`.
   - Explicitly do NOT include `released_amount` or `refunded_amount`.

3. **Active Users**
   - Preferred: `count(distinct user_id)` from `user_sessions where last_seen_at >= now() - 30d`.
   - Implement via service-role `select user_id` with a Set (Supabase JS has no `count distinct`). Cap rows with a windowed query and dedupe in code.
   - Delta: same window vs prior 30 days; `null` if previous = 0.
   - Fallback: if the preferred query errors or returns 0 rows total, use `count(*)` from `profiles` and add an `active_users_is_fallback: true` flag in the payload.

4. **Flagged Activity**
   - Sum of:
     - `count(transactions where needs_release_review = true)`
     - `count(disputes where status in ('open','under_review','seller_response_pending'))`
     - `count(audit_logs where action ~ flagged/risk action types)` if any rows exist; otherwise contributes 0.
   - Delta: same metric calculated over last 30d vs prior 30d using `created_at` / `opened_at` filters; `null` if no previous.

5. **Delta semantics**
   - Change `calculateDeltaPct` (or wrap it) to return `number | null`. `null` means "unavailable" → frontend renders `—`.
   - Update `AdminKpis` type in `src/services/admin-dashboard.service.ts` to allow `number | null` for all four `*_delta_pct` fields.

6. **Type / contract update**
   - Extend `AdminKpis` with optional `active_users_is_fallback?: boolean` so the UI can label the tile as "Registered Users" when needed.

7. **Caching / safety**
   - Keep the 20s in-memory cache.
   - Keep `safeCount` / `safeSum` so any single failed query yields `0` and the card still renders.
   - Log any per-KPI failure to `edge_function_errors` via existing `logEdgeError`.

## Frontend changes

### `src/services/admin-dashboard.service.ts`
- Update `AdminKpis`:
  ```ts
  total_transactions_delta_pct: number | null;
  escrow_balance_delta_pct:    number | null;
  active_users_delta_pct:      number | null;
  flagged_activity_delta_pct:  number | null;
  active_users_is_fallback?:   boolean;
  ```
- No other service changes — still calls the same edge function.

### `src/components/admin/dashboard/KpiCards.tsx`
- Keep current visual design, icons, grid, and stagger animations.
- Render delta:
  - If `delta === null` → show `—` in neutral slate color, no up/down arrow.
  - Else keep existing up/down + colored chip behavior.
- Money:
  - Escrow tile keeps `formatMoney(kpis.escrow_balance_amount, "NGN")` (already 2 dp, no `$`).
- Active Users tile:
  - If `kpis.active_users_is_fallback`, change label to "Registered Users" and tooltip explains the fallback.
- Zero-data safety:
  - All values default to `0` from the edge function; cards render normally.
  - Use `(value ?? 0).toLocaleString("en-NG")` defensively for counts.

## Out of scope
- No layout / visual redesign.
- No changes to other dashboard sections (action_required, trends, hotspots, etc.).
- No new tables or migrations.

## Acceptance verification
- Curl the `admin-dashboard` edge function as an admin, confirm payload contains numeric KPIs and either numeric or `null` deltas.
- Visually confirm `/admin/dashboard` shows NGN with 2 decimal places, `—` where deltas are unavailable, and `0` where data is empty.
