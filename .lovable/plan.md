
# Phase D — Seller Analytics + Per-Row Message Indicator
# Phase E — Stuck-Queue Cron Jobs (NEVER auto-release / refund)

Read-only analytics + maintenance jobs that **only flag for SafeDeal review**. No money movement. No dispute resolution. No auto-refund.

> **Wording rule (non-negotiable)** — In all UI strings, notifications, and tooltips, use:
> _Awaiting Release · Release Review · SafeDeal Review · Payment Processing · Paid Out · Awaiting Review_
> Never: _Awaiting Admin Release · Admin will release funds · Admin decision · Admin review_.

---

## Schema reality check (corrections vs. draft)

The DB doesn't match a few names in the draft. Plan uses what actually exists:

| Draft term | Actual DB |
|---|---|
| `delivery_status='delivered'` | `transactions.status='delivered_awaiting_verification'` + `transactions.delivered_at` |
| `stock_reservation_history` | `product_inventory_logs` (with `change_type='release'`, `reference_type='transaction_timeout'`, `reference_id=transaction_id`) |
| `system_job_logs` | `system_logs` (level + service_name + message + metadata jsonb) |
| `dispute_review_queue` | `release_review_queue` with `queue_type='silent_dispute'` (already permitted by check constraint) |
| dispute escalation status `awaiting_review` / `awaiting_safe_deal_decision` | `dispute_case_status.under_review` (only valid escalated value) |
| `transaction_events` | exists; use `auto_cancelled` for timeout, `dispute_opened` is taken — escalation logged as a `system_logs` entry + `dispute_status_history` row |
| `needs_admin_review` column | does not exist — use `transactions.needs_release_review` + `release_review_reason` |

`release_review_queue.queue_type` permitted values include `stuck_confirmation`, `silent_dispute`, `failed_payout`, `payout_account_missing`, `pricing_missing`, `manual_hold`, `refund_request`, `ready_for_release`. Plan stays within these.

`flag_for_release_review(p_transaction_id, p_reason, p_actor_user_id, p_notes)` already exists and is idempotent on `(transaction_id, queue_type)`. All flagging goes through it.

---

# PHASE D

## D1. Edge function `seller-analytics`

`supabase/functions/seller-analytics/index.ts` + `[functions.seller-analytics] verify_jwt = false` block in `supabase/config.toml`.

**Auth**: bearer JWT decode → `has_role(uid,'seller')` gate (same pattern as `seller-dashboard`). All queries scoped to `seller_id = uid` via service-role client. Cross-seller access impossible.

**Input** (POST body or query):

```json
{ "period": "30d" | "90d" | "all", "bucket": "daily" | "weekly" | "monthly", "product_id": "uuid?", "currency": "NGN" }
```

Defaults: `period=90d`, `bucket=weekly`, `currency=NGN`. `all` ignores window filters but caps at 365d for chart bucketing.

**Money rules in every response field**:
- numbers, not strings; never rounded; client formats with `Intl.NumberFormat('en-NG', {minimumFractionDigits:2, maximumFractionDigits:2})`.
- `gross_sales`, `fees_deducted`, `seller_net_*` always returned as separate fields. Never mixed.

### D1.1 Summary metrics

```json
"summary": {
  "currency": "NGN",
  "seller_net_released": 0,        // SUM(transaction_pricing.seller_net_amount) WHERE money_status='funds_released'
  "funds_awaiting_release": 0,     // SUM(seller_net_amount) WHERE money_status='funds_pending_release'
  "funds_held_in_escrow": 0,       // SUM(seller_net_amount) WHERE money_status='funds_held_in_escrow'
  "gross_sales": 0,                // SUM(transaction_pricing.buyer_total_amount) WHERE money_status IN funded-or-later set
  "fees_deducted": 0,              // SUM(platform_fee_amount + processing_fee_amount), same set
  "disputed_amount": 0,            // SUM(seller_net_amount) WHERE money_status='funds_frozen' OR EXISTS open dispute
  "completed_transactions_count": 0,
  "active_transactions_count": 0,  // status in payment_secured..delivered_awaiting_verification
  "open_disputes_count": 0,
  "failed_payouts_count": 0
}
```

"Funded-or-later" set for gross/fees: `money_status IN ('funds_held_in_escrow','funds_frozen','funds_pending_release','funds_releasing','funds_released','refund_pending','refund_issued')`.

### D1.2 Revenue trend

Filter: `seller_id = uid`, `money_status='funds_released'`, `release_completed_at >= now() - period`.

Bucket in TS by `date_trunc(bucket, release_completed_at)`. Each bucket:

```json
{ "label": "Apr 6 – Apr 12", "start_date": "...", "end_date": "...",
  "seller_net_released": 0, "gross_sales": 0, "fees_deducted": 0, "completed_transactions": 0 }
```

### D1.3 Top products (max 3)

Filter: `seller_id=uid`, `money_status IN ('funds_released','funds_pending_release','funds_releasing')` AND `source_product_id IS NOT NULL`. Group by `source_product_id`, order by `count(*) DESC`, limit 3, join `products` for `title`/`primary_media_url`/`stock_quantity`/`reserved_quantity` and best-effort `rating` (null if absent).

```json
"top_products": [{ "product_id": "...", "name": "...", "image_url": "...", "completed_transactions": 0,
                   "gross_sales": 0, "seller_net_released": 0, "current_stock": 0, "rating": null }]
```

### D1.4 Completion rate

```
paid_set = status IN ('payment_secured','seller_preparing_delivery','seller_dispatched',
                      'delivered_awaiting_verification','completed','disputed','resolved','refunded')
completed_count = status = 'completed'
completion_rate = completed_count / paid_set_count
```

Excludes `draft`, `awaiting_buyer`, `awaiting_payment`, `cancelled`, `timed_out`. Returns `{ value, completed_count, paid_transaction_count }`. Returns `null` value when `paid_transaction_count = 0`.

### D1.5 Dispute rate

```
dispute_rate = total_disputes_in_window / paid_set_count
```

Returns `{ value, open_disputes, resolved_disputes, total_disputes,
            outcome_split: { resolved_for_buyer, resolved_for_seller, partial_refund, dismissed } }`.
Outcome split sourced from `dispute_outcomes.outcome_type` joined to disputes in window. Missing outcome types return 0.

### D1.6 Average release time

Only rows where `buyer_confirmed_at IS NOT NULL AND release_completed_at IS NOT NULL AND money_status='funds_released'`. `avg(release_completed_at - buyer_confirmed_at)` in hours.

```json
"average_release_time": { "hours": 18.5, "sample_size": 32, "label": "18.5 hours" }
```

If `sample_size < 3`: `{ "hours": null, "sample_size": n, "label": "Not enough data yet" }`.

### D1.7 Trust metrics

```json
"trust_metrics": {
  "seller_rating": null,            // null until reviews table exists
  "completed_deals": 0,             // lifetime count of status='completed'
  "on_time_dispatch_rate": null,    // best-effort: status reached seller_dispatched before transaction_delivery_terms.expected_delivery_date
  "dispute_free_rate": 0,           // 1 - (total_disputes_lifetime / completed_deals_lifetime), 0..1
  "response_time_hours": null,      // avg time from dispute opened_at to first dispute_response by seller
  "identity_verified": bool,        // account_verifications.identity_verified
  "payout_verified": bool           // account_verifications.payout_verified
}
```

Fields with no data return `null` (UI shows em-dash). No fabricated values.

## D2. Page `/seller/analytics`

Files:
- `src/services/seller-analytics.service.ts` — typed wrapper around `supabase.functions.invoke('seller-analytics', { body })`.
- `src/pages/SellerAnalytics.tsx` — page using `SellerNav`, `Footer`, react-query (`['seller-analytics', period, bucket, productId]`).
- `src/App.tsx` — `/seller/analytics` route under `requireRole="seller"`.
- `src/components/seller/SellerNav.tsx` — add **Analytics** link between Storefront and Notifications.
- `src/pages/SellerDashboard.tsx` — add quick-action card linking to Analytics.

**Layout (top-down)**:
1. **Header** — Title "Seller Analytics", subtitle "Track your sales, releases, products, and trust performance.", right-side period dropdown (30d/90d/All time) + "Export CSV" button (CSV is rendered client-side from current response).
2. **Summary cards (6)** — Seller Net Released · Awaiting Release · Funds Held in Escrow · Gross Sales · Dispute Rate · Average Release Time. Each card: title · value (2dp ₦) · helper line · info tooltip. Trend indicator only when prior-period value available (computed client-side from a second `period` query, deferred — initial release shows no arrow).
3. **Revenue Trend** — Recharts `AreaChart`, three series (Seller Net Released, Gross Sales, Fees Deducted), soft sky/emerald palette, legend, minimal grid.
4. **Transaction Health** — 4 progress cards: Completion Rate · Dispute-Free Rate · On-Time Dispatch · Response Time.
5. **Top Products** — three compact cards: image, title, completed count, gross sales, net released, stock badge.
6. **Release Performance** — Awaiting Release count · Payment Processing count · Paid Out count · Failed Release count · Payout account status. Footer note: _"SafeDeal reviews releases after both parties confirm."_ Never says "admin".
7. **Trust Performance** — single card: rating, completed deals, identity verified ✓, payout verified ✓, dispute-free rate.

**States**:
- Loading: skeleton cards + skeleton chart + skeleton product list (matches `SellerDashboard` pattern).
- Error: red card "We couldn't load your analytics." + Retry button. No raw error text.
- Empty (no paid transactions in window): SafeDeal empty state — title _"Analytics will appear after your first protected transaction"_, message, CTAs **Create product** and **Create protected deal**.

## D3. Per-row unread message indicator on `SellerTransactions`

**Backend** (`supabase/functions/seller-transactions/index.ts`):
After the page of transactions is fetched, run **one** aggregate query against `transaction_messages` (uses `idx_transaction_messages_unread`):

```sql
SELECT transaction_id,
       count(*) AS unread,
       max(created_at) AS last_at,
       (array_agg(message_text ORDER BY created_at DESC))[1] AS last_preview
FROM transaction_messages
WHERE recipient_user_id = $uid AND is_read = false AND transaction_id = ANY($pageIds)
GROUP BY transaction_id;
```

Attach to each row: `unread_message_count: number`, `last_message_at: string|null`, `last_message_preview: string|null` (truncate preview to 80 chars server-side).

**Service** (`src/services/seller-transactions.service.ts`): add the three optional fields to `SellerTransaction`.

**UI** (`src/pages/SellerTransactions.tsx`): in the buyer column, render a `MessageCircle` icon button with a small destructive `Badge`. Badge content: `n` for 1–9, `9+` otherwise. Hidden when `unread=0`. Tooltip shows `last_message_preview` + relative `last_message_at`. Click navigates `/seller/transactions/{id}?tab=messages` (transaction detail already handles the `tab` query param).

---

# PHASE E — Cron Jobs

All three new edge functions:
- `verify_jwt = false` blocks added to `supabase/config.toml`.
- Validate `req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET')` first; 401 otherwise. No JWT path.
- Use service-role client.
- Wrap each item in try/catch; failures logged to `system_logs` with `level='error'`, `service_name='cron.<job>'`. Job continues to next item.
- Always insert one `system_logs` row per run with `metadata = { records_found, records_updated, errors }`.
- Process in capped batches (`LIMIT 200` per call) and return early — cron will run again.

Secrets to add via `add_secret`:
- `CRON_SECRET` — random 32-byte string (validated by all three functions).
- `SYSTEM_ACTOR_ID` — uuid of an existing admin profile, used as `p_actor_user_id` for `flag_for_release_review` and `admin_actions` rows.

## E0. Pre-req migration (schema only — safe to remix)

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Atomic timeout helper: status flip + stock release + inventory log + event, in one tx
CREATE OR REPLACE FUNCTION public.timeout_transaction_atomic(p_tx_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_status transaction_status;
  v_money money_status;
  v_seller uuid;
  v_buyer uuid;
  v_code text;
  v_product uuid;
  v_qty int;
BEGIN
  SELECT status, money_status, seller_id, buyer_id, transaction_code, source_product_id
    INTO v_status, v_money, v_seller, v_buyer, v_code, v_product
  FROM public.transactions WHERE id = p_tx_id FOR UPDATE;

  IF v_status IS NULL THEN RAISE EXCEPTION 'tx_not_found'; END IF;
  IF v_status <> 'awaiting_payment'::transaction_status THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_awaiting_payment');
  END IF;

  -- Idempotent payment-record check
  IF EXISTS (SELECT 1 FROM public.payments
             WHERE transaction_id = p_tx_id AND status = 'succeeded'::payment_status) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'has_succeeded_payment');
  END IF;

  -- Money rollback only if currently payment_pending (state machine validates)
  IF v_money = 'payment_pending'::money_status THEN
    UPDATE public.transactions
       SET money_status = 'not_secured'::money_status,
           status       = 'timed_out'::transaction_status,
           cancellation_reason = 'auto_timeout_24h',
           updated_at = now()
     WHERE id = p_tx_id;
    INSERT INTO public.money_status_history (transaction_id, old_status, new_status, reason)
    VALUES (p_tx_id, v_money, 'not_secured', 'auto_timeout_24h');
  ELSE
    UPDATE public.transactions
       SET status = 'timed_out'::transaction_status,
           cancellation_reason = 'auto_timeout_24h',
           updated_at = now()
     WHERE id = p_tx_id;
  END IF;

  -- Release reserved stock (sum of items in this tx)
  IF v_product IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity),0) INTO v_qty
      FROM public.transaction_items WHERE transaction_id = p_tx_id;
    IF v_qty > 0 THEN
      UPDATE public.products
         SET reserved_quantity = GREATEST(0, reserved_quantity - v_qty),
             updated_at = now()
       WHERE id = v_product;

      INSERT INTO public.product_inventory_logs
        (product_id, change_type, quantity_delta, balance_after, reference_type, reference_id, notes)
      SELECT v_product, 'release'::product_inventory_change_type, v_qty,
             (SELECT reserved_quantity FROM public.products WHERE id = v_product),
             'transaction_timeout', p_tx_id, 'auto_timeout_24h';
    END IF;
  END IF;

  INSERT INTO public.transaction_events (transaction_id, event_type, event_data)
  VALUES (p_tx_id, 'auto_cancelled'::transaction_event_type,
          jsonb_build_object('reason','auto_timeout_24h','released_qty',COALESCE(v_qty,0)));

  -- Notifications (seller + buyer)
  INSERT INTO public.notifications (user_id, type, channel, title, message, related_transaction_id)
  VALUES
    (v_seller, 'transaction_update','in_app','Payment expired',
     concat('Buyer did not pay for ', v_code, ' within 24 hours. Reserved stock has been released.'),
     p_tx_id);
  IF v_buyer IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, channel, title, message, related_transaction_id)
    VALUES (v_buyer,'transaction_update','in_app','Payment window expired',
            'Your payment window expired. You can start a new protected transaction if the item is still available.',
            p_tx_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'released_qty', COALESCE(v_qty,0));
END $$;

GRANT EXECUTE ON FUNCTION public.timeout_transaction_atomic(uuid) TO service_role;
```

`product_inventory_logs` already has the `release` change-type and a `reference_type/reference_id` pair, so audit trail is complete and idempotent (re-running on a tx already at `timed_out` is a no-op via the early RETURN).

## E1. `auto-timeout-payments` (every 15 min)

`supabase/functions/auto-timeout-payments/index.ts`

```
SELECT id FROM transactions
WHERE status='awaiting_payment'
  AND created_at < now() - interval '24 hours'
LIMIT 200;
```

For each id call `timeout_transaction_atomic(id)`. Aggregate counts; insert `system_logs` summary.

## E2. `flag-stuck-confirmations` (daily, 03:00)

`supabase/functions/flag-stuck-confirmations/index.ts`

Selects transactions where `needs_release_review=false AND money_status IN ('funds_held_in_escrow','funds_pending_release')` and one of:

| Case | Condition | reason passed to RPC |
|---|---|---|
| 1: buyer didn't confirm | `status='delivered_awaiting_verification' AND delivered_at < now() - interval '72 hours' AND buyer_confirmed_at IS NULL` | `'stuck_confirmation'` |
| 2: seller didn't confirm | `buyer_confirmed_at IS NOT NULL AND seller_confirmed_at IS NULL AND buyer_confirmed_at < now() - interval '72 hours'` | `'stuck_confirmation'` |
| 3: stuck pending release | `buyer_confirmed_at IS NOT NULL AND seller_confirmed_at IS NOT NULL AND money_status='funds_pending_release' AND seller_confirmed_at < now() - interval '48 hours'` | `'stuck_confirmation'` |

(72h / 48h are constants in the function — easy to lift into a `system_settings` row later.)

For each row: `select flag_for_release_review(tx_id, 'stuck_confirmation', :SYSTEM_ACTOR_ID, '<case label>')`. The RPC handles idempotency (`rrq_unique_open_per_type`), stamps `needs_release_review=true`, and records an `admin_actions` row.

Notifications: insert one `system_message` `notifications` row for every admin (`SELECT user_id FROM user_roles WHERE role='admin'`) — title "Stuck transaction flagged", body includes transaction_code. Insert one `transaction_update` notification for seller (and buyer if relevant) saying _"This transaction is awaiting review."_

**No money movement.** Returns `{ flagged, seen, errors }`.

## E3. `auto-escalate-silent-disputes` (hourly)

`supabase/functions/auto-escalate-silent-disputes/index.ts`

```
SELECT d.id, d.transaction_id, t.seller_id, t.buyer_id
FROM disputes d
JOIN transactions t ON t.id = d.transaction_id
WHERE d.status = 'seller_response_pending'
  AND d.seller_response_due_at < now()
  AND NOT EXISTS (SELECT 1 FROM dispute_responses r WHERE r.dispute_id = d.id)
LIMIT 200;
```

For each dispute, in this order:
1. `UPDATE disputes SET status='under_review', updated_at=now() WHERE id=$1 AND status='seller_response_pending'` (guards against race).
2. `INSERT INTO dispute_status_history (dispute_id, old_status, new_status, changed_by_user_id, reason) VALUES ($1, 'seller_response_pending', 'under_review', :SYSTEM_ACTOR_ID, 'auto_escalate_silent')`.
3. `select flag_for_release_review(transaction_id, 'silent_dispute', :SYSTEM_ACTOR_ID, 'auto-escalated: seller did not respond')`.
4. Notify all admins (`dispute_update`, `related_dispute_id` set), notify seller _"Your dispute response deadline has passed."_, notify buyer _"This dispute has moved to review."_.

**No `money_status` change. No refund. No payout.** Returns `{ escalated, errors }`.

## E4. Cron schedules — installed via the **insert tool** (NOT a migration)

After the three functions deploy and `CRON_SECRET` is set:

```sql
SELECT cron.schedule(
  'auto-timeout-payments','*/15 * * * *',
  $$ SELECT net.http_post(
    url := 'https://cfkdasmhlqswpunugbkf.supabase.co/functions/v1/auto-timeout-payments',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'apikey','<ANON_KEY>',
                                  'x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb) $$);

SELECT cron.schedule('flag-stuck-confirmations','0 3 * * *', $$ ...same shape... $$);
SELECT cron.schedule('auto-escalate-silent-disputes','0 * * * *', $$ ...same shape... $$);
```

Anon key + cron secret stay project-local (insert tool does not persist to migration files), so remixes don't inherit them.

---

# Files touched

```
NEW   supabase/functions/seller-analytics/index.ts
NEW   supabase/functions/auto-timeout-payments/index.ts
NEW   supabase/functions/flag-stuck-confirmations/index.ts
NEW   supabase/functions/auto-escalate-silent-disputes/index.ts
NEW   migration: pg_cron + pg_net + timeout_transaction_atomic()
NEW   src/services/seller-analytics.service.ts
NEW   src/pages/SellerAnalytics.tsx
EDIT  supabase/config.toml                                   (+4 verify_jwt=false blocks)
EDIT  supabase/functions/seller-transactions/index.ts        (per-row unread aggregate)
EDIT  src/services/seller-transactions.service.ts            (3 new optional fields)
EDIT  src/pages/SellerTransactions.tsx                       (unread badge in buyer column)
EDIT  src/App.tsx                                            (/seller/analytics route)
EDIT  src/components/seller/SellerNav.tsx                    ("Analytics" link)
EDIT  src/pages/SellerDashboard.tsx                          (quick action → Analytics)
INSERT (insert tool, not migration)                          3× cron.schedule + add_secret CRON_SECRET, SYSTEM_ACTOR_ID
```

# Build order

D1 → D2 → D3 → E0 (migration) → E1 → E2 → E3 → add secrets → E4 (insert cron schedules) → smoke-test each cron via `curl` with the secret header.

# Hard guarantees

- **No phase-D or phase-E code path calls** `release_payout_atomic`, `complete_payout_atomic`, `start_refund_atomic`, `complete_refund_atomic`, or any `validate_money_transition` toward `funds_released` / `refund_*`.
- E1 only ever moves money `payment_pending → not_secured` (rollback before funding).
- E2/E3 only flag (`flag_for_release_review`) and notify.
- All flagging is idempotent on `(transaction_id, queue_type)`.
- All inventory adjustments use `GREATEST(0, …)`; `product_inventory_logs` row written for every change.
- Every cron run writes a single `system_logs` summary row.
- All notifications and UI strings comply with the wording rule (no "admin" leakage).
