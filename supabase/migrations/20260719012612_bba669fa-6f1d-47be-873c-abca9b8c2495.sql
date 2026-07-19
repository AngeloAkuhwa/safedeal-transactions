
CREATE OR REPLACE VIEW public.admin_user_directory_view AS
WITH tx_agg AS (
  SELECT
    uid AS user_id,
    count(*)::bigint AS tx_count,
    count(*) FILTER (WHERE status::text IN ('completed','resolved','refunded'))::bigint AS tx_resolved,
    COALESCE(sum(
      CASE WHEN status::text IN (
        'payment_secured','seller_preparing_delivery','seller_dispatched',
        'delivered_awaiting_verification','disputed','resolved','completed','refunded'
      ) THEN buyer_total ELSE 0 END
    ), 0)::numeric AS tx_volume
  FROM (
    SELECT t.buyer_id AS uid, t.status,
           COALESCE(tp.buyer_total_amount, 0) AS buyer_total
    FROM public.transactions t
    LEFT JOIN public.transaction_pricing tp ON tp.transaction_id = t.id
    WHERE t.status::text NOT IN ('draft','cancelled','timed_out') AND t.buyer_id IS NOT NULL
    UNION ALL
    SELECT t.seller_id AS uid, t.status,
           COALESCE(tp.buyer_total_amount, 0) AS buyer_total
    FROM public.transactions t
    LEFT JOIN public.transaction_pricing tp ON tp.transaction_id = t.id
    WHERE t.status::text NOT IN ('draft','cancelled','timed_out') AND t.seller_id IS NOT NULL
  ) x
  GROUP BY uid
),
disp_agg AS (
  SELECT uid AS user_id,
         count(*)::bigint AS disp_total,
         count(*) FILTER (WHERE status::text NOT IN ('resolved'))::bigint AS disp_active
  FROM (
    SELECT t.buyer_id AS uid, d.status
    FROM public.disputes d
    JOIN public.transactions t ON t.id = d.transaction_id
    WHERE t.buyer_id IS NOT NULL
    UNION ALL
    SELECT t.seller_id AS uid, d.status
    FROM public.disputes d
    JOIN public.transactions t ON t.id = d.transaction_id
    WHERE t.seller_id IS NOT NULL
  ) y
  GROUP BY uid
),
flag_agg AS (
  SELECT
    target_user_id AS user_id,
    bool_or(action_type::text IN ('flag_user','flag_for_review')
            AND created_at > COALESCE(cleared_at, '-infinity'::timestamptz)) AS is_flagged,
    bool_or(action_type::text IN ('open_investigation','escalate_case')
            AND created_at > COALESCE(cleared_at, '-infinity'::timestamptz)) AS has_investigation,
    bool_or(latest_suspend AND NOT latest_unsuspend) AS is_suspended
  FROM (
    SELECT a.target_user_id, a.action_type, a.created_at,
      (SELECT max(a2.created_at) FROM public.admin_actions a2
        WHERE a2.target_user_id = a.target_user_id
          AND a2.action_type::text IN ('clear_flag','unflag_user','close_case')) AS cleared_at,
      (a.action_type::text = 'suspend_user'
        AND a.created_at = (SELECT max(created_at) FROM public.admin_actions
                              WHERE target_user_id = a.target_user_id
                                AND action_type::text IN ('suspend_user','unsuspend_user'))) AS latest_suspend,
      (a.action_type::text = 'unsuspend_user'
        AND a.created_at = (SELECT max(created_at) FROM public.admin_actions
                              WHERE target_user_id = a.target_user_id
                                AND action_type::text IN ('suspend_user','unsuspend_user'))) AS latest_unsuspend
    FROM public.admin_actions a
    WHERE a.target_user_id IS NOT NULL
  ) z
  GROUP BY target_user_id
),
id_latest AS (
  SELECT DISTINCT ON (user_id) user_id, status::text AS id_status, updated_at
  FROM public.identity_submissions
  ORDER BY user_id, updated_at DESC
),
roles_agg AS (
  SELECT user_id, array_agg(DISTINCT role::text) AS roles
  FROM public.user_roles
  GROUP BY user_id
)
SELECT
  p.id AS user_id,
  p.full_name,
  p.email,
  p.phone,
  p.avatar_url,
  p.status::text AS profile_status,
  p.default_role::text AS default_role,
  p.created_at AS joined_at,
  COALESCE(p.last_login_at, p.updated_at) AS last_active_at,
  COALESCE(r.roles, ARRAY[]::text[]) AS roles,
  il.id_status,
  COALESCE(av.email_verified, false) AS email_verified,
  COALESCE(av.phone_verified, false) AS phone_verified,
  COALESCE(av.identity_verified, false) AS identity_verified,
  COALESCE(ta.tx_count, 0) AS tx_count,
  COALESCE(ta.tx_resolved, 0) AS tx_resolved,
  COALESCE(ta.tx_volume, 0) AS tx_volume,
  COALESCE(da.disp_total, 0) AS disp_total,
  COALESCE(da.disp_active, 0) AS disp_active,
  COALESCE(fa.is_flagged, false) AS is_flagged,
  COALESCE(fa.has_investigation, false) AS has_investigation,
  COALESCE(fa.is_suspended, false) AS is_suspended
FROM public.profiles p
LEFT JOIN tx_agg ta ON ta.user_id = p.id
LEFT JOIN disp_agg da ON da.user_id = p.id
LEFT JOIN flag_agg fa ON fa.user_id = p.id
LEFT JOIN id_latest il ON il.user_id = p.id
LEFT JOIN public.account_verifications av ON av.user_id = p.id
LEFT JOIN roles_agg r ON r.user_id = p.id;

GRANT SELECT ON public.admin_user_directory_view TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_users_directory_page(
  _search text DEFAULT NULL,
  _role text DEFAULT NULL,
  _status text DEFAULT NULL,
  _verification text DEFAULT NULL,
  _sort text DEFAULT 'joined_desc',
  _from int DEFAULT 0,
  _to int DEFAULT 24
)
RETURNS TABLE(
  user_id uuid, full_name text, email text, phone text, avatar_url text,
  roles text[], id_status text, email_verified bool, phone_verified bool,
  identity_verified bool, tx_count bigint, tx_resolved bigint, tx_volume numeric,
  disp_total bigint, disp_active bigint,
  is_flagged bool, has_investigation bool, is_suspended bool,
  derived_status text, joined_at timestamptz, last_active_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT v.*,
      CASE
        WHEN v.is_suspended OR v.profile_status IN ('suspended','blocked') THEN 'suspended'
        WHEN v.has_investigation THEN 'under_investigation'
        WHEN v.is_flagged THEN 'flagged'
        WHEN v.id_status IN ('pending','submitted','in_review') THEN 'pending'
        ELSE 'active'
      END AS derived_status,
      CASE
        WHEN v.identity_verified AND v.email_verified AND v.phone_verified THEN 'fully'
        WHEN v.identity_verified THEN 'id'
        WHEN v.phone_verified THEN 'phone'
        WHEN v.email_verified THEN 'email'
        ELSE 'none'
      END AS verification_level
    FROM public.admin_user_directory_view v
  ),
  filtered AS (
    SELECT * FROM base
    WHERE (_search IS NULL OR _search = '' OR
           full_name ILIKE '%' || _search || '%' OR
           email ILIKE '%' || _search || '%' OR
           phone ILIKE '%' || _search || '%')
      AND (_role IS NULL OR _role = '' OR _role = ANY(roles) OR default_role = _role)
      AND (_status IS NULL OR _status = '' OR derived_status = _status)
      AND (_verification IS NULL OR _verification = '' OR verification_level = _verification)
  ),
  counted AS (
    SELECT f.*, count(*) OVER () AS total_count FROM filtered f
  )
  SELECT
    c.user_id, c.full_name, c.email, c.phone, c.avatar_url, c.roles,
    c.id_status, c.email_verified, c.phone_verified, c.identity_verified,
    c.tx_count, c.tx_resolved, c.tx_volume, c.disp_total, c.disp_active,
    c.is_flagged, c.has_investigation, c.is_suspended,
    c.derived_status, c.joined_at, c.last_active_at, c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN _sort = 'joined_desc' THEN c.joined_at END DESC NULLS LAST,
    CASE WHEN _sort = 'joined_asc' THEN c.joined_at END ASC NULLS LAST,
    CASE WHEN _sort = 'active_desc' THEN c.last_active_at END DESC NULLS LAST,
    CASE WHEN _sort = 'volume_desc' THEN c.tx_volume END DESC NULLS LAST,
    CASE WHEN _sort = 'txcount_desc' THEN c.tx_count END DESC NULLS LAST,
    c.joined_at DESC
  OFFSET _from
  LIMIT GREATEST(0, (_to - _from) + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_users_directory_page(text,text,text,text,text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_users_directory_page(text,text,text,text,text,int,int) TO authenticated, service_role;
