## Goal

Replace the mock data in `/admin/transactions` with real DB-driven data via a new admin-only edge function, mirroring the patterns used by `admin-dashboard`.

## Files

1. **NEW** `supabase/functions/admin-transactions-monitor/index.ts`
2. **NEW** `src/services/admin-transactions-monitor.service.ts`
3. **EDIT** `src/pages/AdminTransactions.tsx` — wire to service; remove mock rows; keep UI shell (KPIs / chips / table / mobile cards / empty + loading + error states).

## Edge Function: `admin-transactions-monitor`

### Auth (mirror `admin-dashboard`)
- Reject if no `Authorization: Bearer …` → 401.
- `auth.getUser(token)` → 401 on invalid.
- `rpc("has_role", { _user_id, _role: "admin" })` → 403 if false.
- After admin confirmation, use service-role client for queries.

### Input (POST JSON body, all optional)
```
{ search, transactionStatus, moneyStatus, disputeStatus, riskLevel,
  amountMin, amountMax, dateFrom, dateTo, quickFilter,
  page=1, pageSize=25, sortBy="created_at", sortDirection="desc" }
```
Validate with zod; clamp `pageSize` to 1–100; whitelist `sortBy` to `created_at | updated_at | transaction_code`.

### Quick filter mapping
- `awaiting_payment` → `status='awaiting_payment'`
- `funds_held` → `money_status='funds_held_in_escrow'`
- `in_dispute` → `dispute_status in ('open','seller_response_pending','under_review')`
- `overdue` → join disputes overdue OR `status='awaiting_payment' AND created_at < now()-24h`
- `refunded` → `money_status in ('refund_pending','refund_issued') OR status='refunded'`
- `failed` → exists failed payment for tx
- `flagged` → `needs_release_review=true`
- `frozen` → `money_status='funds_frozen'`

### Query plan
1. Build base `transactions` query with all filters; get `count: 'exact'` and ordered/paginated rows (id, transaction_code, status, money_status, dispute_status, buyer_id, seller_id, needs_release_review, payment_received_at, completed_at, created_at, updated_at).
2. For the page's tx ids, batch fetch in parallel:
   - `transaction_items` (title, description, condition_label) — pick first item per tx as headline.
   - `transaction_pricing` (item_amount, platform_fee_amount, processing_fee_amount, seller_net_amount, buyer_total_amount, currency_code).
   - `escrow_states` (state, held_amount, frozen_amount, released_amount, refunded_amount, last_changed_at).
   - `disputes` open per tx (id, status, opened_at, seller_response_due_at).
   - `money_status_history` latest per tx (changed_at).
   - `transaction_events` latest per tx (created_at, event_type) — last activity fallback.
   - `payments` latest per tx (status).
   - `profiles` for buyer_id+seller_id (id, full_name, email).
3. Map raw enums → display labels (per spec `Status mapping` and `Money status mapping`). Inside admin portal use "Awaiting Release" / "Release Review" — never "admin release".
4. Compute per-row:
   - `lastActivityAt = max(money_status_history.changed_at, transaction_events.created_at, updated_at)` + relative label.
   - `isOverdue` = open dispute with `seller_response_due_at < now()` OR `status='awaiting_payment' AND created_at < now()-24h`.
   - `isFrozen` = `money_status='funds_frozen'`.
   - `riskLevel` derived: `fraud_watch` if `needs_release_review && money_status='funds_frozen'`; `high_risk` if `needs_release_review`; `escalated` if open dispute; else `clean`.
   - `flags`: array combining the above.
   - `actionAvailability`: `{ canFreeze, canTrace, canViewNotes, canMore }` based on state.
   - `buyerEmailMasked / sellerEmailMasked`: only mask local part (`a***@domain`); names stay full.

### Summary block (uses same filters EXCEPT pagination)
- `totalTransactions` = filtered count.
- `totalAmount` = SUM(`transaction_pricing.buyer_total_amount`) for filtered tx (paged-in-server using `.in('transaction_id', filteredIds)` chunks, OR a single SQL via service-role + RPC; first cut: fetch all filtered ids in chunks of 1000 and sum via `transaction_pricing` rows).
- `inEscrowAmount` = SUM(`escrow_states.held_amount + frozen_amount`) for filtered tx.
- `inDisputeCount` = filtered count where dispute_status in active set.
- `awaitingActionCount` = union of: `release_review_queue.status='pending'`, `payouts.status='failed'` (filtered tx scope), overdue disputes, stuck (`status='awaiting_payment' < now()-24h`), `needs_release_review=true`. Counted as distinct tx ids.
- `flaggedCount` = filtered count where `needs_release_review=true`.

To keep cost bounded, summary scope is the same filter as the list (without page/pageSize). For "no filters" path we just count all transactions and aggregate from `escrow_states` / `disputes` directly.

### Response shape
```
{ summary: { totalTransactions, totalAmount, inEscrowAmount,
             inDisputeCount, awaitingActionCount, flaggedCount, currency: "NGN" },
  rows: AdminTxRow[],
  pagination: { page, pageSize, totalCount, hasNextPage, hasPreviousPage } }
```

### CORS / errors
- Same `corsHeaders` as `admin-dashboard` (POST, OPTIONS).
- Catch-all returns 500 with message; log via `edge_function_errors`.

## Service: `admin-transactions-monitor.service.ts`

- Export TypeScript interfaces matching the response.
- `getAdminTransactionsMonitor(params)` →
  - `supabase.auth.getSession()`; redirect to `/auth` if missing.
  - `supabase.functions.invoke("admin-transactions-monitor", { body: params, headers: { Authorization } })`.
  - Map 401 → redirect; 403 → throw `AdminAccessRequiredError`.
- Re-export `AdminAccessRequiredError` (or import from a shared file; first cut: local copy matching the existing pattern).

## Page: `src/pages/AdminTransactions.tsx`

- Replace `MOCK_TXS` and `SUMMARY_TILES` constants with state from `getAdminTransactionsMonitor`.
- Use `useEffect` keyed on `{search, activeQuick, page, pageSize, sortBy, sortDirection, advanced filters}` with debounced search.
- Show skeleton rows while loading; error banner on failure (with retry); existing empty-state copy when `rows.length === 0`.
- Pagination footer (Prev / Next + "Page X of Y") on both desktop table and mobile list.
- Action icons keep current callbacks (toasts) — no behavior change requested.
- Keep KPI tiles: bind to `summary` fields. Keep tooltips with exact NGN value via `formatMoney`.
- Sidebar `badges` continues to use the static `SIDEBAR_BADGES` for now (sidebar will be wired separately to the dashboard service in a follow-up).

## Out of scope (this iteration)
- Action handlers (Freeze / Notes / Trace) — still toasts.
- Realtime updates — manual Refresh button only.
- Admin-side detail drawer.

## Acceptance check
- Non-admin user gets 403 → page shows "Admin access required".
- Logged-out user redirected to `/auth`.
- All KPI numbers + rows are computed from DB; no hardcoded NGN values remain.
- Filters/search/pagination round-trip to backend.
- Mobile cards and desktop table render the same row data.
