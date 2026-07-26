
CREATE OR REPLACE FUNCTION public.ensure_agent_presence_rows()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.id IS NOT NULL THEN
    INSERT INTO public.agent_capacity (user_id, max_active_tasks, current_active, overdue_count, avg_first_action_seconds, resolved_today, tasks_today)
    VALUES (NEW.id, 5, 0, 0, 0, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.agent_availability (user_id, status, last_heartbeat)
    VALUES (NEW.id, 'offline', now())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_internal_users_ensure_presence ON public.internal_users;
CREATE TRIGGER trg_internal_users_ensure_presence
AFTER INSERT OR UPDATE OF status ON public.internal_users
FOR EACH ROW
EXECUTE FUNCTION public.ensure_agent_presence_rows();

INSERT INTO public.agent_capacity (user_id, max_active_tasks, current_active, overdue_count, avg_first_action_seconds, resolved_today, tasks_today)
SELECT id, 5, 0, 0, 0, 0, 0
FROM public.internal_users
WHERE status = 'active' AND id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.agent_availability (user_id, status, last_heartbeat)
SELECT id, 'offline', now()
FROM public.internal_users
WHERE status = 'active' AND id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.recompute_agent_capacity(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active int;
  _overdue int;
  _resolved_today int;
  _tasks_today int;
  _avg_first int;
BEGIN
  SELECT
    count(*) FILTER (WHERE status IN ('assigned','in_progress','waiting_on_buyer','waiting_on_seller','waiting_on_evidence','pending_approval','escalated')),
    count(*) FILTER (WHERE sla_status IN ('overdue','breached') AND status NOT IN ('resolved','closed','cancelled')),
    count(*) FILTER (WHERE status IN ('resolved','closed') AND resolved_at >= date_trunc('day', now())),
    count(*) FILTER (WHERE assigned_at >= date_trunc('day', now())),
    COALESCE(avg(EXTRACT(EPOCH FROM (first_action_at - created_at)))::int, 0)
  INTO _active, _overdue, _resolved_today, _tasks_today, _avg_first
  FROM public.orchestration_tasks
  WHERE assigned_agent_id = _user_id;

  INSERT INTO public.agent_capacity (user_id, max_active_tasks, current_active, overdue_count, avg_first_action_seconds, resolved_today, tasks_today, updated_at)
  VALUES (_user_id, 5, COALESCE(_active,0), COALESCE(_overdue,0), COALESCE(_avg_first,0), COALESCE(_resolved_today,0), COALESCE(_tasks_today,0), now())
  ON CONFLICT (user_id) DO UPDATE
  SET current_active = EXCLUDED.current_active,
      overdue_count = EXCLUDED.overdue_count,
      avg_first_action_seconds = EXCLUDED.avg_first_action_seconds,
      resolved_today = EXCLUDED.resolved_today,
      tasks_today = EXCLUDED.tasks_today,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.orchestration_tasks_refresh_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.assigned_agent_id IS NOT NULL THEN
      PERFORM public.recompute_agent_capacity(OLD.assigned_agent_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.assigned_agent_id IS NOT NULL THEN
    PERFORM public.recompute_agent_capacity(NEW.assigned_agent_id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.assigned_agent_id IS DISTINCT FROM NEW.assigned_agent_id AND OLD.assigned_agent_id IS NOT NULL THEN
    PERFORM public.recompute_agent_capacity(OLD.assigned_agent_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orchestration_tasks_refresh_capacity ON public.orchestration_tasks;
CREATE TRIGGER trg_orchestration_tasks_refresh_capacity
AFTER INSERT OR UPDATE OR DELETE ON public.orchestration_tasks
FOR EACH ROW
EXECUTE FUNCTION public.orchestration_tasks_refresh_capacity();

DO $$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT id FROM public.internal_users WHERE status='active' AND id IS NOT NULL
  LOOP
    PERFORM public.recompute_agent_capacity(u);
  END LOOP;
END $$;

INSERT INTO public.role_permissions (role_key, permission_key, environment)
SELECT r.role_key, r.perm_key, 'production'
FROM (VALUES
  ('super_admin', 'task_orchestration.view'),
  ('super_admin', 'task_orchestration.view_all'),
  ('super_admin', 'task_orchestration.assign'),
  ('super_admin', 'task_orchestration.assign_self'),
  ('super_admin', 'task_orchestration.bulk_assign'),
  ('super_admin', 'task_orchestration.reassign'),
  ('super_admin', 'task_orchestration.rebalance'),
  ('super_admin', 'task_orchestration.escalate'),
  ('super_admin', 'task_orchestration.manage_rules'),
  ('super_admin', 'task_orchestration.export'),
  ('super_admin', 'task_orchestration.view_agent_load'),
  ('super_admin', 'task_orchestration.override_capacity'),
  ('super_admin', 'task_orchestration.view_history'),
  ('senior_admin', 'task_orchestration.view'),
  ('senior_admin', 'task_orchestration.view_all'),
  ('senior_admin', 'task_orchestration.assign'),
  ('senior_admin', 'task_orchestration.bulk_assign'),
  ('senior_admin', 'task_orchestration.reassign'),
  ('senior_admin', 'task_orchestration.rebalance'),
  ('senior_admin', 'task_orchestration.escalate'),
  ('senior_admin', 'task_orchestration.export'),
  ('senior_admin', 'task_orchestration.view_agent_load'),
  ('senior_admin', 'task_orchestration.view_history'),
  ('dispute_manager', 'task_orchestration.view'),
  ('dispute_manager', 'task_orchestration.view_all'),
  ('dispute_manager', 'task_orchestration.assign'),
  ('dispute_manager', 'task_orchestration.reassign'),
  ('dispute_manager', 'task_orchestration.rebalance'),
  ('dispute_manager', 'task_orchestration.escalate'),
  ('dispute_manager', 'task_orchestration.view_agent_load'),
  ('dispute_manager', 'task_orchestration.view_history'),
  ('dispute_agent', 'task_orchestration.view'),
  ('dispute_agent', 'task_orchestration.view_assigned'),
  ('dispute_agent', 'task_orchestration.assign_self'),
  ('dispute_agent', 'task_orchestration.escalate'),
  ('support_agent', 'task_orchestration.view'),
  ('support_agent', 'task_orchestration.view_assigned'),
  ('support_agent', 'task_orchestration.assign_self'),
  ('support_agent', 'task_orchestration.escalate'),
  ('finance_operator', 'task_orchestration.view'),
  ('finance_operator', 'task_orchestration.view_assigned'),
  ('finance_operator', 'task_orchestration.assign_self'),
  ('finance_approver', 'task_orchestration.view'),
  ('finance_approver', 'task_orchestration.view_assigned'),
  ('finance_approver', 'task_orchestration.assign_self'),
  ('compliance_officer', 'task_orchestration.view'),
  ('compliance_officer', 'task_orchestration.view_all'),
  ('compliance_officer', 'task_orchestration.escalate'),
  ('compliance_officer', 'task_orchestration.view_history'),
  ('auditor', 'task_orchestration.view'),
  ('auditor', 'task_orchestration.view_all'),
  ('auditor', 'task_orchestration.view_history'),
  ('auditor', 'task_orchestration.view_agent_load')
) AS r(role_key, perm_key)
WHERE EXISTS (SELECT 1 FROM public.internal_roles ir WHERE ir.key = r.role_key)
  AND EXISTS (SELECT 1 FROM public.permissions p WHERE p.key = r.perm_key)
ON CONFLICT (role_key, permission_key, environment) DO NOTHING;
