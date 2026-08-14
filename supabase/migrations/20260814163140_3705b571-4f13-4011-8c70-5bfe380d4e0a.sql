-- 1. Canonical predicate: is this user an ACTIVE, non-expired internal (back-office) account?
CREATE OR REPLACE FUNCTION public.internal_access_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_users iu
    WHERE iu.id = _user_id
      -- 'invited' is the pre-activation state: the teammate must already hold a
      -- valid auth session minted from the invite link, and admin-me /
      -- AcceptInvite promote them to 'active' on first successful sign-in.
      -- Every other state (suspended, locked, deactivated, pending,
      -- pending_approval) is denied.
      AND iu.status IN ('active', 'invited')
      AND (iu.access_expires_at IS NULL OR iu.access_expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.internal_access_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_access_active(uuid) TO authenticated, service_role;

-- 2. Route every internal-role helper through it.
CREATE OR REPLACE FUNCTION public.has_any_internal_role(_user_id uuid, _role_keys text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.internal_access_active(_user_id)
     AND EXISTS (
       SELECT 1 FROM public.internal_user_roles
       WHERE user_id = _user_id AND role_key = ANY(_role_keys)
     );
$$;

CREATE OR REPLACE FUNCTION public.has_internal_role(_user_id uuid, _role_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.internal_access_active(_user_id)
     AND EXISTS (
       SELECT 1 FROM public.internal_user_roles
       WHERE user_id = _user_id AND role_key = _role_key
     );
$$;

CREATE OR REPLACE FUNCTION public.is_internal_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.internal_access_active(_user_id)
     AND EXISTS (SELECT 1 FROM public.internal_user_roles WHERE user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.internal_actor_rank(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.internal_access_active(_user_id) THEN 0
    ELSE COALESCE((
      SELECT MAX(public.internal_role_rank(role_key))
      FROM public.internal_user_roles
      WHERE user_id = _user_id
    ), 0)
  END;
$$;

-- Effective permissions collapse to the empty set for a non-active account,
-- which in turn makes internal_effective_access_level() return 'limited'.
CREATE OR REPLACE FUNCTION public.internal_effective_permissions(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH gate AS (SELECT public.internal_access_active(_user_id) AS ok),
  base AS (
    SELECT DISTINCT rp.permission_key AS k
    FROM public.internal_user_roles iur
    JOIN public.role_permissions rp ON rp.role_key = iur.role_key
    WHERE iur.user_id = _user_id
  ),
  grants AS (
    SELECT permission_key AS k FROM public.user_permission_overrides
    WHERE user_id = _user_id AND mode = 'grant'
  ),
  revokes AS (
    SELECT permission_key AS k FROM public.user_permission_overrides
    WHERE user_id = _user_id AND mode = 'revoke'
  )
  SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[])
  FROM (
    SELECT k FROM base
    UNION
    SELECT k FROM grants
    EXCEPT
    SELECT k FROM revokes
  ) x
  WHERE (SELECT ok FROM gate);
$$;

-- 3. Policies that decided access from bare internal_users membership.
DROP POLICY IF EXISTS "Internal users can read permission dependencies" ON public.permission_dependencies;
CREATE POLICY "Internal users can read permission dependencies"
ON public.permission_dependencies FOR SELECT TO authenticated
USING (public.internal_access_active(auth.uid()));

DROP POLICY IF EXISTS "internal staff can read conflict catalog" ON public.permission_conflicts;
CREATE POLICY "internal staff can read conflict catalog"
ON public.permission_conflicts FOR SELECT TO authenticated
USING (public.internal_access_active(auth.uid()));

DROP POLICY IF EXISTS "internal staff can read acknowledgements" ON public.permission_conflict_acknowledgements;
CREATE POLICY "internal staff can read acknowledgements"
ON public.permission_conflict_acknowledgements FOR SELECT TO authenticated
USING (public.internal_access_active(auth.uid()));

-- 4. Lockout guard: the sole active super_admin (platform owner) carries a
-- stale access_expires_at in the past. Enforcing expiry without clearing it
-- would immediately lock the owner out of the back office.
UPDATE public.internal_users iu
SET access_expires_at = NULL, updated_at = now()
WHERE iu.status = 'active'
  AND iu.access_expires_at IS NOT NULL
  AND iu.access_expires_at <= now()
  AND EXISTS (
    SELECT 1 FROM public.internal_user_roles r
    WHERE r.user_id = iu.id AND r.role_key = 'super_admin'
  );