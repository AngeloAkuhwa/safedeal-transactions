
CREATE OR REPLACE FUNCTION public.admin_flagged_users_page(
  p_search text DEFAULT NULL,
  p_risk   text DEFAULT 'all',
  p_reason text DEFAULT 'all',
  p_status text DEFAULT 'active',
  p_sort   text DEFAULT 'risk',
  p_limit  int  DEFAULT 15,
  p_offset int  DEFAULT 0
)
RETURNS TABLE (
  user_id uuid, full_name text, email text, phone text, avatar_url text, role text,
  is_suspended boolean, score int, risk_level text, status text, reason_keys text[],
  admin_flag_count int, escrow_at_risk numeric, latest_tx_id uuid, latest_tx_code text,
  disputes_30d int, latest_dispute_id uuid, refunds_30d int, identity_rejected boolean,
  identity_reason text, has_open_investigation boolean, blocked_payouts int,
  reversed_payouts int, flagged_by_admin_id uuid, auto_detected boolean,
  last_signal_at timestamptz, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(LOWER(TRIM(COALESCE(p_search,''))), '');
  v_lim    int  := GREATEST(1, LEAST(COALESCE(p_limit, 15), 100));
  v_off    int  := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT m.* FROM public.admin_flagged_users_mv m
    WHERE (p_status = 'all' OR m.status = p_status)
      AND (p_risk   = 'all' OR m.risk_level = p_risk)
      AND (p_reason = 'all' OR p_reason = ANY(m.reason_keys))
      AND (v_search IS NULL OR m.search_haystack ILIKE '%' || v_search || '%')
  ),
  counted AS (SELECT COUNT(*)::bigint AS c FROM filtered)
  SELECT
    f.user_id, f.full_name, f.email, f.phone, f.avatar_url, f.role, f.is_suspended,
    f.score, f.risk_level, f.status, f.reason_keys, f.admin_flag_count,
    f.escrow_at_risk, f.latest_tx_id, f.latest_tx_code, f.disputes_30d,
    f.latest_dispute_id, f.refunds_30d, f.identity_rejected, f.identity_reason,
    f.has_open_investigation, f.blocked_payouts, f.reversed_payouts,
    f.flagged_by_admin_id, f.auto_detected, f.last_signal_at,
    (SELECT c FROM counted) AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN p_sort = 'recent' THEN f.last_signal_at END DESC NULLS LAST,
    CASE p_sort WHEN 'risk' THEN
      CASE f.risk_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                        WHEN 'medium' THEN 2 ELSE 3 END
      ELSE NULL END ASC,
    f.score DESC, f.last_signal_at DESC NULLS LAST
  LIMIT v_lim OFFSET v_off;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_flagged_users_summary()
RETURNS TABLE (
  total_flagged bigint, critical_risk bigint, high_risk bigint, suspended bigint,
  cleared_this_week bigint, auto_detected bigint,
  today_flagged bigint, today_suspended bigint, today_cleared bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (SELECT * FROM public.admin_flagged_users_mv),
  cleared_wk AS (
    SELECT COUNT(DISTINCT target_user_id)::bigint AS n
    FROM public.admin_actions
    WHERE action_type IN ('unflag_user','clear_flag','close_case')
      AND created_at >= now() - interval '7 days'
      AND target_user_id IS NOT NULL
  ),
  today AS (
    SELECT
      COUNT(DISTINCT target_user_id) FILTER (
        WHERE action_type IN ('flag_user','flag_for_review','freeze_transaction',
                              'escalate_case','open_investigation')
      )::bigint AS flagged,
      COUNT(DISTINCT target_user_id) FILTER (WHERE action_type = 'suspend_user')::bigint AS suspended,
      COUNT(DISTINCT target_user_id) FILTER (
        WHERE action_type IN ('unflag_user','clear_flag','close_case')
      )::bigint AS cleared
    FROM public.admin_actions
    WHERE target_user_id IS NOT NULL AND created_at >= date_trunc('day', now())
  )
  SELECT
    (SELECT COUNT(*) FROM base WHERE status <> 'resolved')::bigint,
    (SELECT COUNT(*) FROM base WHERE risk_level = 'critical' AND status <> 'resolved')::bigint,
    (SELECT COUNT(*) FROM base WHERE risk_level IN ('critical','high') AND status <> 'resolved')::bigint,
    (SELECT COUNT(*) FROM base WHERE status = 'suspended')::bigint,
    (SELECT n FROM cleared_wk),
    (SELECT COUNT(*) FROM base WHERE flagged_by_admin_id IS NULL AND status <> 'resolved')::bigint,
    (SELECT flagged FROM today), (SELECT suspended FROM today), (SELECT cleared FROM today);
END;
$$;
