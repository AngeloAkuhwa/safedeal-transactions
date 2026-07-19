
-- P1 #5 — SQL aggregates for admin dashboard (replace JS-side row scans)

-- 1) Distinct flagged users in a rolling window
CREATE OR REPLACE FUNCTION public.admin_flagged_users_count(_since timestamptz)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT target_user_id)::bigint
  FROM public.admin_actions
  WHERE created_at >= _since
    AND target_user_id IS NOT NULL
    AND action_type IN ('flag_user','freeze_transaction','escalate_case');
$$;

REVOKE ALL ON FUNCTION public.admin_flagged_users_count(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_flagged_users_count(timestamptz) TO authenticated, service_role;

-- 2) Identity review health: avg turnaround hours + 9-day submission histogram
CREATE OR REPLACE FUNCTION public.admin_identity_review_health(
  _since_avg timestamptz,
  _since_spark timestamptz
)
RETURNS TABLE(avg_hours numeric, spark bigint[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_start date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  RETURN QUERY
  WITH avg_cte AS (
    SELECT round(avg(extract(epoch FROM (reviewed_at - submitted_at)) / 3600.0)::numeric, 1) AS avg_hours
    FROM public.identity_submissions
    WHERE reviewed_at IS NOT NULL
      AND reviewed_at >= _since_avg
      AND reviewed_at >= submitted_at
  ),
  spark_days AS (
    SELECT generate_series(0, 8) AS offset_days
  ),
  spark_cte AS (
    SELECT
      d.offset_days,
      (SELECT count(*)
         FROM public.identity_submissions s
        WHERE s.submitted_at >= _since_spark
          AND (s.submitted_at AT TIME ZONE 'UTC')::date = (today_start - (8 - d.offset_days))) AS c
    FROM spark_days d
  )
  SELECT
    (SELECT avg_hours FROM avg_cte),
    ARRAY(SELECT c FROM spark_cte ORDER BY offset_days);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_identity_review_health(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_identity_review_health(timestamptz, timestamptz) TO authenticated, service_role;

-- 3) Payout health: avg completion hours + 9-day completion histogram
CREATE OR REPLACE FUNCTION public.admin_payout_health(
  _since_avg timestamptz,
  _since_spark timestamptz
)
RETURNS TABLE(avg_hours numeric, spark bigint[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_start date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  RETURN QUERY
  WITH avg_cte AS (
    SELECT round(avg(
      extract(epoch FROM (completed_at - COALESCE(released_at, last_release_attempt_at, updated_at))) / 3600.0
    )::numeric, 1) AS avg_hours
    FROM public.payouts
    WHERE status = 'completed'
      AND completed_at IS NOT NULL
      AND completed_at >= _since_avg
      AND COALESCE(released_at, last_release_attempt_at, updated_at) IS NOT NULL
      AND completed_at >= COALESCE(released_at, last_release_attempt_at, updated_at)
  ),
  spark_days AS (
    SELECT generate_series(0, 8) AS offset_days
  ),
  spark_cte AS (
    SELECT
      d.offset_days,
      (SELECT count(*)
         FROM public.payouts p
        WHERE p.status = 'completed'
          AND p.completed_at >= _since_spark
          AND (p.completed_at AT TIME ZONE 'UTC')::date = (today_start - (8 - d.offset_days))) AS c
    FROM spark_days d
  )
  SELECT
    (SELECT avg_hours FROM avg_cte),
    ARRAY(SELECT c FROM spark_cte ORDER BY offset_days);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_payout_health(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_payout_health(timestamptz, timestamptz) TO authenticated, service_role;

-- 4) Reconciliation mismatches: successful payments in window without a matching ledger deposit
CREATE OR REPLACE FUNCTION public.admin_reconciliation_mismatches(_since timestamptz)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH succ_tx AS (
    SELECT DISTINCT p.transaction_id
    FROM public.payments p
    WHERE p.status = 'succeeded'
      AND p.created_at >= _since
      AND p.transaction_id IS NOT NULL
  ),
  have_deposit AS (
    SELECT DISTINCT e.transaction_id
    FROM public.escrow_ledger_entries e
    WHERE e.transaction_id IN (SELECT transaction_id FROM succ_tx)
      AND e.entry_type IN ('payment_credit','escrow_hold')
  )
  SELECT count(*)::bigint
  FROM succ_tx s
  LEFT JOIN have_deposit h ON h.transaction_id = s.transaction_id
  WHERE h.transaction_id IS NULL;
$$;

REVOKE ALL ON FUNCTION public.admin_reconciliation_mismatches(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reconciliation_mismatches(timestamptz) TO authenticated, service_role;
