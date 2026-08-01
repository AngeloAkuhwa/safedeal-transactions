-- C2-FINAL-1: least-privilege containment for identity surfaces

-- 1. Summary RPCs: service_role only
REVOKE ALL ON FUNCTION public.admin_users_directory_summary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_flagged_users_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_users_directory_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_flagged_users_summary() TO service_role;

-- 2. Identity generator / trigger helpers: service_role only (idempotent re-assert)
REVOKE ALL ON FUNCTION public.generate_public_user_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_public_user_id() TO service_role;
REVOKE ALL ON FUNCTION public.profiles_assign_public_user_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_lock_public_user_id() FROM PUBLIC, anon, authenticated;

-- 3. Mapping table: closed to app roles, service_role read/insert only
REVOKE ALL ON TABLE public.public_user_id_mapping FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.public_user_id_mapping TO service_role;
ALTER TABLE public.public_user_id_mapping ENABLE ROW LEVEL SECURITY;

-- 4. Registry: permanent, append-only. No DELETE to any application role.
REVOKE ALL ON TABLE public.public_user_id_registry FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.public_user_id_registry FROM service_role;
GRANT SELECT, INSERT ON TABLE public.public_user_id_registry TO service_role;
GRANT UPDATE (retired_at) ON TABLE public.public_user_id_registry TO service_role;
ALTER TABLE public.public_user_id_registry ENABLE ROW LEVEL SECURITY;

-- 5. Identity ACL violation enumerator (regression check helper)
CREATE OR REPLACE FUNCTION public.identity_acl_violations()
RETURNS TABLE(object_kind text, object_name text, grantee text, privilege text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'table', c.relname::text, a.grantee, a.privilege_type
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) ax
  JOIN LATERAL (
    SELECT pg_get_userbyid(ax.grantee) AS grantee,
           ax.privilege_type::text AS privilege_type
  ) a ON true
  WHERE n.nspname = 'public'
    AND c.relname IN ('public_user_id_mapping','public_user_id_registry')
    AND a.grantee IN ('anon','authenticated','PUBLIC')
  UNION ALL
  SELECT 'function', p.proname::text, a.grantee, a.privilege_type
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(p.proacl) ax
  JOIN LATERAL (
    SELECT pg_get_userbyid(ax.grantee) AS grantee,
           ax.privilege_type::text AS privilege_type
  ) a ON true
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'admin_users_directory_summary','admin_flagged_users_summary',
      'generate_public_user_id','profiles_assign_public_user_id','profiles_lock_public_user_id'
    )
    AND a.grantee IN ('anon','authenticated','PUBLIC');
$$;

REVOKE ALL ON FUNCTION public.identity_acl_violations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.identity_acl_violations() TO service_role;