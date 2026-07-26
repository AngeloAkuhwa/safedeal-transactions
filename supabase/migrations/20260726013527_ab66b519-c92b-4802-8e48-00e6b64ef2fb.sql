CREATE TABLE IF NOT EXISTS public.permission_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL,
  requires_key text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permission_key, requires_key),
  CHECK (permission_key <> requires_key)
);

GRANT SELECT ON public.permission_dependencies TO authenticated;
GRANT ALL ON public.permission_dependencies TO service_role;

ALTER TABLE public.permission_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can read permission dependencies"
  ON public.permission_dependencies
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.internal_users iu WHERE iu.id = auth.uid()));

INSERT INTO public.permission_dependencies (permission_key, requires_key, note) VALUES
  ('payouts.approve', 'payouts.view', 'Approving payouts requires viewing them'),
  ('payouts.create', 'payouts.view', 'Initiating payouts requires viewing them'),
  ('payouts.reject', 'payouts.view', 'Rejecting payouts requires viewing them'),
  ('refunds.approve', 'refunds.view', 'Approving refunds requires viewing them'),
  ('refunds.create', 'refunds.view', 'Initiating refunds requires viewing them'),
  ('refunds.reject', 'refunds.view', 'Rejecting refunds requires viewing them'),
  ('escrow.approve', 'escrow.view', 'Approving escrow actions requires viewing escrow'),
  ('escrow.update', 'escrow.view', 'Editing escrow requires viewing escrow'),
  ('disputes.resolve', 'disputes.view', 'Resolving disputes requires viewing them'),
  ('disputes.assign', 'disputes.view', 'Assigning disputes requires viewing them'),
  ('disputes.escalate', 'disputes.view', 'Escalating disputes requires viewing them'),
  ('users.suspend', 'users.view', 'Suspending users requires viewing them'),
  ('users.reactivate', 'users.view', 'Reactivating users requires viewing them'),
  ('users_and_access.suspend', 'users_and_access.view', 'Suspending internal users requires viewing them'),
  ('users_and_access.reactivate', 'users_and_access.view', 'Reactivating internal users requires viewing them'),
  ('users_and_access.manage_permissions', 'users_and_access.view', 'Managing permissions requires viewing users'),
  ('permissions.manage_permissions', 'permissions.view', 'Managing permissions requires viewing them'),
  ('financial_controls.approve', 'financial_controls.view', 'Approving financial controls requires viewing them'),
  ('financial_controls.configure', 'financial_controls.view', 'Configuring financial controls requires viewing them'),
  ('platform_configuration.configure', 'platform_configuration.view', 'Configuring platform requires viewing config'),
  ('investigations.update', 'investigations.view', 'Updating investigations requires viewing them'),
  ('investigations.resolve', 'investigations.view', 'Resolving investigations requires viewing them'),
  ('identity_verification.approve', 'identity_verification.view', 'Approving identities requires viewing them'),
  ('identity_verification.reject', 'identity_verification.view', 'Rejecting identities requires viewing them'),
  ('flagged_users.remove_flag', 'flagged_users.view', 'Removing flags requires viewing flagged users'),
  ('flagged_users.suspend', 'flagged_users.view', 'Suspending flagged users requires viewing them')
ON CONFLICT (permission_key, requires_key) DO NOTHING;
