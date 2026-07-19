
-- Push admin-escrow-overview record pagination fully into SQL. The edge
-- function previously fetched every escrow_states row into memory, filtered
-- in JS, then `.slice(...)` for pagination — an OOM/silent-truncation risk
-- once escrow_states grows past ~100k rows.
--
-- This RPC returns the exact page + a full-table `total_count` so the UI
-- can page correctly. All filters (state bucket, date range, amount bucket)
-- are applied in SQL. `total_count` uses a window function so it costs one
-- pass, not a separate query.
create or replace function public.admin_escrow_records_page(
  _state text default 'all',                -- all|held|frozen|pending_release|released|refunded
  _date_range text default '30d',           -- all|today|7d|30d
  _amount_bucket text default 'any',        -- any|lt_100k|100k_1m|gt_1m
  _page integer default 1,
  _page_size integer default 20
)
returns table (
  transaction_id uuid,
  held_amount numeric,
  frozen_amount numeric,
  released_amount numeric,
  refunded_amount numeric,
  last_changed_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with cutoff as (
    select case _date_range
      when 'today' then date_trunc('day', now())
      when '7d'    then now() - interval '7 days'
      when '30d'   then now() - interval '30 days'
      else 'epoch'::timestamptz
    end as ts
  ),
  base as (
    select
      s.transaction_id,
      s.held_amount,
      s.frozen_amount,
      s.released_amount,
      s.refunded_amount,
      s.last_changed_at,
      coalesce(s.held_amount,0) + coalesce(s.frozen_amount,0) as held_plus_frozen
    from public.escrow_states s, cutoff c
    where
      -- must have movement of some kind
      (coalesce(s.held_amount,0) + coalesce(s.frozen_amount,0)
       + coalesce(s.released_amount,0) + coalesce(s.refunded_amount,0)) > 0
      -- date filter
      and s.last_changed_at >= c.ts
      -- state bucket
      and case _state
        when 'held'     then coalesce(s.held_amount,0)     > 0
        when 'frozen'   then coalesce(s.frozen_amount,0)   > 0
        when 'released' then coalesce(s.released_amount,0) > 0
        when 'refunded' then coalesce(s.refunded_amount,0) > 0
        when 'pending_release' then exists (
          select 1 from public.transactions t
          where t.id = s.transaction_id and t.money_status = 'funds_releasing'
        )
        else true
      end
      -- amount bucket on (held+frozen)
      and case _amount_bucket
        when 'lt_100k' then (coalesce(s.held_amount,0) + coalesce(s.frozen_amount,0)) < 100000
        when '100k_1m' then (coalesce(s.held_amount,0) + coalesce(s.frozen_amount,0)) >= 100000
                        and (coalesce(s.held_amount,0) + coalesce(s.frozen_amount,0)) < 1000000
        when 'gt_1m'   then (coalesce(s.held_amount,0) + coalesce(s.frozen_amount,0)) >= 1000000
        else true
      end
  )
  select
    b.transaction_id,
    b.held_amount,
    b.frozen_amount,
    b.released_amount,
    b.refunded_amount,
    b.last_changed_at,
    count(*) over () as total_count
  from base b
  order by b.last_changed_at desc
  limit greatest(1, _page_size)
  offset greatest(0, (_page - 1) * _page_size);
$$;

revoke all on function public.admin_escrow_records_page(text, text, text, integer, integer) from public;
grant execute on function public.admin_escrow_records_page(text, text, text, integer, integer) to service_role;

-- Supporting index for the ORDER BY / date filter. Regular CREATE INDEX (not
-- CONCURRENTLY) so it can run inside the migration transaction.
create index if not exists idx_escrow_states_last_changed_at
  on public.escrow_states (last_changed_at desc);
