
ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS is_system_default BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.user_permission_overrides
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

-- Helper: any internal role, wraps existing array-signature helper
CREATE OR REPLACE FUNCTION public.is_internal_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.internal_user_roles WHERE user_id = _user_id)
$$;

CREATE TABLE IF NOT EXISTS public.permission_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  role_source TEXT REFERENCES public.internal_roles(key) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permission_templates TO authenticated;
GRANT ALL ON public.permission_templates TO service_role;
ALTER TABLE public.permission_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perm templates readable to internal viewers" ON public.permission_templates
  FOR SELECT TO authenticated USING (public.is_internal_admin(auth.uid()));
CREATE POLICY "perm templates writable by managers" ON public.permission_templates
  FOR ALL TO authenticated
  USING (public.has_internal_role(auth.uid(),'super_admin') OR public.has_internal_role(auth.uid(),'senior_admin'))
  WITH CHECK (public.has_internal_role(auth.uid(),'super_admin') OR public.has_internal_role(auth.uid(),'senior_admin'));

CREATE TABLE IF NOT EXISTS public.permission_template_items (
  template_id UUID NOT NULL REFERENCES public.permission_templates(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (template_id, permission_key)
);
GRANT SELECT ON public.permission_template_items TO authenticated;
GRANT ALL ON public.permission_template_items TO service_role;
ALTER TABLE public.permission_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "template items readable" ON public.permission_template_items
  FOR SELECT TO authenticated USING (public.is_internal_admin(auth.uid()));
CREATE POLICY "template items writable by managers" ON public.permission_template_items
  FOR ALL TO authenticated
  USING (public.has_internal_role(auth.uid(),'super_admin') OR public.has_internal_role(auth.uid(),'senior_admin'))
  WITH CHECK (public.has_internal_role(auth.uid(),'super_admin') OR public.has_internal_role(auth.uid(),'senior_admin'));

CREATE TABLE IF NOT EXISTS public.permission_change_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_scope TEXT NOT NULL CHECK (target_scope IN ('role','user','template')),
  target_key TEXT NOT NULL,
  before JSONB NOT NULL DEFAULT '{}'::jsonb,
  after JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','applied','cancelled')),
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_permission_change_sets_status ON public.permission_change_sets(status, created_at DESC);
GRANT SELECT ON public.permission_change_sets TO authenticated;
GRANT ALL ON public.permission_change_sets TO service_role;
ALTER TABLE public.permission_change_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "change sets readable" ON public.permission_change_sets
  FOR SELECT TO authenticated USING (public.is_internal_admin(auth.uid()));
CREATE POLICY "change sets insertable by managers" ON public.permission_change_sets
  FOR INSERT TO authenticated
  WITH CHECK (public.has_internal_role(auth.uid(),'super_admin') OR public.has_internal_role(auth.uid(),'senior_admin'));
CREATE POLICY "change sets updatable by super admin" ON public.permission_change_sets
  FOR UPDATE TO authenticated
  USING (public.has_internal_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_internal_role(auth.uid(),'super_admin'));

INSERT INTO public.permissions (key, module, action, label, risk_level, is_system_default) VALUES
  ('analytics.view','analytics','view','Analytics — View','low',true),
  ('analytics.export','analytics','export','Analytics — Export','high',true),
  ('analytics.configure','analytics','configure','Analytics — Configure','high',true),
  ('payments.view','payments','view','Payments — View','low',true),
  ('payments.update','payments','update','Payments — Update','medium',true),
  ('payments.export','payments','export','Payments — Export','high',true),
  ('payouts.view','payouts','view','Payouts — View','low',true),
  ('payouts.create','payouts','create','Payouts — Initiate','critical',true),
  ('payouts.approve','payouts','approve','Payouts — Approve','critical',true),
  ('payouts.reject','payouts','reject','Payouts — Reject','high',true),
  ('payouts.export','payouts','export','Payouts — Export','high',true),
  ('refunds.view','refunds','view','Refunds — View','low',true),
  ('refunds.create','refunds','create','Refunds — Initiate','high',true),
  ('refunds.approve','refunds','approve','Refunds — Approve','critical',true),
  ('refunds.reject','refunds','reject','Refunds — Reject','high',true),
  ('refunds.export','refunds','export','Refunds — Export','high',true),
  ('money_tracing.view','money_tracing','view','Money Tracing — View','high',true),
  ('money_tracing.export','money_tracing','export','Money Tracing — Export','high',true),
  ('users.view','users','view','Users — View','low',true),
  ('users.update','users','update','Users — Update','medium',true),
  ('users.suspend','users','suspend','Users — Suspend','high',true),
  ('users.reactivate','users','reactivate','Users — Reactivate','medium',true),
  ('users.export','users','export','Users — Export','high',true),
  ('investigations.view','investigations','view','Investigations — View','low',true),
  ('investigations.create','investigations','create','Investigations — Create','medium',true),
  ('investigations.update','investigations','update','Investigations — Update','medium',true),
  ('investigations.assign','investigations','assign','Investigations — Assign','medium',true),
  ('investigations.reassign','investigations','reassign','Investigations — Reassign','medium',true),
  ('investigations.escalate','investigations','escalate','Investigations — Escalate','medium',true),
  ('investigations.resolve','investigations','resolve','Investigations — Resolve','high',true),
  ('investigations.export','investigations','export','Investigations — Export','high',true),
  ('users_and_access.reactivate','users_and_access','reactivate','Users & Access — Reactivate','medium',true)
ON CONFLICT (key) DO NOTHING;

UPDATE public.permissions SET risk_level='critical' WHERE key IN (
  'permissions.manage_permissions','users_and_access.manage_permissions','users_and_access.create',
  'escrow.approve','financial_controls.approve','audit_logs.view','audit_logs.export',
  'platform_configuration.configure'
);
UPDATE public.permissions SET risk_level='high' WHERE key IN (
  'transactions.export','escrow.export','disputes.export','identity_verification.export',
  'agent_performance.export','flagged_users.export','users_and_access.export','reports.export',
  'flagged_users.suspend','users_and_access.suspend','users_and_access.update',
  'financial_controls.reject','financial_controls.configure','financial_controls.create',
  'permissions.view','disputes.resolve_all','escrow.configure',
  'platform_configuration.view','disputes.approve','disputes.reject'
) AND risk_level <> 'critical';
UPDATE public.permissions SET risk_level='medium' WHERE
  action IN ('update','assign','reassign','resolve','escalate','update_status','remove_flag','create')
  AND risk_level NOT IN ('critical','high');

INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'super_admin', p.key FROM public.permissions p
WHERE p.module IN ('analytics','payments','payouts','refunds','money_tracing','users','investigations')
   OR p.key = 'users_and_access.reactivate'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'senior_admin', p.key FROM public.permissions p
WHERE (p.module IN ('analytics','payments','payouts','refunds','money_tracing','users','investigations')
       OR p.key = 'users_and_access.reactivate')
  AND p.key NOT IN ('payouts.approve','payouts.create','refunds.approve')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'auditor', p.key FROM public.permissions p
WHERE p.action IN ('view','export')
  AND p.module IN ('analytics','payments','payouts','refunds','money_tracing','users','investigations')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('compliance_officer','money_tracing.view'),('compliance_officer','money_tracing.export'),
  ('compliance_officer','users.view'),('compliance_officer','users.export'),
  ('compliance_officer','investigations.view'),('compliance_officer','investigations.create'),
  ('compliance_officer','investigations.update'),('compliance_officer','investigations.escalate'),
  ('compliance_officer','analytics.view'),('compliance_officer','payments.view'),
  ('compliance_officer','payouts.view'),('compliance_officer','refunds.view'),
  ('finance_operator','payments.view'),('finance_operator','payments.update'),('finance_operator','payments.export'),
  ('finance_operator','payouts.view'),('finance_operator','payouts.create'),('finance_operator','payouts.export'),
  ('finance_operator','refunds.view'),('finance_operator','refunds.create'),('finance_operator','refunds.export'),
  ('finance_operator','analytics.view'),
  ('finance_approver','payments.view'),('finance_approver','payouts.view'),
  ('finance_approver','payouts.approve'),('finance_approver','payouts.reject'),('finance_approver','payouts.export'),
  ('finance_approver','refunds.view'),('finance_approver','refunds.approve'),
  ('finance_approver','refunds.reject'),('finance_approver','refunds.export'),
  ('finance_approver','analytics.view'),
  ('dispute_manager','investigations.view'),('dispute_manager','investigations.create'),
  ('dispute_manager','investigations.update'),('dispute_manager','investigations.assign'),
  ('dispute_manager','investigations.reassign'),('dispute_manager','investigations.escalate'),
  ('dispute_manager','investigations.resolve'),('dispute_manager','investigations.export'),
  ('dispute_manager','users.view'),
  ('dispute_agent','investigations.view'),('dispute_agent','investigations.update'),
  ('dispute_agent','users.view'),
  ('support_agent','users.view'),('support_agent','investigations.view'),
  ('identity_officer','users.view')
ON CONFLICT DO NOTHING;
