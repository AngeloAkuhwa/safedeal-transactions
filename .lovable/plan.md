## Goal
Make the `/admin/transactions` screen feel live: better search/sort, expanded filters in a mobile bottom sheet, manual refresh + last-updated stamp, real Supabase realtime sync with graceful fallback, and a layout that never overflows horizontally.

## Files

- `supabase/functions/admin-transactions-monitor/index.ts` — extend search + sorting
- `src/services/admin-transactions-monitor.service.ts` — extend `sortBy` union
- `src/pages/AdminTransactions.tsx` — interactions, realtime, sort menu, mobile filter sheet
- New SQL migration — add the 7 monitor tables to the `supabase_realtime` publication

## A. Edge function

1. **Search expansion** — current search resolves over `transactions.transaction_code`, `transaction_items.title`, and `profiles.full_name/email`. Add:
   - `transaction_items.category` (silent fallback if column absent)
   - `profiles.phone ilike %digits%` for the party id resolver
2. **Sorting** — accept `sortBy` ∈ `created_at | updated_at | transaction_code | amount | last_activity_at | status | risk_level | urgency`.
   - For DB-sortable columns (`created_at`, `updated_at`, `transaction_code`, `status`) use `.order()` directly.
   - For `amount`, `last_activity_at`, `risk_level`, `urgency` (default): fetch the page using `created_at desc`, then sort the enriched page in-memory by the requested key. Urgency rank: active dispute → frozen escrow → fraud_watch/high_risk → needs_release_review → overdue → failed payment/payout → newest activity.
3. Default `sortBy` becomes `urgency` when omitted.

## B. Service

- Extend `AdminTxMonitorParams.sortBy` union to include `amount | last_activity_at | status | risk_level | urgency`.
- No shape changes elsewhere.

## C. Page rewrite (interactions)

**Search**
- Debounce 350 → **400 ms**.
- Show a small spinner inside the input while a fetch is in flight (background fetches only — never re-skeleton KPIs).

**Loading state split**
- `initialLoad` (skeleton everywhere) only on first mount or when access state changes.
- `isFetching` dims/overlays just the table + cards, leaves KPIs and chrome untouched.

**Quick tabs** — unchanged behaviour (already wired).

**Advanced filters**
- Add `Risk Level` select (clean / escalated / high_risk / fraud_watch).
- Existing: tx status, money status, dispute status, amount min/max, date from/to.
- `Clear Filters` resets quick filter, search, all selects, dates, amounts; `page=1`; preserves `pageSize`.

**Sorting UI**
- New "Sort" menu beside the "Filters" trigger.
- Options: Urgency (default), Newest, Oldest, Amount ↓, Amount ↑, Last activity, Status, Risk.
- Selecting an option sets `sortBy`/`sortDirection` and resets `page` to 1.

**Refresh + last updated**
- Track `lastUpdatedAt` after each successful fetch.
- Show "Updated 2 min ago" near the Refresh button (auto-ticks every 30 s).
- Refresh button calls `fetchData()` (no toast spam).

**Live sync pill**
- Replace the always-on emerald pill with state-driven:
  - emerald pulsing "Live sync" when realtime channel is `SUBSCRIBED`
  - muted "Manual refresh" when channel is closed/errored

**Realtime**
- Subscribe one channel `admin-tx-monitor` with `postgres_changes` (event `*`, schema `public`) on:
  `transactions`, `transaction_events`, `money_status_history`, `disputes`, `payments`, `payouts`, `release_review_queue`.
- On any change → schedule a debounced (1.5 s) refetch with current filters/page; show one sonner toast `Transaction monitor updated` (deduped within 5 s).
- On `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` → flip pill state.

**Mobile filter bottom sheet**
- Replace the inline toggled grid (mobile only) with a shadcn `Sheet` (`side="bottom"`).
- Body: all advanced filters stacked.
- Footer: `Clear` (resets local sheet state + applied filters) and `Apply` (commits + closes + refetches).
- Search stays above the cards on the page itself.
- Desktop unchanged: inline grid panel.

**Layout safety**
- Page body wrapped in `overflow-x-hidden`; horizontal scroll lives only on the table wrapper.

## D. Migration

Add the seven monitor tables to the realtime publication:

```sql
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.transaction_events;
alter publication supabase_realtime add table public.money_status_history;
alter publication supabase_realtime add table public.disputes;
alter publication supabase_realtime add table public.payments;
alter publication supabase_realtime add table public.payouts;
alter publication supabase_realtime add table public.release_review_queue;
```

Each `add table` is idempotent-guarded with a `do $$ ... exception when duplicate_object then null; end $$;` block so re-runs are safe.

## E. Out of scope
- CSV export pipeline (button still toasts).
- A real `hasUnreadMessages` source (stays `null`).

## Acceptance
- Search: typing once fires a single request after 400 ms; spinner shows; KPIs stay put.
- Filters/quick tabs/sort/refresh all work and reset page where appropriate.
- Realtime: editing a row in the DB triggers a refetch + one toast; pill is green.
- Disconnect WS → pill turns gray, manual refresh still works.
- Mobile: Filters opens a bottom sheet; Apply triggers fetch; no horizontal page scroll.
