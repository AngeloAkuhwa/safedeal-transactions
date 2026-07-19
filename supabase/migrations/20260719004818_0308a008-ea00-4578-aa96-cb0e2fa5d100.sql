
-- Two SQL-side aggregates to eliminate the two remaining large in-memory scans
-- in admin-dashboard (`.limit(10000)` on user_sessions, `.limit(20000)` on
-- escrow_ledger_entries). Both were at risk of silent data loss above their
-- caps and OOM under load.

-- 1) Distinct active users in a window — replaces the `Set<string>` build
--    from up-to-10k session rows.
create or replace function public.admin_distinct_active_users(
  _since timestamptz,
  _until timestamptz default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(distinct user_id), 0)::int
  from public.user_sessions
  where last_seen_at >= _since
    and (_until is null or last_seen_at < _until);
$$;

revoke all on function public.admin_distinct_active_users(timestamptz, timestamptz) from public;
grant execute on function public.admin_distinct_active_users(timestamptz, timestamptz) to service_role;

-- 2) Escrow ledger daily trend (30-day) — bucketed & summed in SQL.
--    Returns one row per calendar day for the requested window.
create or replace function public.admin_escrow_ledger_daily_trend(_days integer)
returns table (
  bucket_date date,
  primary_amount numeric,
  secondary_amount numeric,
  tertiary_amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select generate_series(
      (current_date - (_days - 1))::date,
      current_date,
      interval '1 day'
    )::date as bucket_date
  ),
  agg as (
    select
      date_trunc('day', created_at)::date as bucket_date,
      sum(case when entry_type in ('escrow_hold','payment_credit') then abs(amount) else 0 end) as primary_amount,
      sum(case when entry_type = 'payout_debit' then abs(amount) else 0 end) as secondary_amount,
      sum(case when entry_type = 'refund_debit' then abs(amount) else 0 end) as tertiary_amount
    from public.escrow_ledger_entries
    where created_at >= (current_date - (_days - 1))
    group by 1
  )
  select
    d.bucket_date,
    coalesce(a.primary_amount, 0)::numeric,
    coalesce(a.secondary_amount, 0)::numeric,
    coalesce(a.tertiary_amount, 0)::numeric
  from days d
  left join agg a on a.bucket_date = d.bucket_date
  order by d.bucket_date;
$$;

revoke all on function public.admin_escrow_ledger_daily_trend(integer) from public;
grant execute on function public.admin_escrow_ledger_daily_trend(integer) to service_role;
