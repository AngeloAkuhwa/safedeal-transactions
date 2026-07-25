
REVOKE EXECUTE ON FUNCTION public.has_internal_role(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_internal_role(uuid, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.internal_effective_permissions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.internal_effective_access_level(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_internal_role(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_internal_role(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.internal_effective_permissions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.internal_effective_access_level(uuid) TO authenticated, service_role;
