
-- =========================================================
-- Flagged Users snapshot (SQL-first pagination)
-- =========================================================

-- Ensure pg_cron / pg_net for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------
-- Materialized view: one row per user with a live flag signal
-- ---------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.admin_flagged_users_mv CASCADE;

CREATE MATERIALIZED VIEW public.admin_flagged_users_mv AS
WITH
-- ============ ADMIN ACTIONS (rolling 30d) ============
aa AS (
  SELECT
    target_user_id AS user_id,
    action_type,
    admin_user_id,
    action_notes,
    transaction_id,
    created_at
  FROM public.admin_actions
  WHERE target_user_id IS NOT NULL
    AND created_at >= now() - interval '30 days'
),
aa_agg AS (
  SELECT
    user_id,
    COUNT(*) FILTER (WHERE action_type IN
      ('flag_user','flag_for_review','freeze_transaction','escalate_case',
       'suspend_user','open_investigation')) AS flag_action_count,
    COUNT(*) FILTER (WHERE action_type IN ('flag_user','flag_for_review')) AS flag_user_count,
    COUNT(*) FILTER (WHERE action_type = 'freeze_transaction') AS freeze_count,
    COUNT(*) FILTER (WHERE action_type = 'escalate_case') AS escalate_count,
    COUNT(*) FILTER (WHERE action_type = 'suspend_user') AS suspend_count,
    COUNT(*) FILTER (WHERE action_type = 'open_investigation') AS open_inv_action_count,
    MAX(CASE WHEN action_type IN
      ('flag_user','flag_for_review','freeze_transaction','escalate_case',
       'suspend_user','open_investigation') THEN created_at END) AS last_flag_action_at,
    MAX(CASE WHEN action_type IN ('unflag_user','clear_flag','close_case')
             THEN created_at END) AS last_clear_at,
    MAX(CASE WHEN action_type = 'unsuspend_user' THEN created_at END) AS last_unsuspend_at
  FROM aa
  GROUP BY user_id
),
-- Latest admin who flagged this user
aa_last_admin AS (
  SELECT DISTINCT ON (target_user_id)
    target_user_id AS user_id,
    admin_user_id  AS flagged_by_admin_id,
    created_at     AS flagged_by_at
  FROM public.admin_actions
  WHERE target_user_id IS NOT NULL
    AND action_type IN ('flag_user','flag_for_review','freeze_transaction',
                        'escalate_case','suspend_user','open_investigation')
    AND created_at >= now() - interval '30 days'
  ORDER BY target_user_id, created_at DESC
),
-- ============ FLAGGED TRANSACTIONS ============
flagged_tx AS (
  SELECT
    t.id AS tx_id,
    t.transaction_code,
    t.buyer_id,
    t.seller_id,
    t.money_status,
    t.needs_admin_review,
    t.needs_release_review,
    t.updated_at,
    COALESCE(e.held_amount, 0) + COALESCE(e.frozen_amount, 0) AS at_risk_amount
  FROM public.transactions t
  LEFT JOIN public.escrow_states e ON e.transaction_id = t.id
  WHERE t.needs_admin_review = true
     OR t.needs_release_review = true
     OR t.money_status = 'funds_frozen'
),
flagged_tx_by_user AS (
  SELECT buyer_id AS user_id, tx_id, transaction_code, money_status,
         needs_admin_review, needs_release_review, updated_at, at_risk_amount
  FROM flagged_tx WHERE buyer_id IS NOT NULL
  UNION ALL
  SELECT seller_id AS user_id, tx_id, transaction_code, money_status,
         needs_admin_review, needs_release_review, updated_at, at_risk_amount
  FROM flagged_tx WHERE seller_id IS NOT NULL
),
tx_agg AS (
  SELECT
    user_id,
    COUNT(*) FILTER (WHERE money_status = 'funds_frozen')       AS frozen_tx_count,
    COUNT(*) FILTER (WHERE needs_admin_review = true)           AS needs_admin_review_count,
    COUNT(*) FILTER (WHERE needs_release_review = true)         AS needs_release_review_count,
    SUM(at_risk_amount)                                         AS escrow_at_risk,
    MAX(updated_at)                                             AS last_tx_signal_at
  FROM flagged_tx_by_user
  GROUP BY user_id
),
tx_latest AS (
  SELECT DISTINCT ON (user_id)
    user_id, tx_id AS latest_tx_id, transaction_code AS latest_tx_code
  FROM flagged_tx_by_user
  ORDER BY user_id, updated_at DESC
),
-- ============ DISPUTES (30d, count against a party) ============
disp AS (
  SELECT d.id, d.opened_at, d.opened_by_user_id, t.buyer_id, t.seller_id
  FROM public.disputes d
  JOIN public.transactions t ON t.id = d.transaction_id
  WHERE d.opened_at >= now() - interval '30 days'
),
disp_against AS (
  -- disputes against the seller (opened by buyer)
  SELECT seller_id AS user_id, id AS dispute_id, opened_at FROM disp
  WHERE seller_id IS NOT NULL AND opened_by_user_id IS DISTINCT FROM seller_id
  UNION ALL
  -- disputes against the buyer (opened by seller)
  SELECT buyer_id AS user_id, id AS dispute_id, opened_at FROM disp
  WHERE buyer_id IS NOT NULL AND opened_by_user_id = seller_id
),
disp_agg AS (
  SELECT user_id, COUNT(*)::int AS disputes_30d, MAX(opened_at) AS last_dispute_at
  FROM disp_against
  GROUP BY user_id
),
disp_latest AS (
  SELECT DISTINCT ON (user_id)
    user_id, dispute_id AS latest_dispute_id
  FROM disp_against
  ORDER BY user_id, opened_at DESC
),
-- ============ REFUNDS (30d) ============
ref_agg AS (
  SELECT buyer_id AS user_id, COUNT(*)::int AS refunds_30d,
         MAX(created_at) AS last_refund_at
  FROM public.refunds
  WHERE buyer_id IS NOT NULL AND created_at >= now() - interval '30 days'
  GROUP BY buyer_id
),
-- ============ IDENTITY (rejected, 30d) ============
id_agg AS (
  SELECT DISTINCT ON (user_id)
    user_id, rejection_reason,
    COALESCE(rejected_at, updated_at) AS rejected_at
  FROM public.identity_submissions
  WHERE status = 'rejected'
    AND COALESCE(rejected_at, updated_at) >= now() - interval '30 days'
  ORDER BY user_id, COALESCE(rejected_at, updated_at) DESC
),
-- ============ INVESTIGATIONS (open) ============
inv AS (
  SELECT i.id, i.opened_at, t.buyer_id, t.seller_id
  FROM public.admin_investigations i
  JOIN public.transactions t ON t.id = i.transaction_id
  WHERE i.status IN ('open','under_review','escalated')
),
inv_by_user AS (
  SELECT buyer_id AS user_id, id, opened_at FROM inv WHERE buyer_id IS NOT NULL
  UNION ALL
  SELECT seller_id AS user_id, id, opened_at FROM inv WHERE seller_id IS NOT NULL
),
inv_agg AS (
  SELECT user_id, COUNT(*)::int AS open_investigations,
         MAX(opened_at) AS last_inv_at
  FROM inv_by_user
  GROUP BY user_id
),
-- ============ PAYOUTS (blocked / reversed) ============
payout_agg AS (
  SELECT
    seller_id AS user_id,
    COUNT(*) FILTER (WHERE status = 'blocked')  AS blocked_payouts,
    COUNT(*) FILTER (WHERE status = 'reversed') AS reversed_payouts,
    MAX(updated_at) AS last_payout_signal_at
  FROM public.payouts
  WHERE seller_id IS NOT NULL AND status IN ('blocked','reversed')
  GROUP BY seller_id
),
-- ============ CANDIDATE UNIVERSE (any flag signal) ============
universe AS (
  SELECT user_id FROM aa_agg WHERE flag_action_count > 0
  UNION SELECT user_id FROM tx_agg
  UNION SELECT user_id FROM disp_agg WHERE disputes_30d >= 2
  UNION SELECT user_id FROM ref_agg  WHERE refunds_30d  >= 2
  UNION SELECT user_id FROM id_agg
  UNION SELECT user_id FROM inv_agg
  UNION SELECT user_id FROM payout_agg WHERE blocked_payouts > 0 OR reversed_payouts > 0
  UNION SELECT id AS user_id FROM public.profiles WHERE status IN ('suspended','blocked')
),
-- ============ MERGE + DERIVE ============
merged AS (
  SELECT
    u.user_id,
    p.full_name,
    p.email,
    p.phone,
    p.avatar_url,
    p.default_role AS role,
    (p.status IN ('suspended','blocked') OR COALESCE(aa_agg.suspend_count, 0) > 0)
      AND COALESCE(aa_agg.last_unsuspend_at, 'epoch'::timestamptz)
        < COALESCE(aa_agg.last_flag_action_at, 'epoch'::timestamptz)
      AS is_suspended,

    COALESCE(aa_agg.flag_action_count, 0)         AS admin_flag_count,
    COALESCE(aa_agg.flag_user_count, 0)           AS flag_user_count,
    COALESCE(aa_agg.freeze_count, 0)              AS freeze_count,
    COALESCE(aa_agg.escalate_count, 0)            AS escalate_count,
    COALESCE(aa_agg.suspend_count, 0)             AS suspend_count,
    COALESCE(aa_agg.open_inv_action_count, 0)     AS open_inv_action_count,
    aa_agg.last_flag_action_at,
    aa_agg.last_clear_at,

    COALESCE(tx_agg.frozen_tx_count, 0)           AS frozen_tx_count,
    COALESCE(tx_agg.needs_admin_review_count, 0)  AS needs_admin_review_count,
    COALESCE(tx_agg.needs_release_review_count,0) AS needs_release_review_count,
    COALESCE(tx_agg.escrow_at_risk, 0)::numeric   AS escrow_at_risk,
    tx_agg.last_tx_signal_at,
    tx_latest.latest_tx_id,
    tx_latest.latest_tx_code,

    COALESCE(disp_agg.disputes_30d, 0)            AS disputes_30d,
    disp_latest.latest_dispute_id,

    COALESCE(ref_agg.refunds_30d, 0)              AS refunds_30d,

    (id_agg.user_id IS NOT NULL)                  AS identity_rejected,
    id_agg.rejection_reason                       AS identity_reason,
    id_agg.rejected_at                            AS identity_rejected_at,

    COALESCE(inv_agg.open_investigations, 0) > 0  AS has_open_investigation,
    inv_agg.last_inv_at,

    COALESCE(payout_agg.blocked_payouts, 0)       AS blocked_payouts,
    COALESCE(payout_agg.reversed_payouts, 0)      AS reversed_payouts,
    payout_agg.last_payout_signal_at,

    aa_last_admin.flagged_by_admin_id,

    GREATEST(
      COALESCE(aa_agg.last_flag_action_at, 'epoch'::timestamptz),
      COALESCE(tx_agg.last_tx_signal_at,   'epoch'::timestamptz),
      COALESCE(disp_agg.last_dispute_at,   'epoch'::timestamptz),
      COALESCE(ref_agg.last_refund_at,     'epoch'::timestamptz),
      COALESCE(id_agg.rejected_at,         'epoch'::timestamptz),
      COALESCE(inv_agg.last_inv_at,        'epoch'::timestamptz),
      COALESCE(payout_agg.last_payout_signal_at, 'epoch'::timestamptz)
    ) AS last_signal_at
  FROM universe u
  LEFT JOIN public.profiles p            ON p.id = u.user_id
  LEFT JOIN aa_agg                       ON aa_agg.user_id = u.user_id
  LEFT JOIN aa_last_admin                ON aa_last_admin.user_id = u.user_id
  LEFT JOIN tx_agg                       ON tx_agg.user_id = u.user_id
  LEFT JOIN tx_latest                    ON tx_latest.user_id = u.user_id
  LEFT JOIN disp_agg                     ON disp_agg.user_id = u.user_id
  LEFT JOIN disp_latest                  ON disp_latest.user_id = u.user_id
  LEFT JOIN ref_agg                      ON ref_agg.user_id = u.user_id
  LEFT JOIN id_agg                       ON id_agg.user_id = u.user_id
  LEFT JOIN inv_agg                      ON inv_agg.user_id = u.user_id
  LEFT JOIN payout_agg                   ON payout_agg.user_id = u.user_id
),
-- ============ REASONS + SCORE + LEVEL + STATUS ============
scored AS (
  SELECT
    m.*,
    -- reason keys (matches engine)
    ARRAY_REMOVE(ARRAY[
      CASE WHEN m.flag_user_count > 0 OR m.suspend_count > 0 OR m.is_suspended
           THEN 'admin_flag' END,
      CASE WHEN m.freeze_count > 0 OR m.frozen_tx_count > 0
           THEN 'stuck_frozen_escrow' END,
      CASE WHEN m.escalate_count > 0
             OR m.needs_admin_review_count > 0
             OR m.needs_release_review_count > 0
             OR m.blocked_payouts > 0
             OR m.reversed_payouts > 0
           THEN 'suspicious_activity' END,
      CASE WHEN m.has_open_investigation OR m.open_inv_action_count > 0
           THEN 'fraud_detection' END,
      CASE WHEN m.disputes_30d >= 2 THEN 'multiple_disputes' END,
      CASE WHEN m.refunds_30d  >= 2 THEN 'chargeback_pattern' END,
      CASE WHEN m.identity_rejected THEN 'identity_issues' END
    ], NULL) AS reason_keys,

    -- score (matches SIGNAL_WEIGHTS in the JS engine)
    LEAST(100, GREATEST(
      CASE WHEN m.is_suspended THEN 80 ELSE 0 END,
      (
        m.flag_user_count            * 20
      + m.freeze_count               * 35
      + m.escalate_count             * 40
      + m.suspend_count              * 60
      + m.frozen_tx_count            * 25
      + m.needs_admin_review_count   * 20
      + m.needs_release_review_count * 20
      + CASE WHEN m.disputes_30d >= 4 THEN 35
             WHEN m.disputes_30d >= 2 THEN 25 ELSE 0 END
      + CASE WHEN m.refunds_30d  >= 2 THEN 35 ELSE 0 END
      + CASE WHEN m.identity_rejected THEN 25 ELSE 0 END
      + CASE WHEN m.has_open_investigation THEN 30 ELSE 0 END
      + m.blocked_payouts  * 20
      + m.reversed_payouts * 35
      + CASE WHEN m.escrow_at_risk >= 1000000 THEN 20
             WHEN m.escrow_at_risk >=  500000 THEN 15
             WHEN m.escrow_at_risk >=  100000 THEN 10 ELSE 0 END
      + CASE WHEN m.last_signal_at > 'epoch'::timestamptz
                  AND m.last_signal_at >= now() - interval '1 day' THEN 10
             WHEN m.last_signal_at > 'epoch'::timestamptz
                  AND m.last_signal_at >= now() - interval '7 days' THEN 5 ELSE 0 END
      )
    ))::int AS score
  FROM merged m
),
final AS (
  SELECT
    s.*,
    CASE
      WHEN s.score >= 80 THEN 'critical'
      WHEN s.score >= 55 THEN 'high'
      WHEN s.score >= 30 THEN 'medium'
      ELSE 'low'
    END AS risk_level,
    CASE
      WHEN s.is_suspended THEN 'suspended'
      WHEN s.has_open_investigation OR s.escalate_count > 0 THEN 'under_review'
      WHEN s.last_clear_at IS NOT NULL
           AND s.last_clear_at >= COALESCE(s.last_signal_at,'epoch'::timestamptz)
           AND COALESCE(array_length(
             ARRAY_REMOVE(ARRAY[
               CASE WHEN s.flag_user_count>0 OR s.suspend_count>0 THEN 'admin_flag' END,
               CASE WHEN s.freeze_count>0 OR s.frozen_tx_count>0 THEN 'stuck_frozen_escrow' END,
               CASE WHEN s.escalate_count>0 OR s.needs_admin_review_count>0
                        OR s.needs_release_review_count>0 OR s.blocked_payouts>0
                        OR s.reversed_payouts>0 THEN 'suspicious_activity' END,
               CASE WHEN s.has_open_investigation THEN 'fraud_detection' END,
               CASE WHEN s.disputes_30d>=2 THEN 'multiple_disputes' END,
               CASE WHEN s.refunds_30d>=2 THEN 'chargeback_pattern' END,
               CASE WHEN s.identity_rejected THEN 'identity_issues' END
             ], NULL), 1), 0) = 0
        THEN 'resolved'
      ELSE 'active'
    END AS status,
    (s.flagged_by_admin_id IS NULL) AS auto_detected
  FROM scored s
)
SELECT
  f.user_id,
  COALESCE(f.full_name, 'Unknown user') AS full_name,
  COALESCE(f.email, '')                 AS email,
  f.phone,
  f.avatar_url,
  f.role,
  f.is_suspended,
  f.score,
  f.risk_level,
  f.status,
  f.reason_keys,
  f.admin_flag_count,
  f.flag_user_count,
  f.freeze_count,
  f.escalate_count,
  f.suspend_count,
  f.frozen_tx_count,
  f.needs_admin_review_count,
  f.needs_release_review_count,
  f.escrow_at_risk,
  f.latest_tx_id,
  f.latest_tx_code,
  f.disputes_30d,
  f.latest_dispute_id,
  f.refunds_30d,
  f.identity_rejected,
  f.identity_reason,
  f.has_open_investigation,
  f.blocked_payouts,
  f.reversed_payouts,
  f.flagged_by_admin_id,
  f.auto_detected,
  f.last_signal_at,
  f.last_clear_at,
  -- search haystack for fast ILIKE
  LOWER(
    COALESCE(f.full_name,'') || ' ' ||
    COALESCE(f.email,'')     || ' ' ||
    COALESCE(f.phone,'')     || ' ' ||
    'usr-' || SUBSTRING(f.user_id::text, 1, 8) || ' ' ||
    COALESCE(f.latest_tx_code,'') || ' ' ||
    CASE WHEN f.latest_dispute_id IS NOT NULL
         THEN 'dsp-' || SUBSTRING(f.latest_dispute_id::text, 1, 8) ELSE '' END
  ) AS search_haystack
FROM final f
-- keep only rows the UI considers flagged (drop empty resolved-only entries
-- when the user has no active reasons AND is not suspended)
WHERE COALESCE(array_length(f.reason_keys, 1), 0) > 0
   OR f.is_suspended
   OR f.has_open_investigation;

CREATE UNIQUE INDEX IF NOT EXISTS admin_flagged_users_mv_pk
  ON public.admin_flagged_users_mv(user_id);
CREATE INDEX IF NOT EXISTS admin_flagged_users_mv_status_score
  ON public.admin_flagged_users_mv(status, score DESC, last_signal_at DESC);
CREATE INDEX IF NOT EXISTS admin_flagged_users_mv_level
  ON public.admin_flagged_users_mv(risk_level);
CREATE INDEX IF NOT EXISTS admin_flagged_users_mv_last_signal
  ON public.admin_flagged_users_mv(last_signal_at DESC);
CREATE INDEX IF NOT EXISTS admin_flagged_users_mv_search
  ON public.admin_flagged_users_mv USING gin (search_haystack gin_trgm_ops);

-- ---------------------------------------------------------
-- Refresh function + cron
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_admin_flagged_users_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.admin_flagged_users_mv;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_admin_flagged_users_mv() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_admin_flagged_users_mv() TO service_role;

-- unschedule any prior version, then schedule fresh (every 2 minutes)
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'refresh_admin_flagged_users_mv';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'refresh_admin_flagged_users_mv',
  '*/2 * * * *',
  $$SELECT public.refresh_admin_flagged_users_mv();$$
);

-- ---------------------------------------------------------
-- Paginated RPC
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_flagged_users_page(
  p_search text DEFAULT NULL,
  p_risk   text DEFAULT 'all',        -- all|critical|high|medium|low
  p_reason text DEFAULT 'all',        -- all|<reason_key>
  p_status text DEFAULT 'active',     -- all|active|under_review|suspended|resolved
  p_sort   text DEFAULT 'risk',       -- risk|recent
  p_limit  int  DEFAULT 15,
  p_offset int  DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  role text,
  is_suspended boolean,
  score int,
  risk_level text,
  status text,
  reason_keys text[],
  admin_flag_count int,
  escrow_at_risk numeric,
  latest_tx_id uuid,
  latest_tx_code text,
  disputes_30d int,
  latest_dispute_id uuid,
  refunds_30d int,
  identity_rejected boolean,
  identity_reason text,
  has_open_investigation boolean,
  blocked_payouts int,
  reversed_payouts int,
  flagged_by_admin_id uuid,
  auto_detected boolean,
  last_signal_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(LOWER(TRIM(COALESCE(p_search,''))), '');
  v_lim    int  := GREATEST(1, LEAST(COALESCE(p_limit, 15), 100));
  v_off    int  := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT m.*
    FROM public.admin_flagged_users_mv m
    WHERE
      (p_status = 'all' OR m.status = p_status)
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
    CASE p_sort
      WHEN 'risk' THEN
        CASE f.risk_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                          WHEN 'medium' THEN 2 ELSE 3 END
      ELSE NULL
    END ASC,
    f.score DESC,
    f.last_signal_at DESC NULLS LAST
  LIMIT v_lim OFFSET v_off;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_flagged_users_page(text,text,text,text,text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_flagged_users_page(text,text,text,text,text,int,int) TO authenticated, service_role;

-- ---------------------------------------------------------
-- Summary RPC
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_flagged_users_summary()
RETURNS TABLE (
  total_flagged      bigint,
  critical_risk      bigint,
  high_risk          bigint,
  suspended          bigint,
  cleared_this_week  bigint,
  auto_detected      bigint,
  today_flagged      bigint,
  today_suspended    bigint,
  today_cleared      bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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
    WHERE target_user_id IS NOT NULL
      AND created_at >= date_trunc('day', now())
  )
  SELECT
    (SELECT COUNT(*) FROM base WHERE status <> 'resolved')::bigint,
    (SELECT COUNT(*) FROM base WHERE risk_level = 'critical' AND status <> 'resolved')::bigint,
    (SELECT COUNT(*) FROM base WHERE risk_level IN ('critical','high') AND status <> 'resolved')::bigint,
    (SELECT COUNT(*) FROM base WHERE status = 'suspended')::bigint,
    (SELECT n FROM cleared_wk),
    (SELECT COUNT(*) FROM base WHERE flagged_by_admin_id IS NULL AND status <> 'resolved')::bigint,
    (SELECT flagged   FROM today),
    (SELECT suspended FROM today),
    (SELECT cleared   FROM today);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_flagged_users_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_flagged_users_summary() TO authenticated, service_role;

-- Initial populate
SELECT public.refresh_admin_flagged_users_mv();
