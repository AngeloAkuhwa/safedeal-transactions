
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
$$;

CREATE OR REPLACE FUNCTION public.admin_users_directory_summary()
RETURNS TABLE(
  total_users bigint, id_verified bigint, email_verified bigint,
  phone_verified bigint, fully_verified bigint, flagged_users bigint,
  new_this_week bigint, new_this_month bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE identity_verified)::bigint,
    count(*) FILTER (WHERE email_verified)::bigint,
    count(*) FILTER (WHERE phone_verified)::bigint,
    count(*) FILTER (WHERE identity_verified AND email_verified AND phone_verified)::bigint,
    count(*) FILTER (WHERE is_flagged OR has_investigation)::bigint,
    count(*) FILTER (WHERE joined_at >= now() - interval '7 days')::bigint,
    count(*) FILTER (WHERE joined_at >= now() - interval '30 days')::bigint
  FROM public.admin_user_directory_view;
$$;

REVOKE ALL ON FUNCTION public.admin_users_directory_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_users_directory_summary() TO authenticated, service_role;
