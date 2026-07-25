
-- ============================================================================
-- Internal role & permission foundation
-- ============================================================================

-- 1. Reference tables ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.internal_roles (
  key         text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL,
  protected   boolean NOT NULL DEFAULT false,
  is_system   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.internal_roles TO authenticated;
GRANT ALL ON public.internal_roles TO service_role;
ALTER TABLE public.internal_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.permissions (
  key         text PRIMARY KEY,
  module      text NOT NULL,
  action      text NOT NULL,
  label       text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_key       text NOT NULL REFERENCES public.internal_roles(key) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- 2. Internal users -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.internal_users (
  id                    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_id            text UNIQUE NOT NULL,
  full_name             text NOT NULL,
  email                 text NOT NULL,
  department            text,
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','suspended','pending','invited')),
  two_factor_enabled    boolean NOT NULL DEFAULT false,
  last_active_at        timestamptz,
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_users TO authenticated;
GRANT ALL ON public.internal_users TO service_role;
ALTER TABLE public.internal_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.internal_user_roles (
  user_id     uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  role_key    text NOT NULL REFERENCES public.internal_roles(key),
  is_primary  boolean NOT NULL DEFAULT false,
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS internal_user_roles_one_primary
  ON public.internal_user_roles(user_id) WHERE is_primary;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_user_roles TO authenticated;
GRANT ALL ON public.internal_user_roles TO service_role;
ALTER TABLE public.internal_user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  user_id        uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  mode           text NOT NULL CHECK (mode IN ('grant','revoke')),
  reason         text NOT NULL,
  granted_by     uuid REFERENCES auth.users(id),
  granted_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;
GRANT ALL ON public.user_permission_overrides TO service_role;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.access_change_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id  uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE CASCADE,
  requested_by    uuid NOT NULL REFERENCES auth.users(id),
  change_type     text NOT NULL CHECK (change_type IN ('role','permission','suspend','reactivate')),
  payload         jsonb NOT NULL,
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by     uuid REFERENCES auth.users(id),
  reviewed_at     timestamptz,
  review_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_change_requests_status_idx
  ON public.access_change_requests(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_change_requests TO authenticated;
GRANT ALL ON public.access_change_requests TO service_role;
ALTER TABLE public.access_change_requests ENABLE ROW LEVEL SECURITY;

-- 3. Helper: internal-role check ---------------------------------------------

CREATE OR REPLACE FUNCTION public.has_internal_role(_user_id uuid, _role_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.internal_user_roles
    WHERE user_id = _user_id AND role_key = _role_key
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_internal_role(_user_id uuid, _role_keys text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.internal_user_roles
    WHERE user_id = _user_id AND role_key = ANY(_role_keys)
  );
$$;

-- 4. Effective permissions & derived access level ----------------------------

CREATE OR REPLACE FUNCTION public.internal_effective_permissions(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
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
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.internal_effective_access_level(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  perms text[];
BEGIN
  IF public.has_internal_role(_user_id, 'super_admin') THEN
    RETURN 'full';
  END IF;

  perms := public.internal_effective_permissions(_user_id);

  IF perms && ARRAY[
    'permissions.manage_permissions',
    'financial_controls.approve',
    'financial_controls.configure',
    'platform_configuration.configure',
    'users_and_access.suspend',
    'users_and_access.manage_permissions',
    'compliance.approve',
    'compliance.configure'
  ] THEN
    RETURN 'high';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(perms) p
    WHERE p ~ '\.(create|update|assign|reassign|resolve|escalate|approve|reject)$'
  ) THEN
    RETURN 'standard';
  END IF;

  RETURN 'limited';
END;
$$;

-- 5. Guardrail triggers ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_internal_role_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  other_roles text[];
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT COALESCE(array_agg(role_key), ARRAY[]::text[])
      INTO other_roles
      FROM public.internal_user_roles
      WHERE user_id = NEW.user_id AND role_key <> NEW.role_key;

    -- super_admin must be exclusive
    IF NEW.role_key = 'super_admin' AND array_length(other_roles,1) > 0 THEN
      RAISE EXCEPTION 'super_admin cannot be combined with other roles';
    END IF;
    IF 'super_admin' = ANY(other_roles) THEN
      RAISE EXCEPTION 'user already has super_admin, cannot add another role';
    END IF;

    -- segregation of duties: finance_operator + finance_approver
    IF NEW.role_key = 'finance_operator' AND 'finance_approver' = ANY(other_roles) THEN
      RAISE EXCEPTION 'finance_operator cannot be combined with finance_approver';
    END IF;
    IF NEW.role_key = 'finance_approver' AND 'finance_operator' = ANY(other_roles) THEN
      RAISE EXCEPTION 'finance_approver cannot be combined with finance_operator';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_user_roles_guardrail ON public.internal_user_roles;
CREATE TRIGGER internal_user_roles_guardrail
  BEFORE INSERT OR UPDATE ON public.internal_user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_internal_role_rules();

-- updated_at trigger for internal_users
DROP TRIGGER IF EXISTS internal_users_updated_at ON public.internal_users;
CREATE TRIGGER internal_users_updated_at
  BEFORE UPDATE ON public.internal_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. RLS policies ------------------------------------------------------------

-- Everyone signed in can read the catalogue (roles + permissions + mapping)
DROP POLICY IF EXISTS "auth read internal_roles" ON public.internal_roles;
CREATE POLICY "auth read internal_roles" ON public.internal_roles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth read permissions" ON public.permissions;
CREATE POLICY "auth read permissions" ON public.permissions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth read role_permissions" ON public.role_permissions;
CREATE POLICY "auth read role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

-- Only super_admin can mutate catalogue
DROP POLICY IF EXISTS "super_admin manage role_permissions" ON public.role_permissions;
CREATE POLICY "super_admin manage role_permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_internal_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_internal_role(auth.uid(), 'super_admin'));

-- internal_users: staff (super_admin or senior_admin) can read; self-read allowed
DROP POLICY IF EXISTS "staff read internal_users" ON public.internal_users;
CREATE POLICY "staff read internal_users" ON public.internal_users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin','auditor'])
  );
DROP POLICY IF EXISTS "staff manage internal_users" ON public.internal_users;
CREATE POLICY "staff manage internal_users" ON public.internal_users
  FOR ALL TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin']))
  WITH CHECK (public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin']));

DROP POLICY IF EXISTS "staff read user_roles" ON public.internal_user_roles;
CREATE POLICY "staff read user_roles" ON public.internal_user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin','auditor'])
  );
DROP POLICY IF EXISTS "staff manage user_roles" ON public.internal_user_roles;
CREATE POLICY "staff manage user_roles" ON public.internal_user_roles
  FOR ALL TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin']))
  WITH CHECK (public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin']));

DROP POLICY IF EXISTS "staff read overrides" ON public.user_permission_overrides;
CREATE POLICY "staff read overrides" ON public.user_permission_overrides
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin','auditor'])
  );
DROP POLICY IF EXISTS "super_admin manage overrides" ON public.user_permission_overrides;
CREATE POLICY "super_admin manage overrides" ON public.user_permission_overrides
  FOR ALL TO authenticated
  USING (public.has_internal_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_internal_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "staff read change_requests" ON public.access_change_requests;
CREATE POLICY "staff read change_requests" ON public.access_change_requests
  FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin','finance_approver','auditor'])
  );
DROP POLICY IF EXISTS "staff insert change_requests" ON public.access_change_requests;
CREATE POLICY "staff insert change_requests" ON public.access_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin'])
  );
DROP POLICY IF EXISTS "reviewers update change_requests" ON public.access_change_requests;
CREATE POLICY "reviewers update change_requests" ON public.access_change_requests
  FOR UPDATE TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY['super_admin','finance_approver']))
  WITH CHECK (public.has_any_internal_role(auth.uid(), ARRAY['super_admin','finance_approver']));

-- 7. Seed roles --------------------------------------------------------------

INSERT INTO public.internal_roles (key, name, description, protected, sort_order) VALUES
  ('super_admin',        'Super Admin',        'Complete platform access. Manages internal users, roles, permissions, configuration and audit logs. Approves privileged access changes.', true,  10),
  ('senior_admin',       'Senior Admin',       'Manages day-to-day operations, agents and support users. Reviews disputes, identity cases and audit logs. Cannot modify Super Admins or the permission catalogue.', true,  20),
  ('dispute_manager',    'Dispute Manager',    'Manages disputes across the platform: assigns cases, escalates, and reviews agent resolutions.', false, 30),
  ('dispute_agent',      'Dispute Agent',      'Works assigned dispute cases: adds notes, requests evidence and updates case stages.', false, 40),
  ('support_agent',      'Support Agent',      'Handles customer support cases with permitted transaction and dispute visibility. Cannot release funds or approve refunds.', false, 50),
  ('identity_officer',   'Identity Verification Officer', 'Reviews identity submissions and documents. Approves, rejects or escalates identity cases.', false, 60),
  ('finance_operator',   'Finance Operator',   'Prepares and initiates permitted financial operations. Cannot approve their own actions.', false, 70),
  ('finance_approver',   'Finance Approver',   'Reviews and approves or rejects financial operations. Cannot approve actions they initiated.', true,  80),
  ('compliance_officer', 'Compliance Officer', 'Reviews transactions, disputes and identity cases. Applies compliance flags and approves compliance-controlled actions.', false, 90),
  ('auditor',            'Auditor',            'Read-only access to approved platform data, reports and audit logs. Can export only when explicitly enabled.', false, 100)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  protected = EXCLUDED.protected,
  sort_order = EXCLUDED.sort_order;

-- 8. Seed permission catalogue -----------------------------------------------

WITH modules(module, label, sort_order) AS (VALUES
  ('dashboard',              'Dashboard',              10),
  ('transactions',           'Transactions',           20),
  ('escrow',                 'Escrow',                 30),
  ('disputes',               'Disputes',               40),
  ('identity_verification',  'Identity Verification',  50),
  ('task_orchestration',     'Task Orchestration',     60),
  ('agent_performance',      'Agent Performance',      70),
  ('flagged_users',          'Flagged Users',          80),
  ('users_and_access',       'Users & Access',         90),
  ('permissions',            'Permission Management', 100),
  ('financial_controls',     'Financial Controls',    110),
  ('audit_logs',             'Audit Logs',            120),
  ('reports',                'Reports & Exports',     130),
  ('platform_configuration', 'Platform Configuration',140)
),
actions_per_module(module, action) AS (VALUES
  -- Dashboard
  ('dashboard','view'), ('dashboard','export'),
  -- Transactions
  ('transactions','view'), ('transactions','update'), ('transactions','export'), ('transactions','escalate'),
  -- Escrow
  ('escrow','view'), ('escrow','update'), ('escrow','approve'), ('escrow','configure'), ('escrow','export'),
  -- Disputes
  ('disputes','view'), ('disputes','create'), ('disputes','update'), ('disputes','assign'),
  ('disputes','reassign'), ('disputes','resolve'), ('disputes','escalate'), ('disputes','approve'),
  ('disputes','reject'), ('disputes','export'),
  -- Identity
  ('identity_verification','view'), ('identity_verification','approve'), ('identity_verification','reject'),
  ('identity_verification','escalate'), ('identity_verification','export'),
  -- Task orchestration
  ('task_orchestration','view'), ('task_orchestration','assign'), ('task_orchestration','reassign'),
  ('task_orchestration','configure'),
  -- Agent performance
  ('agent_performance','view'), ('agent_performance','export'),
  -- Flagged users
  ('flagged_users','view'), ('flagged_users','update'), ('flagged_users','suspend'), ('flagged_users','export'),
  -- Users & Access
  ('users_and_access','view'), ('users_and_access','create'), ('users_and_access','update'),
  ('users_and_access','suspend'), ('users_and_access','manage_permissions'), ('users_and_access','export'),
  -- Permission Management
  ('permissions','view'), ('permissions','manage_permissions'),
  -- Financial Controls
  ('financial_controls','view'), ('financial_controls','create'), ('financial_controls','approve'),
  ('financial_controls','reject'), ('financial_controls','configure'), ('financial_controls','export'),
  -- Audit Logs
  ('audit_logs','view'), ('audit_logs','export'),
  -- Reports
  ('reports','view'), ('reports','export'), ('reports','configure'),
  -- Platform Configuration
  ('platform_configuration','view'), ('platform_configuration','configure')
),
action_labels(action, label) AS (VALUES
  ('view','View'), ('create','Create'), ('update','Update'), ('assign','Assign'),
  ('reassign','Reassign'), ('approve','Approve'), ('reject','Reject'), ('resolve','Resolve'),
  ('escalate','Escalate'), ('suspend','Suspend'), ('export','Export'), ('configure','Configure'),
  ('manage_permissions','Manage Permissions')
)
INSERT INTO public.permissions (key, module, action, label, sort_order)
SELECT
  apm.module || '.' || apm.action,
  apm.module,
  apm.action,
  m.label || ' — ' || al.label,
  m.sort_order
FROM actions_per_module apm
JOIN modules m ON m.module = apm.module
JOIN action_labels al ON al.action = apm.action
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order;

-- 9. Seed default role → permission mappings ---------------------------------

-- Super Admin: everything
INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'super_admin', key FROM public.permissions
ON CONFLICT DO NOTHING;

-- Senior Admin: everything except permission catalogue mutation, platform_configuration.configure, financial_controls.approve/configure
INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'senior_admin', key FROM public.permissions
WHERE key NOT IN (
  'permissions.manage_permissions',
  'platform_configuration.configure',
  'financial_controls.approve',
  'financial_controls.configure'
)
ON CONFLICT DO NOTHING;

-- Dispute Manager
INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('dispute_manager','dashboard.view'),
  ('dispute_manager','disputes.view'),
  ('dispute_manager','disputes.assign'),
  ('dispute_manager','disputes.reassign'),
  ('dispute_manager','disputes.escalate'),
  ('dispute_manager','disputes.approve'),
  ('dispute_manager','disputes.resolve'),
  ('dispute_manager','disputes.reject'),
  ('dispute_manager','disputes.export'),
  ('dispute_manager','agent_performance.view'),
  ('dispute_manager','task_orchestration.view'),
  ('dispute_manager','task_orchestration.assign'),
  ('dispute_manager','task_orchestration.reassign'),
  ('dispute_manager','transactions.view'),
  ('dispute_manager','audit_logs.view')
ON CONFLICT DO NOTHING;

-- Dispute Agent
INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('dispute_agent','dashboard.view'),
  ('dispute_agent','disputes.view'),
  ('dispute_agent','disputes.update'),
  ('dispute_agent','disputes.resolve'),
  ('dispute_agent','disputes.escalate'),
  ('dispute_agent','transactions.view'),
  ('dispute_agent','task_orchestration.view')
ON CONFLICT DO NOTHING;

-- Support Agent
INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('support_agent','dashboard.view'),
  ('support_agent','transactions.view'),
  ('support_agent','disputes.view'),
  ('support_agent','disputes.escalate'),
  ('support_agent','flagged_users.view'),
  ('support_agent','identity_verification.view')
ON CONFLICT DO NOTHING;

-- Identity Officer
INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('identity_officer','dashboard.view'),
  ('identity_officer','identity_verification.view'),
  ('identity_officer','identity_verification.approve'),
  ('identity_officer','identity_verification.reject'),
  ('identity_officer','identity_verification.escalate'),
  ('identity_officer','identity_verification.export'),
  ('identity_officer','audit_logs.view')
ON CONFLICT DO NOTHING;

-- Finance Operator
INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('finance_operator','dashboard.view'),
  ('finance_operator','transactions.view'),
  ('finance_operator','escrow.view'),
  ('finance_operator','escrow.update'),
  ('finance_operator','financial_controls.view'),
  ('finance_operator','financial_controls.create'),
  ('finance_operator','reports.view')
ON CONFLICT DO NOTHING;

-- Finance Approver
INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('finance_approver','dashboard.view'),
  ('finance_approver','transactions.view'),
  ('finance_approver','escrow.view'),
  ('finance_approver','escrow.approve'),
  ('finance_approver','financial_controls.view'),
  ('finance_approver','financial_controls.approve'),
  ('finance_approver','financial_controls.reject'),
  ('finance_approver','financial_controls.export'),
  ('finance_approver','reports.view'),
  ('finance_approver','reports.export'),
  ('finance_approver','audit_logs.view')
ON CONFLICT DO NOTHING;

-- Compliance Officer
INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('compliance_officer','dashboard.view'),
  ('compliance_officer','transactions.view'),
  ('compliance_officer','disputes.view'),
  ('compliance_officer','identity_verification.view'),
  ('compliance_officer','flagged_users.view'),
  ('compliance_officer','flagged_users.update'),
  ('compliance_officer','flagged_users.suspend'),
  ('compliance_officer','audit_logs.view'),
  ('compliance_officer','audit_logs.export'),
  ('compliance_officer','reports.view'),
  ('compliance_officer','reports.export')
ON CONFLICT DO NOTHING;

-- Auditor (read-only)
INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'auditor', key FROM public.permissions
WHERE action = 'view'
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('auditor','audit_logs.export'),
  ('auditor','reports.export')
ON CONFLICT DO NOTHING;
