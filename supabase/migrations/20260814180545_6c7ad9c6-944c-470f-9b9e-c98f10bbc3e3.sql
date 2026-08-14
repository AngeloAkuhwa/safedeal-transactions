DROP FUNCTION IF EXISTS public.admin_escrow_kpis();

CREATE OR REPLACE FUNCTION public.admin_escrow_kpis()
 RETURNS TABLE(total_held numeric, total_held_count bigint, total_frozen numeric, total_frozen_count bigint, total_refunded numeric, total_refunded_count bigint, pending_release numeric, pending_release_count bigint, released_today numeric, released_today_count bigint, released_week numeric, released_week_count bigint, distinct_currency_count bigint, book_currency text)
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
  WITH bal AS (
    SELECT
      t.id,
      t.money_status,
      COALESCE(SUM(
        CASE e.entry_type
          WHEN 'escrow_hold'  THEN e.amount
          WHEN 'payout_debit' THEN -e.amount
          WHEN 'refund_debit' THEN -e.amount
          WHEN 'adjustment'   THEN e.amount
          ELSE 0
        END
      ), 0)::numeric AS balance
    FROM public.transactions t
    LEFT JOIN public.escrow_ledger_entries e ON e.transaction_id = t.id
    GROUP BY t.id, t.money_status
  ),
  refunded AS (
    SELECT COALESCE(SUM(e.amount), 0)::numeric AS amt,
           COUNT(DISTINCT e.transaction_id)::bigint AS cnt
    FROM public.escrow_ledger_entries e
    WHERE e.entry_type = 'refund_debit'
  ),
  rel_today AS (
    SELECT COALESCE(SUM(e.amount), 0)::numeric AS amt, COUNT(*)::bigint AS cnt
    FROM public.escrow_ledger_entries e
    WHERE e.entry_type = 'payout_debit'
      AND e.created_at >= date_trunc('day', now())
  ),
  rel_week AS (
    SELECT COALESCE(SUM(e.amount), 0)::numeric AS amt, COUNT(*)::bigint AS cnt
    FROM public.escrow_ledger_entries e
    WHERE e.entry_type = 'payout_debit'
      AND e.created_at >= now() - interval '7 days'
  ),
  cur AS (
    -- Whole-book check, not a sampled page: the tiles may only assert a
    -- currency when every priced transaction agrees on one.
    SELECT COUNT(DISTINCT upper(btrim(p.currency_code)))::bigint AS cnt,
           MIN(upper(btrim(p.currency_code))) AS code
    FROM public.transaction_pricing p
    WHERE p.currency_code IS NOT NULL AND btrim(p.currency_code) <> ''
  )
  SELECT
    COALESCE(SUM(b.balance) FILTER (
      WHERE b.money_status = 'funds_held_in_escrow' AND b.balance > 0), 0)::numeric,
    COUNT(*) FILTER (
      WHERE b.money_status = 'funds_held_in_escrow' AND b.balance > 0)::bigint,
    COALESCE(SUM(b.balance) FILTER (
      WHERE b.money_status = 'funds_frozen' AND b.balance > 0), 0)::numeric,
    COUNT(*) FILTER (
      WHERE b.money_status = 'funds_frozen' AND b.balance > 0)::bigint,
    (SELECT amt FROM refunded),
    (SELECT cnt FROM refunded),
    COALESCE(SUM(b.balance) FILTER (
      WHERE b.money_status IN ('funds_pending_release','funds_releasing') AND b.balance > 0), 0)::numeric,
    COUNT(*) FILTER (
      WHERE b.money_status IN ('funds_pending_release','funds_releasing') AND b.balance > 0)::bigint,
    (SELECT amt FROM rel_today),
    (SELECT cnt FROM rel_today),
    (SELECT amt FROM rel_week),
    (SELECT cnt FROM rel_week),
    (SELECT cnt FROM cur),
    (SELECT CASE WHEN cnt = 1 THEN code ELSE NULL END FROM cur)
  FROM bal b;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_escrow_kpis() TO authenticated, service_role;