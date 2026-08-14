-- Support inbox: reply tracking + fine-grained permissions.
ALTER TABLE public.contact_messages
  ADD COLUMN IF NOT EXISTS admin_reply text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_channel text;

CREATE INDEX IF NOT EXISTS idx_contact_messages_status_created
  ON public.contact_messages (status, created_at DESC);

GRANT SELECT, UPDATE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;

INSERT INTO public.permissions (key, module, action, label, description, risk_level, sort_order, status, assignable)
VALUES
  ('support.view', 'support', 'view', 'View support inbox', 'Read buyer and seller support messages submitted from the public contact form.', 'low', 10, 'active', true),
  ('support.update', 'support', 'update', 'Handle support messages', 'Claim, reply to, and resolve support messages.', 'medium', 20, 'active', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission_key, environment)
SELECT r.role_key, r.permission_key, 'production'
FROM (VALUES
  ('super_admin','support.view'),('super_admin','support.update'),
  ('senior_admin','support.view'),('senior_admin','support.update'),
  ('support_agent','support.view'),('support_agent','support.update'),
  ('dispute_manager','support.view'),('dispute_manager','support.update'),
  ('dispute_agent','support.view'),
  ('compliance_officer','support.view'),
  ('auditor','support.view')
) AS r(role_key, permission_key)
ON CONFLICT DO NOTHING;