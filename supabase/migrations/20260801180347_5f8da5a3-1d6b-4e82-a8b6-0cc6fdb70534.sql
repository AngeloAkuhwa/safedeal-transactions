-- ============================================================
-- Correction 2 / CP5 + CP6: expose + exact-search public_user_id, lock helpers
-- ============================================================

-- Trigger helpers must not be callable from the API surface.
REVOKE ALL ON FUNCTION public.profiles_assign_public_user_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_lock_public_user_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_retire_public_user_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_public_user_id_registry_delete() FROM PUBLIC, anon, authenticated;

-- ---------- User directory page ----------
DROP FUNCTION IF EXISTS public.admin_users_directory_page(text, text, text, text, text, integer, integer);

CREATE FUNCTION public.admin_users_directory_page(
  _search text DEFAULT NULL,
  _role text DEFAULT NULL,
  _status text DEFAULT NULL,
  _verification text DEFAULT NULL,
  _sort text DEFAULT 'joined_desc',
  _from integer DEFAULT 0,
  _to integer DEFAULT 24
)
RETURNS TABLE(
  user_id uuid, public_user_id text, full_name text, email text, phone text, avatar_url text,
  roles text[], id_status text, email_verified boolean, phone_verified boolean,
  identity_verified boolean, tx_count bigint, tx_resolved bigint, tx_volume numeric,
  disp_total bigint, disp_active bigint, is_flagged boolean, has_investigation boolean,
  is_suspended boolean, derived_status text, joined_at timestamptz,
  last_active_at timestamptz, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pub text := NULLIF(UPPER(TRIM(COALESCE(_search, ''))), '');
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT v.*,
      pr.public_user_id AS pub_id,
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
    JOIN public.profiles pr ON pr.id = v.user_id
  ),
  filtered AS (
    SELECT b.* FROM base b
    WHERE (_search IS NULL OR _search = '' OR
           b.pub_id = v_pub OR
           b.user_id::text = LOWER(TRIM(_search)) OR
           b.full_name ILIKE '%' || _search || '%' OR
           b.email ILIKE '%' || _search || '%' OR
           b.phone ILIKE '%' || _search || '%')
      AND (_role IS NULL OR _role = '' OR _role = ANY(b.roles) OR b.default_role = _role)
      AND (_status IS NULL OR _status = '' OR b.derived_status = _status)
      AND (_verification IS NULL OR _verification = '' OR b.verification_level = _verification)
  ),
  counted AS (
    SELECT f.*, count(*) OVER () AS total_count FROM filtered f
  )
  SELECT
    c.user_id, c.pub_id, c.full_name, c.email, c.phone, c.avatar_url, c.roles,
    c.id_status, c.email_verified, c.phone_verified, c.identity_verified,
    c.tx_count, c.tx_resolved, c.tx_volume, c.disp_total, c.disp_active,
    c.is_flagged, c.has_investigation, c.is_suspended,
    c.derived_status, c.joined_at, c.last_active_at, c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN _sort = 'name_asc' THEN c.full_name END ASC NULLS LAST,
    CASE WHEN _sort = 'disputes_desc' THEN c.disp_active END DESC NULLS LAST,
    CASE WHEN _sort = 'joined_asc' THEN c.joined_at END ASC NULLS LAST,
    CASE WHEN _sort = 'active_desc' THEN c.last_active_at END DESC NULLS LAST,
    CASE WHEN _sort = 'volume_desc' THEN c.tx_volume END DESC NULLS LAST,
    CASE WHEN _sort = 'txcount_desc' THEN c.tx_count END DESC NULLS LAST,
    CASE WHEN _sort = 'joined_desc' THEN c.joined_at END DESC NULLS LAST,
    c.joined_at DESC
  OFFSET _from
  LIMIT GREATEST(0, (_to - _from) + 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_users_directory_page(text, text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_users_directory_page(text, text, text, text, text, integer, integer) TO service_role;

-- ---------- Flagged users page ----------
DROP FUNCTION IF EXISTS public.admin_flagged_users_page(text, text, text, text, text, integer, integer);

CREATE FUNCTION public.admin_flagged_users_page(
  p_search text DEFAULT NULL,
  p_risk text DEFAULT 'all',
  p_reason text DEFAULT 'all',
  p_status text DEFAULT 'active',
  p_sort text DEFAULT 'risk',
  p_limit integer DEFAULT 15,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  user_id uuid, public_user_id text, full_name text, email text, phone text, avatar_url text,
  role text, is_suspended boolean, score integer, risk_level text, status text,
  reason_keys text[], admin_flag_count bigint, escrow_at_risk numeric, latest_tx_id uuid,
  latest_tx_code text, disputes_30d integer, latest_dispute_id uuid, refunds_30d integer,
  identity_rejected boolean, identity_reason text, has_open_investigation boolean,
  blocked_payouts bigint, reversed_payouts bigint, flagged_by_admin_id uuid,
  auto_detected boolean, last_signal_at timestamptz, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_search text := NULLIF(LOWER(TRIM(COALESCE(p_search,''))), '');
  v_pub    text := NULLIF(UPPER(TRIM(COALESCE(p_search,''))), '');
  v_lim    int  := GREATEST(1, LEAST(COALESCE(p_limit, 15), 100));
  v_off    int  := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH filtered AS (
    SELECT m.*, pr.public_user_id AS pub_id
    FROM public.admin_flagged_users_mv m
    JOIN public.profiles pr ON pr.id = m.user_id
    WHERE (p_status = 'all' OR m.status = p_status)
      AND (p_risk   = 'all' OR m.risk_level = p_risk)
      AND (p_reason = 'all' OR p_reason = ANY(m.reason_keys))
      AND (v_search IS NULL
           OR pr.public_user_id = v_pub
           OR m.user_id::text = v_search
           OR m.search_haystack ILIKE '%' || v_search || '%')
  ),
  counted AS (SELECT COUNT(*)::bigint AS c FROM filtered)
  SELECT
    f.user_id, f.pub_id, f.full_name, f.email, f.phone, f.avatar_url, f.role, f.is_suspended,
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
$function$;

REVOKE ALL ON FUNCTION public.admin_flagged_users_page(text, text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_flagged_users_page(text, text, text, text, text, integer, integer) TO service_role;