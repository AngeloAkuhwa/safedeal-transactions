ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS assignable boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_permissions_assignable
  ON public.permissions(assignable) WHERE assignable = false;

CREATE INDEX IF NOT EXISTS idx_change_sets_status_env
  ON public.permission_change_sets(status, environment);

CREATE OR REPLACE FUNCTION public.count_pending_approvals_for_actor(_actor uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count(*), 0)::int
  FROM public.permission_change_sets cs
  WHERE cs.status = 'pending_approval'
    AND cs.requested_by IS DISTINCT FROM _actor
    AND EXISTS (
      SELECT 1 FROM public.internal_users iu
      WHERE iu.id = _actor AND iu.status = 'active'
    )
    AND (
      public.has_internal_role(_actor, 'super_admin')
      OR public.has_internal_role(_actor, 'senior_admin')
      OR public.has_internal_role(_actor, 'admin')
    );
$$;

GRANT EXECUTE ON FUNCTION public.count_pending_approvals_for_actor(uuid) TO authenticated;
