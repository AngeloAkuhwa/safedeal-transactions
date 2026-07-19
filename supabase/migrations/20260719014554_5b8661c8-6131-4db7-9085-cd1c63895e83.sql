
CREATE OR REPLACE FUNCTION public.admin_escrow_kpis()
RETURNS TABLE(
  total_held numeric,
  total_held_count bigint,
  total_frozen numeric,
  total_frozen_count bigint,
  total_refunded numeric,
  total_refunded_count bigint,
  pending_release numeric,
  pending_release_count bigint,
  released_today numeric,
  released_today_count bigint,
  released_week numeric,
  released_week_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL AND NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH s AS (
    SELECT
      COALESCE(SUM(held_amount) FILTER (WHERE held_amount > 0), 0)         AS held_sum,
      COUNT(*) FILTER (WHERE held_amount > 0)                              AS held_cnt,
      COALESCE(SUM(frozen_amount) FILTER (WHERE frozen_amount > 0), 0)     AS frz_sum,
      COUNT(*) FILTER (WHERE frozen_amount > 0)                            AS frz_cnt,
      COALESCE(SUM(refunded_amount) FILTER (WHERE refunded_amount > 0), 0) AS ref_sum,
      COUNT(*) FILTER (WHERE refunded_amount > 0)                          AS ref_cnt
    FROM public.escrow_states
  ),
  pending AS (
    SELECT
      COALESCE(SUM(COALESCE(es.held_amount,0) + COALESCE(es.frozen_amount,0)), 0) AS pend_sum,
      COUNT(*)                                                                    AS pend_cnt
    FROM public.transactions t
    JOIN public.escrow_states es ON es.transaction_id = t.id
    WHERE t.money_status = 'funds_releasing'::money_status
  ),
  today_p AS (
    SELECT
      COALESCE(SUM(amount), 0) AS today_sum,
      COUNT(*)                 AS today_cnt
    FROM public.payouts
    WHERE status = 'completed'
      AND completed_at >= date_trunc('day', now())
  ),
  week_p AS (
    SELECT
      COALESCE(SUM(amount), 0) AS week_sum,
      COUNT(*)                 AS week_cnt
    FROM public.payouts
    WHERE status = 'completed'
      AND completed_at >= (now() - interval '7 days')
  )
  SELECT
    s.held_sum, s.held_cnt,
    s.frz_sum,  s.frz_cnt,
    s.ref_sum,  s.ref_cnt,
    pending.pend_sum, pending.pend_cnt,
    today_p.today_sum, today_p.today_cnt,
    week_p.week_sum,   week_p.week_cnt
  FROM s, pending, today_p, week_p;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_escrow_kpis() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_escrow_records_page(
  _state text DEFAULT 'all',
  _date_range text DEFAULT '30d',
  _amount_bucket text DEFAULT 'any',
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 20,
  _search text DEFAULT '',
  _flag text DEFAULT 'all'
)
RETURNS TABLE(
  transaction_id uuid,
  held_amount numeric,
  frozen_amount numeric,
  released_amount numeric,
  refunded_amount numeric,
  last_changed_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  WITH cutoff AS (
    SELECT CASE _date_range
      WHEN 'today' THEN date_trunc('day', now())
      WHEN '7d'    THEN now() - interval '7 days'
      WHEN '30d'   THEN now() - interval '30 days'
      ELSE 'epoch'::timestamptz
    END AS ts
  ),
  needle AS (
    SELECT NULLIF(lower(trim(coalesce(_search, ''))), '') AS q
  ),
  base AS (
    SELECT
      s.transaction_id,
      s.held_amount,
      s.frozen_amount,
      s.released_amount,
      s.refunded_amount,
      s.last_changed_at,
      t.transaction_code,
      t.money_status,
      t.buyer_id,
      t.seller_id,
      (coalesce(s.held_amount,0) + coalesce(s.frozen_amount,0)) AS held_plus_frozen
    FROM public.escrow_states s
    JOIN public.transactions t ON t.id = s.transaction_id
    CROSS JOIN cutoff c
    WHERE
      (coalesce(s.held_amount,0) + coalesce(s.frozen_amount,0)
       + coalesce(s.released_amount,0) + coalesce(s.refunded_amount,0)) > 0
      AND s.last_changed_at >= c.ts
      AND CASE _state
        WHEN 'held'     THEN coalesce(s.held_amount,0)     > 0
        WHEN 'frozen'   THEN coalesce(s.frozen_amount,0)   > 0
        WHEN 'released' THEN coalesce(s.released_amount,0) > 0
        WHEN 'refunded' THEN coalesce(s.refunded_amount,0) > 0
        WHEN 'pending_release' THEN t.money_status = 'funds_releasing'::money_status
        ELSE true
      END
      AND CASE _amount_bucket
        WHEN 'lt_100k' THEN (coalesce(s.held_amount,0) + coalesce(s.frozen_amount,0)) < 100000
        WHEN '100k_1m' THEN (coalesce(s.held_amount,0) + coalesce(s.frozen_amount,0)) >= 100000
                        AND (coalesce(s.held_amount,0) + coalesce(s.frozen_amount,0)) < 1000000
        WHEN 'gt_1m'   THEN (coalesce(s.held_amount,0) + coalesce(s.frozen_amount,0)) >= 1000000
        ELSE true
      END
  ),
  filtered AS (
    SELECT b.*
    FROM base b, needle n
    WHERE
      (n.q IS NULL
        OR lower(b.transaction_code) LIKE '%' || n.q || '%'
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id IN (b.buyer_id, b.seller_id)
            AND lower(coalesce(p.full_name, '')) LIKE '%' || n.q || '%'
        )
      )
      AND CASE _flag
        WHEN 'disputed' THEN EXISTS (
          SELECT 1 FROM public.disputes d
          WHERE d.transaction_id = b.transaction_id AND d.status <> 'resolved'
        )
        WHEN 'flagged' THEN EXISTS (
          SELECT 1 FROM public.disputes d
          WHERE d.transaction_id = b.transaction_id AND d.status <> 'resolved'
        )
        WHEN 'high_value' THEN b.held_plus_frozen >= 1000000
        WHEN 'state_mismatch' THEN
          (coalesce(b.frozen_amount,0) > 0 AND b.money_status = 'funds_released'::money_status)
          OR (coalesce(b.held_amount,0) > 0 AND b.money_status = 'funds_released'::money_status)
          OR (b.money_status = 'funds_releasing'::money_status AND coalesce(b.held_amount,0) = 0)
        ELSE true
      END
  )
  SELECT
    f.transaction_id,
    f.held_amount,
    f.frozen_amount,
    f.released_amount,
    f.refunded_amount,
    f.last_changed_at,
    count(*) OVER () AS total_count
  FROM filtered f
  ORDER BY f.last_changed_at DESC
  LIMIT greatest(1, _page_size)
  OFFSET greatest(0, (_page - 1) * _page_size);
$function$;

GRANT EXECUTE ON FUNCTION public.admin_escrow_records_page(text, text, text, integer, integer, text, text) TO authenticated, service_role;
