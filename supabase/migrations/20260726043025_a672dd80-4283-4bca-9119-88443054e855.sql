
-- 1. Upsert 14 permission keys
INSERT INTO public.permissions (key, module, action, label, description, sort_order, risk_level, is_system_default, status, approval_required, assignable) VALUES
  ('task_orchestration.view',              'task_orchestration', 'view',              'View Task Orchestration',          'Open the Task Orchestration workspace',                                 100, 'low',      true, 'active', false, true),
  ('task_orchestration.view_all',          'task_orchestration', 'view_all',          'View all tasks',                    'See every task across the platform (not only assigned)',                101, 'medium',   true, 'active', false, true),
  ('task_orchestration.view_assigned',     'task_orchestration', 'view_assigned',     'View assigned tasks',               'See only tasks assigned to the current agent',                          102, 'low',      true, 'active', false, true),
  ('task_orchestration.assign',            'task_orchestration', 'assign',            'Assign tasks',                      'Assign an unassigned task to an agent',                                 110, 'medium',   true, 'active', false, true),
  ('task_orchestration.assign_self',       'task_orchestration', 'assign_self',       'Self-assign',                       'Take an unassigned task for oneself',                                   111, 'low',      true, 'active', false, true),
  ('task_orchestration.bulk_assign',       'task_orchestration', 'bulk_assign',       'Bulk assign',                       'Assign multiple tasks in one operation',                                112, 'medium',   true, 'active', false, true),
  ('task_orchestration.reassign',          'task_orchestration', 'reassign',          'Reassign tasks',                    'Move a task from one agent to another',                                 113, 'medium',   true, 'active', false, true),
  ('task_orchestration.rebalance',         'task_orchestration', 'rebalance',         'Rebalance workload',                'Redistribute active tasks across agents',                               120, 'high',     true, 'active', false, true),
  ('task_orchestration.escalate',          'task_orchestration', 'escalate',          'Escalate tasks',                    'Escalate a task to senior staff',                                       121, 'medium',   true, 'active', false, true),
  ('task_orchestration.manage_rules',      'task_orchestration', 'manage_rules',      'Manage assignment rules',           'Change auto-assignment rules and modes',                                130, 'high',     true, 'active', true,  true),
  ('task_orchestration.export',            'task_orchestration', 'export',            'Export queue',                      'Export the task queue and history',                                     140, 'medium',   true, 'active', false, true),
  ('task_orchestration.view_agent_load',   'task_orchestration', 'view_agent_load',   'View agent load',                   'See agent capacity, overdue and load metrics',                          141, 'low',      true, 'active', false, true),
  ('task_orchestration.override_capacity', 'task_orchestration', 'override_capacity', 'Override capacity',                 'Assign past capacity or bypass eligibility (requires reason)',          150, 'critical', true, 'active', true,  true),
  ('task_orchestration.view_history',      'task_orchestration', 'view_history',      'View task history',                 'Read task assignment and status history',                               151, 'low',      true, 'active', false, true)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module, action = EXCLUDED.action, label = EXCLUDED.label,
    description = EXCLUDED.description, sort_order = EXCLUDED.sort_order,
    risk_level = EXCLUDED.risk_level, approval_required = EXCLUDED.approval_required,
    assignable = EXCLUDED.assignable, updated_at = now();

-- 2. Migrate legacy `configure` → `manage_rules` in every referencing table, then deprecate.
-- role_permissions
INSERT INTO public.role_permissions (role_key, permission_key, environment)
SELECT role_key, 'task_orchestration.manage_rules', environment
FROM public.role_permissions WHERE permission_key = 'task_orchestration.configure'
ON CONFLICT DO NOTHING;
DELETE FROM public.role_permissions WHERE permission_key = 'task_orchestration.configure';

-- permission_template_items
INSERT INTO public.permission_template_items (template_id, permission_key)
SELECT template_id, 'task_orchestration.manage_rules'
FROM public.permission_template_items WHERE permission_key = 'task_orchestration.configure'
ON CONFLICT DO NOTHING;
DELETE FROM public.permission_template_items WHERE permission_key = 'task_orchestration.configure';

-- Mark old key deprecated (trigger blocks hard delete)
UPDATE public.permissions SET status = 'deprecated', assignable = false, updated_at = now()
  WHERE key = 'task_orchestration.configure';

-- 3. Dependencies
INSERT INTO public.permission_dependencies (permission_key, requires_key, note) VALUES
  ('task_orchestration.view_all',          'task_orchestration.view',            'Global visibility implies base access'),
  ('task_orchestration.view_assigned',     'task_orchestration.view',            'Assigned view implies base access'),
  ('task_orchestration.bulk_assign',       'task_orchestration.assign',          'Bulk assign extends single assign'),
  ('task_orchestration.reassign',          'task_orchestration.assign',          'Reassign extends single assign'),
  ('task_orchestration.rebalance',         'task_orchestration.view_agent_load', 'Rebalancing requires load visibility'),
  ('task_orchestration.override_capacity', 'task_orchestration.assign',          'Overrides operate on assignment path'),
  ('task_orchestration.manage_rules',      'task_orchestration.view_all',        'Rule changes affect global queue')
ON CONFLICT DO NOTHING;

-- 4. Role grants
DO $$
DECLARE
  role_grants JSONB := '{
    "super_admin":       ["view","view_all","view_assigned","assign","assign_self","bulk_assign","reassign","rebalance","escalate","manage_rules","export","view_agent_load","override_capacity","view_history"],
    "senior_admin":      ["view","view_all","assign","assign_self","bulk_assign","reassign","rebalance","escalate","view_agent_load","view_history","export","manage_rules"],
    "dispute_manager":   ["view","view_all","assign","assign_self","bulk_assign","reassign","rebalance","escalate","view_agent_load","view_history"],
    "dispute_agent":     ["view","view_assigned","assign_self","escalate","view_history"],
    "support_agent":     ["view","view_assigned","assign_self","escalate","view_history"],
    "finance_operator":  ["view","view_assigned","assign_self","escalate"],
    "finance_approver":  ["view","view_assigned","assign_self","escalate"],
    "compliance_officer":["view","view_all","view_history","escalate","view_agent_load"],
    "auditor":           ["view","view_all","view_history","view_agent_load","export"]
  }'::jsonb;
  rk TEXT;
  perm_arr JSONB;
  pa TEXT;
BEGIN
  FOR rk, perm_arr IN SELECT * FROM jsonb_each(role_grants) LOOP
    FOR pa IN SELECT jsonb_array_elements_text(perm_arr) LOOP
      INSERT INTO public.role_permissions (role_key, permission_key, environment)
      VALUES (rk, 'task_orchestration.' || pa, 'production')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
