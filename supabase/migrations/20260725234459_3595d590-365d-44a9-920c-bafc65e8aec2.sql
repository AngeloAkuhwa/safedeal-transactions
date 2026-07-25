
-- Support Agent role: extend permission catalogue with granular actions and
-- rewrite role_permissions rows to match the new authorization spec.

-- 1. New actions in the catalogue
INSERT INTO public.permissions (key, module, action, label, sort_order) VALUES
  ('disputes.view_assigned',         'disputes', 'view_assigned',        'Disputes — View Assigned',        40),
  ('disputes.add_internal_note',     'disputes', 'add_internal_note',    'Disputes — Add Internal Note',    40),
  ('disputes.request_information',   'disputes', 'request_information',  'Disputes — Request Information',  40),
  ('disputes.request_evidence',      'disputes', 'request_evidence',     'Disputes — Request Evidence',     40),
  ('disputes.update_status',         'disputes', 'update_status',        'Disputes — Update Status',        40),
  ('disputes.resolve_assigned',      'disputes', 'resolve_assigned',     'Disputes — Resolve Assigned',     40),
  ('disputes.resolve_all',           'disputes', 'resolve_all',          'Disputes — Resolve Any',          40),
  ('flagged_users.remove_flag',      'flagged_users', 'remove_flag',     'Flagged Users — Remove Flag',     80)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order;

-- 2. Grant every newly created permission to super_admin so nothing regresses.
INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'super_admin', key FROM public.permissions
WHERE key IN (
  'disputes.view_assigned','disputes.add_internal_note','disputes.request_information',
  'disputes.request_evidence','disputes.update_status','disputes.resolve_assigned',
  'disputes.resolve_all','flagged_users.remove_flag'
)
ON CONFLICT DO NOTHING;

-- 3. Extend senior_admin, dispute_manager, dispute_agent to include the new keys.
INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('senior_admin','disputes.view_assigned'),
  ('senior_admin','disputes.add_internal_note'),
  ('senior_admin','disputes.request_information'),
  ('senior_admin','disputes.request_evidence'),
  ('senior_admin','disputes.update_status'),
  ('senior_admin','disputes.resolve_assigned'),
  ('senior_admin','disputes.resolve_all'),
  ('senior_admin','flagged_users.remove_flag'),
  ('dispute_manager','disputes.view_assigned'),
  ('dispute_manager','disputes.add_internal_note'),
  ('dispute_manager','disputes.request_information'),
  ('dispute_manager','disputes.request_evidence'),
  ('dispute_manager','disputes.update_status'),
  ('dispute_manager','disputes.resolve_assigned'),
  ('dispute_manager','disputes.resolve_all'),
  ('dispute_agent','disputes.view_assigned'),
  ('dispute_agent','disputes.add_internal_note'),
  ('dispute_agent','disputes.request_information'),
  ('dispute_agent','disputes.request_evidence'),
  ('dispute_agent','disputes.update_status'),
  ('dispute_agent','disputes.resolve_assigned')
ON CONFLICT DO NOTHING;

-- 4. Rewrite support_agent grants: drop identity_verification.view (out of scope
--    for support), keep it strictly to dashboard/transactions/disputes/flagged
--    plus the new granular dispute actions listed in the spec.
DELETE FROM public.role_permissions WHERE role_key = 'support_agent';
INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('support_agent','dashboard.view'),
  ('support_agent','transactions.view'),
  ('support_agent','disputes.view'),
  ('support_agent','disputes.view_assigned'),
  ('support_agent','disputes.add_internal_note'),
  ('support_agent','disputes.request_information'),
  ('support_agent','disputes.request_evidence'),
  ('support_agent','disputes.update_status'),
  ('support_agent','disputes.resolve_assigned'),
  ('support_agent','disputes.escalate'),
  ('support_agent','flagged_users.view');
