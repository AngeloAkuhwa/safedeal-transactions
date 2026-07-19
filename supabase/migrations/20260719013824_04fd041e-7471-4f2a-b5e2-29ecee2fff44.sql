
DROP MATERIALIZED VIEW IF EXISTS public.admin_flagged_users_mv CASCADE;

CREATE MATERIALIZED VIEW public.admin_flagged_users_mv AS
WITH
aa AS (
  SELECT target_user_id AS user_id, action_type, admin_user_id, transaction_id, created_at
  FROM public.admin_actions
  WHERE target_user_id IS NOT NULL AND created_at >= now() - interval '30 days'
),
aa_agg AS (
  SELECT user_id,
    COUNT(*) FILTER (WHERE action_type IN
      ('flag_user','flag_for_review','freeze_transaction','escalate_case',
       'suspend_user','open_investigation')) AS flag_action_count,
    COUNT(*) FILTER (WHERE action_type IN ('flag_user','flag_for_review')) AS flag_user_count,
    COUNT(*) FILTER (WHERE action_type = 'freeze_transaction') AS freeze_count,
    COUNT(*) FILTER (WHERE action_type = 'escalate_case')      AS escalate_count,
    COUNT(*) FILTER (WHERE action_type = 'suspend_user')       AS suspend_count,
    COUNT(*) FILTER (WHERE action_type = 'open_investigation') AS open_inv_action_count,
    MAX(CASE WHEN action_type IN
      ('flag_user','flag_for_review','freeze_transaction','escalate_case',
       'suspend_user','open_investigation') THEN created_at END) AS last_flag_action_at,
    MAX(CASE WHEN action_type IN ('unflag_user','clear_flag','close_case') THEN created_at END) AS last_clear_at,
    MAX(CASE WHEN action_type = 'unsuspend_user' THEN created_at END) AS last_unsuspend_at
  FROM aa GROUP BY user_id
),
aa_last_admin AS (
  SELECT DISTINCT ON (target_user_id) target_user_id AS user_id, admin_user_id AS flagged_by_admin_id
  FROM public.admin_actions
  WHERE target_user_id IS NOT NULL
    AND action_type IN ('flag_user','flag_for_review','freeze_transaction',
                        'escalate_case','suspend_user','open_investigation')
    AND created_at >= now() - interval '30 days'
  ORDER BY target_user_id, created_at DESC
),
flagged_tx AS (
  SELECT t.id AS tx_id, t.transaction_code, t.buyer_id, t.seller_id, t.money_status,
    t.needs_admin_review, t.needs_release_review, t.updated_at,
    COALESCE(e.held_amount, 0) + COALESCE(e.frozen_amount, 0) AS at_risk_amount
  FROM public.transactions t LEFT JOIN public.escrow_states e ON e.transaction_id = t.id
  WHERE t.needs_admin_review = true OR t.needs_release_review = true OR t.money_status = 'funds_frozen'
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
  SELECT user_id,
    COUNT(*) FILTER (WHERE money_status = 'funds_frozen')   AS frozen_tx_count,
    COUNT(*) FILTER (WHERE needs_admin_review = true)       AS needs_admin_review_count,
    COUNT(*) FILTER (WHERE needs_release_review = true)     AS needs_release_review_count,
    SUM(at_risk_amount)                                     AS escrow_at_risk,
    MAX(updated_at)                                         AS last_tx_signal_at
  FROM flagged_tx_by_user GROUP BY user_id
),
tx_latest AS (
  SELECT DISTINCT ON (user_id) user_id, tx_id AS latest_tx_id, transaction_code AS latest_tx_code
  FROM flagged_tx_by_user ORDER BY user_id, updated_at DESC
),
disp AS (
  SELECT d.id, d.opened_at, d.opened_by_user_id, t.buyer_id, t.seller_id
  FROM public.disputes d JOIN public.transactions t ON t.id = d.transaction_id
  WHERE d.opened_at >= now() - interval '30 days'
),
disp_against AS (
  SELECT seller_id AS user_id, id AS dispute_id, opened_at FROM disp
    WHERE seller_id IS NOT NULL AND opened_by_user_id IS DISTINCT FROM seller_id
  UNION ALL
  SELECT buyer_id AS user_id, id AS dispute_id, opened_at FROM disp
    WHERE buyer_id IS NOT NULL AND opened_by_user_id = seller_id
),
disp_agg AS (
  SELECT user_id, COUNT(*)::int AS disputes_30d, MAX(opened_at) AS last_dispute_at
  FROM disp_against GROUP BY user_id
),
disp_latest AS (
  SELECT DISTINCT ON (user_id) user_id, dispute_id AS latest_dispute_id
  FROM disp_against ORDER BY user_id, opened_at DESC
),
ref_agg AS (
  SELECT buyer_id AS user_id, COUNT(*)::int AS refunds_30d, MAX(created_at) AS last_refund_at
  FROM public.refunds WHERE buyer_id IS NOT NULL AND created_at >= now() - interval '30 days'
  GROUP BY buyer_id
),
id_agg AS (
  SELECT DISTINCT ON (user_id) user_id, rejection_reason,
    COALESCE(rejected_at, updated_at) AS rejected_at
  FROM public.identity_submissions
  WHERE status = 'rejected' AND COALESCE(rejected_at, updated_at) >= now() - interval '30 days'
  ORDER BY user_id, COALESCE(rejected_at, updated_at) DESC
),
inv AS (
  SELECT i.id, i.opened_at, t.buyer_id, t.seller_id
  FROM public.admin_investigations i JOIN public.transactions t ON t.id = i.transaction_id
  WHERE i.status IN ('open','under_review','escalated')
),
inv_by_user AS (
  SELECT buyer_id AS user_id, id, opened_at FROM inv WHERE buyer_id IS NOT NULL
  UNION ALL
  SELECT seller_id AS user_id, id, opened_at FROM inv WHERE seller_id IS NOT NULL
),
inv_agg AS (
  SELECT user_id, COUNT(*)::int AS open_investigations, MAX(opened_at) AS last_inv_at
  FROM inv_by_user GROUP BY user_id
),
payout_agg AS (
  SELECT seller_id AS user_id,
    COUNT(*) FILTER (WHERE status = 'blocked')  AS blocked_payouts,
    COUNT(*) FILTER (WHERE status = 'reversed') AS reversed_payouts,
    MAX(updated_at) AS last_payout_signal_at
  FROM public.payouts WHERE seller_id IS NOT NULL AND status IN ('blocked','reversed')
  GROUP BY seller_id
),
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
merged AS (
  SELECT u.user_id,
    p.full_name, p.email, p.phone, p.avatar_url, p.default_role::text AS role,
    (p.status IN ('suspended','blocked') OR COALESCE(aa_agg.suspend_count, 0) > 0)
      AND COALESCE(aa_agg.last_unsuspend_at, 'epoch'::timestamptz)
        < COALESCE(aa_agg.last_flag_action_at, 'epoch'::timestamptz)
      AS is_suspended,
    COALESCE(aa_agg.flag_action_count, 0) AS admin_flag_count,
    COALESCE(aa_agg.flag_user_count, 0)   AS flag_user_count,
    COALESCE(aa_agg.freeze_count, 0)      AS freeze_count,
    COALESCE(aa_agg.escalate_count, 0)    AS escalate_count,
    COALESCE(aa_agg.suspend_count, 0)     AS suspend_count,
    COALESCE(aa_agg.open_inv_action_count, 0) AS open_inv_action_count,
    aa_agg.last_flag_action_at, aa_agg.last_clear_at,
    COALESCE(tx_agg.frozen_tx_count, 0)            AS frozen_tx_count,
    COALESCE(tx_agg.needs_admin_review_count, 0)   AS needs_admin_review_count,
    COALESCE(tx_agg.needs_release_review_count, 0) AS needs_release_review_count,
    COALESCE(tx_agg.escrow_at_risk, 0)::numeric    AS escrow_at_risk,
    tx_agg.last_tx_signal_at, tx_latest.latest_tx_id, tx_latest.latest_tx_code,
    COALESCE(disp_agg.disputes_30d, 0) AS disputes_30d,
    disp_latest.latest_dispute_id,
    COALESCE(ref_agg.refunds_30d, 0)   AS refunds_30d,
    (id_agg.user_id IS NOT NULL)       AS identity_rejected,
    id_agg.rejection_reason            AS identity_reason,
    id_agg.rejected_at                 AS identity_rejected_at,
    COALESCE(inv_agg.open_investigations, 0) > 0 AS has_open_investigation,
    inv_agg.last_inv_at,
    COALESCE(payout_agg.blocked_payouts, 0)  AS blocked_payouts,
    COALESCE(payout_agg.reversed_payouts, 0) AS reversed_payouts,
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
  LEFT JOIN public.profiles p ON p.id = u.user_id
  LEFT JOIN aa_agg        ON aa_agg.user_id = u.user_id
  LEFT JOIN aa_last_admin ON aa_last_admin.user_id = u.user_id
  LEFT JOIN tx_agg        ON tx_agg.user_id = u.user_id
  LEFT JOIN tx_latest     ON tx_latest.user_id = u.user_id
  LEFT JOIN disp_agg      ON disp_agg.user_id = u.user_id
  LEFT JOIN disp_latest   ON disp_latest.user_id = u.user_id
  LEFT JOIN ref_agg       ON ref_agg.user_id = u.user_id
  LEFT JOIN id_agg        ON id_agg.user_id = u.user_id
  LEFT JOIN inv_agg       ON inv_agg.user_id = u.user_id
  LEFT JOIN payout_agg    ON payout_agg.user_id = u.user_id
),
scored AS (
  SELECT m.*,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN m.flag_user_count > 0 OR m.suspend_count > 0 OR m.is_suspended THEN 'admin_flag' END,
      CASE WHEN m.freeze_count > 0 OR m.frozen_tx_count > 0 THEN 'stuck_frozen_escrow' END,
      CASE WHEN m.escalate_count > 0 OR m.needs_admin_review_count > 0
             OR m.needs_release_review_count > 0 OR m.blocked_payouts > 0
             OR m.reversed_payouts > 0 THEN 'suspicious_activity' END,
      CASE WHEN m.has_open_investigation OR m.open_inv_action_count > 0 THEN 'fraud_detection' END,
      CASE WHEN m.disputes_30d >= 2 THEN 'multiple_disputes' END,
      CASE WHEN m.refunds_30d  >= 2 THEN 'chargeback_pattern' END,
      CASE WHEN m.identity_rejected THEN 'identity_issues' END
    ], NULL) AS reason_keys,
    LEAST(100, GREATEST(
      CASE WHEN m.is_suspended THEN 80 ELSE 0 END,
      ( m.flag_user_count * 20 + m.freeze_count * 35 + m.escalate_count * 40
      + m.suspend_count * 60 + m.frozen_tx_count * 25
      + m.needs_admin_review_count * 20 + m.needs_release_review_count * 20
      + CASE WHEN m.disputes_30d >= 4 THEN 35 WHEN m.disputes_30d >= 2 THEN 25 ELSE 0 END
      + CASE WHEN m.refunds_30d  >= 2 THEN 35 ELSE 0 END
      + CASE WHEN m.identity_rejected THEN 25 ELSE 0 END
      + CASE WHEN m.has_open_investigation THEN 30 ELSE 0 END
      + m.blocked_payouts * 20 + m.reversed_payouts * 35
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
  SELECT s.*,
    CASE WHEN s.score >= 80 THEN 'critical' WHEN s.score >= 55 THEN 'high'
         WHEN s.score >= 30 THEN 'medium' ELSE 'low' END AS risk_level,
    CASE
      WHEN s.is_suspended THEN 'suspended'
      WHEN s.has_open_investigation OR s.escalate_count > 0 THEN 'under_review'
      WHEN s.last_clear_at IS NOT NULL
           AND s.last_clear_at >= COALESCE(s.last_signal_at,'epoch'::timestamptz)
           AND COALESCE(array_length(s.reason_keys, 1), 0) = 0
        THEN 'resolved'
      ELSE 'active'
    END AS status,
    (s.flagged_by_admin_id IS NULL) AS auto_detected
  FROM scored s
)
SELECT
  f.user_id, COALESCE(f.full_name, 'Unknown user') AS full_name,
  COALESCE(f.email, '') AS email, f.phone, f.avatar_url, f.role,
  f.is_suspended, f.score, f.risk_level, f.status, f.reason_keys,
  f.admin_flag_count, f.flag_user_count, f.freeze_count, f.escalate_count,
  f.suspend_count, f.frozen_tx_count, f.needs_admin_review_count,
  f.needs_release_review_count, f.escrow_at_risk, f.latest_tx_id, f.latest_tx_code,
  f.disputes_30d, f.latest_dispute_id, f.refunds_30d, f.identity_rejected,
  f.identity_reason, f.has_open_investigation, f.blocked_payouts, f.reversed_payouts,
  f.flagged_by_admin_id, f.auto_detected, f.last_signal_at, f.last_clear_at,
  LOWER(COALESCE(f.full_name,'') || ' ' || COALESCE(f.email,'') || ' ' ||
    COALESCE(f.phone,'') || ' ' || 'usr-' || SUBSTRING(f.user_id::text, 1, 8) ||
    ' ' || COALESCE(f.latest_tx_code,'') || ' ' ||
    CASE WHEN f.latest_dispute_id IS NOT NULL
         THEN 'dsp-' || SUBSTRING(f.latest_dispute_id::text, 1, 8) ELSE '' END
  ) AS search_haystack
FROM final f
WHERE COALESCE(array_length(f.reason_keys, 1), 0) > 0
   OR f.is_suspended OR f.has_open_investigation;

CREATE UNIQUE INDEX admin_flagged_users_mv_pk ON public.admin_flagged_users_mv(user_id);
CREATE INDEX admin_flagged_users_mv_status_score
  ON public.admin_flagged_users_mv(status, score DESC, last_signal_at DESC);
CREATE INDEX admin_flagged_users_mv_level ON public.admin_flagged_users_mv(risk_level);
CREATE INDEX admin_flagged_users_mv_last_signal
  ON public.admin_flagged_users_mv(last_signal_at DESC);
CREATE INDEX admin_flagged_users_mv_search
  ON public.admin_flagged_users_mv USING gin (search_haystack gin_trgm_ops);

REVOKE ALL ON public.admin_flagged_users_mv FROM anon, authenticated;
GRANT SELECT ON public.admin_flagged_users_mv TO service_role;

-- Fix summary RPC ambiguity by renaming CTE columns
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
    SELECT COUNT(DISTINCT target_user_id)::bigint AS n_cleared_wk
    FROM public.admin_actions
    WHERE action_type IN ('unflag_user','clear_flag','close_case')
      AND created_at >= now() - interval '7 days' AND target_user_id IS NOT NULL
  ),
  today AS (
    SELECT
      COUNT(DISTINCT target_user_id) FILTER (
        WHERE action_type IN ('flag_user','flag_for_review','freeze_transaction',
                              'escalate_case','open_investigation')
      )::bigint AS n_flagged,
      COUNT(DISTINCT target_user_id) FILTER (WHERE action_type = 'suspend_user')::bigint AS n_suspended,
      COUNT(DISTINCT target_user_id) FILTER (
        WHERE action_type IN ('unflag_user','clear_flag','close_case')
      )::bigint AS n_cleared
    FROM public.admin_actions
    WHERE target_user_id IS NOT NULL AND created_at >= date_trunc('day', now())
  )
  SELECT
    (SELECT COUNT(*) FROM base b WHERE b.status <> 'resolved')::bigint,
    (SELECT COUNT(*) FROM base b WHERE b.risk_level = 'critical' AND b.status <> 'resolved')::bigint,
    (SELECT COUNT(*) FROM base b WHERE b.risk_level IN ('critical','high') AND b.status <> 'resolved')::bigint,
    (SELECT COUNT(*) FROM base b WHERE b.status = 'suspended')::bigint,
    (SELECT n_cleared_wk FROM cleared_wk),
    (SELECT COUNT(*) FROM base b WHERE b.flagged_by_admin_id IS NULL AND b.status <> 'resolved')::bigint,
    (SELECT n_flagged FROM today), (SELECT n_suspended FROM today), (SELECT n_cleared FROM today);
END;
$$;

SELECT public.refresh_admin_flagged_users_mv();
