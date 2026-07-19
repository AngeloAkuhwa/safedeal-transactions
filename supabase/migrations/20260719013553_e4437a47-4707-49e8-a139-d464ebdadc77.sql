
REVOKE ALL ON public.admin_flagged_users_mv FROM anon, authenticated;
GRANT SELECT ON public.admin_flagged_users_mv TO service_role;
