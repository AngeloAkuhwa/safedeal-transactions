-- Fix 1: Prevent privilege escalation — restrict self-insert to non-admin roles
DROP POLICY IF EXISTS users_insert_own_role ON public.user_roles;

CREATE POLICY users_insert_own_non_admin_role
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND role <> 'admin'::user_role_type
);

-- Fix 2: Restrict anonymous access to public profile fields only
-- (RLS policy still controls row visibility; column grants restrict columns)
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, full_name, avatar_url, store_slug, city_name, state_name, country_code, default_role, created_at)
  ON public.profiles TO anon;