CREATE OR REPLACE FUNCTION public.admin_escrow_kpis()
 RETURNS TABLE(total_held numeric, total_held_count bigint, total_frozen numeric, total_frozen_count bigint, total_refunded numeric, total_refunded_count bigint, pending_release numeric, pending_release_count bigint, released_today numeric, released_today_count bigint, released_week numeric, released_week_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL AND NOT public.has_role(v_uid, 'admin'::user_role_type) THEN
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
$function$;