REVOKE EXECUTE ON FUNCTION public.recompute_needs_admin_review(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_needs_admin_review(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_needs_admin_review(uuid) TO service_role;