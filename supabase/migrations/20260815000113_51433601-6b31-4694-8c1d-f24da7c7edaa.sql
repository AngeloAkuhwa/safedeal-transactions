-- Fail-open guard: "IF uid IS NOT NULL AND NOT admin THEN raise" lets a
-- signed-out caller (uid NULL) straight through. Flip to fail-closed.
DO $do$
DECLARE
  r record;
  src text;
  fixed text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_functiondef(p.oid) ~ '(v_uid|auth\.uid\(\)) IS NOT NULL\s+AND NOT public\.(has_role|has_internal_role)'
  LOOP
    src := pg_get_functiondef(r.oid);
    fixed := regexp_replace(
      src,
      '(v_uid|auth\.uid\(\)) IS NOT NULL(\s+)AND NOT public\.',
      '\1 IS NULL\2OR NOT public.',
      'g'
    );
    IF fixed <> src THEN
      EXECUTE fixed;
    END IF;
  END LOOP;
END
$do$;

-- Admin reporting surfaces are for signed-in staff, never anon.
REVOKE ALL ON FUNCTION public.admin_escrow_kpis() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_daily_activity_counts(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_distinct_active_users(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_flagged_users_count(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_identity_review_health(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_pricing_settings_at(uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refresh_admin_flagged_users_mv() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_escrow_kpis() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_daily_activity_counts(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_distinct_active_users(timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_flagged_users_count(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_identity_review_health(timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pricing_settings_at(uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_admin_flagged_users_mv() TO service_role;