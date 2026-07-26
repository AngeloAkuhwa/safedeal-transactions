
-- Add status + is_system to permission_templates; seed 10 system templates.
ALTER TABLE public.permission_templates
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- Prevent delete/archive of system templates.
CREATE OR REPLACE FUNCTION public.protect_system_templates()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system THEN
    RAISE EXCEPTION 'System templates cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system AND NEW.status = 'archived' THEN
    RAISE EXCEPTION 'System templates cannot be archived';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_protect_system_templates ON public.permission_templates;
CREATE TRIGGER trg_protect_system_templates
  BEFORE UPDATE OR DELETE ON public.permission_templates
  FOR EACH ROW EXECUTE FUNCTION public.protect_system_templates();

-- Seed 10 system templates. Idempotent via ON CONFLICT on unique name.
CREATE UNIQUE INDEX IF NOT EXISTS uq_permission_templates_name_system
  ON public.permission_templates(name) WHERE is_system;

-- Helper: seed a template mirroring an internal role's grants at production.
DO $$
DECLARE
  t RECORD;
  tpl_id uuid;
  role_key text;
  tpl_name text;
  tpl_desc text;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('super_admin',       'System Super Administrator',    'Full platform authority across all modules.'),
    ('senior_admin',      'Senior Operations Administration','Broad operational oversight without privileged system controls.'),
    ('dispute_manager',   'Dispute Management',            'Manage dispute queue, assignments and escalations.'),
    ('dispute_agent',     'Dispute Agent',                 'Handle assigned disputes end-to-end.'),
    ('support_agent',     'Customer Support',              'Read and update transactions and disputes for buyer/seller support.'),
    ('identity_officer',  'Identity Verification',         'Review, approve and reject identity submissions.'),
    ('finance_operator',  'Finance Operations',            'Initiate financial actions (payouts, refunds) without approval rights.'),
    ('finance_approver',  'Finance Approval',              'Approve or reject financial actions initiated by others.'),
    ('compliance_officer','Compliance Review',             'Compliance, audit and investigation read + export.'),
    ('auditor',           'Read-Only Audit',               'Read-only access to logs, transactions and disputes.')
  ) AS x(role_key, tpl_name, tpl_desc)
  LOOP
    -- Skip if template already exists.
    IF EXISTS (SELECT 1 FROM public.permission_templates WHERE name = t.tpl_name AND is_system) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.permission_templates(name, description, role_source, is_system, status)
    VALUES (t.tpl_name, t.tpl_desc, t.role_key, true, 'active')
    RETURNING id INTO tpl_id;

    -- Seed items from role_permissions production grants for that role.
    INSERT INTO public.permission_template_items(template_id, permission_key)
    SELECT tpl_id, rp.permission_key
    FROM public.role_permissions rp
    WHERE rp.role_key = t.role_key AND rp.environment = 'production';
  END LOOP;
END $$;

-- Index for expiring-soon override queries.
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_expires_at
  ON public.user_permission_overrides(expires_at) WHERE expires_at IS NOT NULL;
