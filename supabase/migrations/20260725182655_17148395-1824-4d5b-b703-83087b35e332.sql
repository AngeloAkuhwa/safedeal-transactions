
-- Bootstrap: existing legacy admins can also manage internal user tables
DROP POLICY IF EXISTS "staff read internal_users" ON public.internal_users;
CREATE POLICY "staff read internal_users" ON public.internal_users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::user_role_type)
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin','auditor'])
  );

DROP POLICY IF EXISTS "staff manage internal_users" ON public.internal_users;
CREATE POLICY "staff manage internal_users" ON public.internal_users
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::user_role_type)
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin'])
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::user_role_type)
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin'])
  );

DROP POLICY IF EXISTS "staff read user_roles" ON public.internal_user_roles;
CREATE POLICY "staff read user_roles" ON public.internal_user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::user_role_type)
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin','auditor'])
  );

DROP POLICY IF EXISTS "staff manage user_roles" ON public.internal_user_roles;
CREATE POLICY "staff manage user_roles" ON public.internal_user_roles
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::user_role_type)
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin'])
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::user_role_type)
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin'])
  );

DROP POLICY IF EXISTS "staff read overrides" ON public.user_permission_overrides;
CREATE POLICY "staff read overrides" ON public.user_permission_overrides
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::user_role_type)
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin','auditor'])
  );

DROP POLICY IF EXISTS "super_admin manage overrides" ON public.user_permission_overrides;
CREATE POLICY "super_admin manage overrides" ON public.user_permission_overrides
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::user_role_type)
    OR public.has_internal_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::user_role_type)
    OR public.has_internal_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "staff read change_requests" ON public.access_change_requests;
CREATE POLICY "staff read change_requests" ON public.access_change_requests
  FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::user_role_type)
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin','finance_approver','auditor'])
  );

DROP POLICY IF EXISTS "staff insert change_requests" ON public.access_change_requests;
CREATE POLICY "staff insert change_requests" ON public.access_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::user_role_type)
      OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin'])
    )
  );

DROP POLICY IF EXISTS "reviewers update change_requests" ON public.access_change_requests;
CREATE POLICY "reviewers update change_requests" ON public.access_change_requests
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::user_role_type)
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','finance_approver'])
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::user_role_type)
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','finance_approver'])
  );

-- Backfill: insert internal_users rows for every existing admin so the console has data
INSERT INTO public.internal_users (id, display_id, full_name, email, department, status, two_factor_enabled)
SELECT
  p.id,
  'ADM-' || lpad((row_number() OVER (ORDER BY p.created_at))::text, 3, '0'),
  COALESCE(p.full_name, split_part(u.email, '@', 1), 'Admin'),
  u.email,
  'Platform',
  'active',
  false
FROM public.user_roles ur
JOIN public.profiles p ON p.id = ur.user_id
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'admin'::user_role_type
ON CONFLICT (id) DO NOTHING;

-- Backfill: give each of them the senior_admin internal role (primary), and super_admin if none exists
INSERT INTO public.internal_user_roles (user_id, role_key, is_primary)
SELECT iu.id, 'senior_admin', true
FROM public.internal_users iu
WHERE NOT EXISTS (SELECT 1 FROM public.internal_user_roles WHERE user_id = iu.id)
ON CONFLICT DO NOTHING;

-- Promote the earliest admin to super_admin (only if no super_admin exists yet)
DO $$
DECLARE
  first_admin uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.internal_user_roles WHERE role_key = 'super_admin') THEN
    SELECT iu.id INTO first_admin
    FROM public.internal_users iu
    ORDER BY iu.created_at ASC
    LIMIT 1;

    IF first_admin IS NOT NULL THEN
      DELETE FROM public.internal_user_roles WHERE user_id = first_admin;
      INSERT INTO public.internal_user_roles (user_id, role_key, is_primary)
      VALUES (first_admin, 'super_admin', true);
    END IF;
  END IF;
END $$;
