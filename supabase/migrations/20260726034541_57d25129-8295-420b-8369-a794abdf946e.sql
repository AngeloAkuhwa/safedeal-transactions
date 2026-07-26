
-- ===== ENUMS =====
DO $$ BEGIN
  CREATE TYPE public.orchestration_task_type AS ENUM (
    'new_dispute_review','buyer_complaint','seller_complaint','payment_hold_review',
    'transaction_review','evidence_review','seller_response_review','buyer_response_review',
    'refund_request','escrow_release_review','flagged_user_review','compliance_escalation',
    'general_investigation'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.orchestration_task_priority AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.orchestration_task_status AS ENUM (
    'unassigned','assigned','in_progress','waiting_on_buyer','waiting_on_seller',
    'waiting_on_evidence','escalated','pending_approval','resolved','closed','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.orchestration_task_stage AS ENUM (
    'initial_review','investigation','evidence_collection','buyer_response','seller_response',
    'evidence_review','resolution_preparation','pending_approval','final_decision','completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.orchestration_sla_status AS ENUM ('on_track','at_risk','overdue','met','breached');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agent_availability_status AS ENUM ('available','active','busy','at_capacity','offline');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== HELPER: updated_at =====
CREATE OR REPLACE FUNCTION public.orch_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ===== TASK CODE SEQUENCE =====
CREATE SEQUENCE IF NOT EXISTS public.orchestration_task_code_seq START 4500;

CREATE OR REPLACE FUNCTION public.orch_generate_task_code()
RETURNS TEXT LANGUAGE sql SET search_path = public AS $$
  SELECT 'TSK-' || lpad(nextval('public.orchestration_task_code_seq')::text, 4, '0');
$$;

-- ===== ORCHESTRATION TASKS =====
CREATE TABLE IF NOT EXISTS public.orchestration_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_code TEXT NOT NULL UNIQUE DEFAULT public.orch_generate_task_code(),
  type public.orchestration_task_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority public.orchestration_task_priority NOT NULL DEFAULT 'medium',
  status public.orchestration_task_status NOT NULL DEFAULT 'unassigned',
  stage public.orchestration_task_stage NOT NULL DEFAULT 'initial_review',
  queue TEXT NOT NULL DEFAULT 'general',
  team TEXT,
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  suggested_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  dispute_id UUID REFERENCES public.disputes(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'NGN',
  sla_status public.orchestration_sla_status NOT NULL DEFAULT 'on_track',
  required_role TEXT,
  required_permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
  required_skills TEXT[] NOT NULL DEFAULT '{}'::text[],
  risk_level TEXT NOT NULL DEFAULT 'standard',
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  escalation_level INT NOT NULL DEFAULT 0,
  escalation_reason TEXT,
  assignment_reason TEXT,
  reassignment_count INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  source_event_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  first_action_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orchestration_tasks TO authenticated;
GRANT ALL ON public.orchestration_tasks TO service_role;
GRANT USAGE ON SEQUENCE public.orchestration_task_code_seq TO authenticated, service_role;
ALTER TABLE public.orchestration_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal admins read tasks" ON public.orchestration_tasks
  FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','dispute_agent','support_agent',
    'identity_officer','finance_operator','finance_approver','compliance_officer','auditor'
  ]::text[]));

CREATE POLICY "Internal admins manage tasks" ON public.orchestration_tasks
  FOR ALL TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','support_agent'
  ]::text[]))
  WITH CHECK (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','support_agent'
  ]::text[]));

CREATE TRIGGER orchestration_tasks_touch BEFORE UPDATE ON public.orchestration_tasks
  FOR EACH ROW EXECUTE FUNCTION public.orch_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_orch_tasks_status ON public.orchestration_tasks(status);
CREATE INDEX IF NOT EXISTS idx_orch_tasks_agent ON public.orchestration_tasks(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_orch_tasks_priority ON public.orchestration_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_orch_tasks_created ON public.orchestration_tasks(created_at DESC);

-- ===== TASK ASSIGNMENT HISTORY =====
CREATE TABLE IF NOT EXISTS public.task_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.orchestration_tasks(id) ON DELETE CASCADE,
  from_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mode TEXT NOT NULL,
  reason TEXT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.task_assignment_history TO authenticated;
GRANT ALL ON public.task_assignment_history TO service_role;
ALTER TABLE public.task_assignment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal admins read assignment history" ON public.task_assignment_history
  FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','dispute_agent','support_agent','auditor'
  ]::text[]));
CREATE INDEX IF NOT EXISTS idx_task_assign_hist_task ON public.task_assignment_history(task_id, created_at DESC);

-- ===== TASK STATUS HISTORY =====
CREATE TABLE IF NOT EXISTS public.task_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.orchestration_tasks(id) ON DELETE CASCADE,
  from_status public.orchestration_task_status,
  to_status public.orchestration_task_status NOT NULL,
  from_stage public.orchestration_task_stage,
  to_stage public.orchestration_task_stage,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.task_status_history TO authenticated;
GRANT ALL ON public.task_status_history TO service_role;
ALTER TABLE public.task_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal admins read status history" ON public.task_status_history
  FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','dispute_agent','support_agent','auditor'
  ]::text[]));
CREATE INDEX IF NOT EXISTS idx_task_status_hist_task ON public.task_status_history(task_id, created_at DESC);

-- ===== TASK COMMENTS =====
CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.orchestration_tasks(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal admins read task comments" ON public.task_comments
  FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','dispute_agent','support_agent','auditor'
  ]::text[]));
CREATE POLICY "Internal admins add task comments" ON public.task_comments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','dispute_agent','support_agent'
  ]::text[]));
CREATE TRIGGER task_comments_touch BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.orch_touch_updated_at();

-- ===== AGENT CAPACITY / AVAILABILITY / SKILLS =====
CREATE TABLE IF NOT EXISTS public.agent_capacity (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  max_active_tasks INT NOT NULL DEFAULT 5,
  current_active INT NOT NULL DEFAULT 0,
  overdue_count INT NOT NULL DEFAULT 0,
  avg_first_action_seconds INT NOT NULL DEFAULT 0,
  resolved_today INT NOT NULL DEFAULT 0,
  tasks_today INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.agent_capacity TO authenticated;
GRANT ALL ON public.agent_capacity TO service_role;
ALTER TABLE public.agent_capacity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal admins read capacity" ON public.agent_capacity
  FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','dispute_agent','support_agent','auditor'
  ]::text[]));
CREATE POLICY "Senior admins update capacity" ON public.agent_capacity
  FOR UPDATE TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin']::text[]))
  WITH CHECK (public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin']::text[]));
CREATE TRIGGER agent_capacity_touch BEFORE UPDATE ON public.agent_capacity
  FOR EACH ROW EXECUTE FUNCTION public.orch_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.agent_availability (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.agent_availability_status NOT NULL DEFAULT 'offline',
  last_heartbeat TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.agent_availability TO authenticated;
GRANT ALL ON public.agent_availability TO service_role;
ALTER TABLE public.agent_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal admins read availability" ON public.agent_availability
  FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','dispute_agent','support_agent','auditor'
  ]::text[]));
CREATE POLICY "Agents self-update availability" ON public.agent_availability
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Agents self-insert availability" ON public.agent_availability
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER agent_availability_touch BEFORE UPDATE ON public.agent_availability
  FOR EACH ROW EXECUTE FUNCTION public.orch_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  proficiency INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, skill)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_skills TO authenticated;
GRANT ALL ON public.agent_skills TO service_role;
ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal admins read skills" ON public.agent_skills
  FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','support_agent','auditor'
  ]::text[]));
CREATE POLICY "Senior admins manage skills" ON public.agent_skills
  FOR ALL TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin']::text[]))
  WITH CHECK (public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin']::text[]));

-- ===== ASSIGNMENT RULES =====
CREATE TABLE IF NOT EXISTS public.assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'global',
  active BOOLEAN NOT NULL DEFAULT true,
  mode TEXT NOT NULL DEFAULT 'round_robin',
  config JSONB NOT NULL DEFAULT '{
    "round_robin": true,
    "online_only": true,
    "skip_at_capacity": true,
    "priority_to_senior_pool": true,
    "auto_escalate_stale": false,
    "auto_reassign_on_offline": true,
    "max_active_per_agent": 5,
    "max_overdue_before_skip": 2,
    "fallback_target": "senior_agent_pool",
    "super_admin_self_assign": true
  }'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope)
);
GRANT SELECT ON public.assignment_rules TO authenticated;
GRANT ALL ON public.assignment_rules TO service_role;
ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal admins read rules" ON public.assignment_rules
  FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','support_agent','auditor'
  ]::text[]));
CREATE TRIGGER assignment_rules_touch BEFORE UPDATE ON public.assignment_rules
  FOR EACH ROW EXECUTE FUNCTION public.orch_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.assignment_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.assignment_rules(id) ON DELETE CASCADE,
  version INT NOT NULL,
  config JSONB NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rule_id, version)
);
GRANT SELECT, INSERT ON public.assignment_rule_versions TO authenticated;
GRANT ALL ON public.assignment_rule_versions TO service_role;
ALTER TABLE public.assignment_rule_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal admins read rule versions" ON public.assignment_rule_versions
  FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','support_agent','auditor'
  ]::text[]));

CREATE TABLE IF NOT EXISTS public.escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_after_seconds INT NOT NULL DEFAULT 3600,
  target_queue TEXT NOT NULL DEFAULT 'senior_agent_pool',
  min_priority public.orchestration_task_priority NOT NULL DEFAULT 'high',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.escalation_rules TO authenticated;
GRANT ALL ON public.escalation_rules TO service_role;
ALTER TABLE public.escalation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal admins read escalation rules" ON public.escalation_rules
  FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','support_agent','auditor'
  ]::text[]));
CREATE TRIGGER escalation_rules_touch BEFORE UPDATE ON public.escalation_rules
  FOR EACH ROW EXECUTE FUNCTION public.orch_touch_updated_at();

-- ===== ORCHESTRATION EVENTS =====
CREATE TABLE IF NOT EXISTS public.orchestration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.orchestration_tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.orchestration_events TO authenticated;
GRANT ALL ON public.orchestration_events TO service_role;
ALTER TABLE public.orchestration_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal admins read orchestration events" ON public.orchestration_events
  FOR SELECT TO authenticated
  USING (public.has_any_internal_role(auth.uid(), ARRAY[
    'super_admin','senior_admin','dispute_manager','dispute_agent','support_agent','auditor'
  ]::text[]));
CREATE INDEX IF NOT EXISTS idx_orch_events_task ON public.orchestration_events(task_id, created_at DESC);

-- ===== RPCs =====
CREATE OR REPLACE FUNCTION public.create_orchestration_task(
  _type public.orchestration_task_type,
  _title TEXT,
  _description TEXT,
  _priority public.orchestration_task_priority,
  _queue TEXT,
  _dispute_id UUID,
  _transaction_id UUID,
  _buyer_id UUID,
  _seller_id UUID,
  _amount NUMERIC,
  _currency TEXT,
  _required_permissions TEXT[],
  _source_event_key TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  IF _source_event_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.orchestration_tasks WHERE source_event_key = _source_event_key;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO public.orchestration_tasks(
    type, title, description, priority, queue,
    dispute_id, transaction_id, buyer_id, seller_id,
    amount, currency, required_permissions, source_event_key,
    due_at, risk_level
  ) VALUES (
    _type, _title, _description, COALESCE(_priority,'medium'), COALESCE(_queue,'general'),
    _dispute_id, _transaction_id, _buyer_id, _seller_id,
    _amount, COALESCE(_currency,'NGN'), COALESCE(_required_permissions,'{}'::text[]), _source_event_key,
    now() + CASE COALESCE(_priority,'medium')
      WHEN 'critical' THEN interval '2 hours'
      WHEN 'high' THEN interval '8 hours'
      WHEN 'medium' THEN interval '24 hours'
      ELSE interval '72 hours' END,
    CASE WHEN _priority = 'critical' THEN 'elevated' ELSE 'standard' END
  ) RETURNING id INTO v_id;

  INSERT INTO public.task_status_history(task_id, to_status, to_stage, reason)
  VALUES (v_id, 'unassigned', 'initial_review', 'created');

  INSERT INTO public.orchestration_events(task_id, event_type, payload)
  VALUES (v_id, 'task_created', jsonb_build_object('source_event_key', _source_event_key));

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.assign_task(
  _task_id UUID, _agent_id UUID, _mode TEXT, _reason TEXT, _actor_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev UUID; v_status public.orchestration_task_status;
BEGIN
  SELECT assigned_agent_id, status INTO v_prev, v_status FROM public.orchestration_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found'; END IF;

  UPDATE public.orchestration_tasks SET
    assigned_agent_id = _agent_id,
    status = CASE WHEN v_status IN ('unassigned','escalated') THEN 'assigned'::public.orchestration_task_status ELSE v_status END,
    assigned_at = COALESCE(assigned_at, now()),
    reassignment_count = CASE WHEN v_prev IS NOT NULL AND v_prev <> _agent_id THEN reassignment_count + 1 ELSE reassignment_count END,
    assignment_reason = COALESCE(_reason, assignment_reason),
    version = version + 1
  WHERE id = _task_id;

  INSERT INTO public.task_assignment_history(task_id, from_agent_id, to_agent_id, mode, reason, actor_id)
  VALUES (_task_id, v_prev, _agent_id, COALESCE(_mode,'manual'), _reason, _actor_id);

  INSERT INTO public.orchestration_events(task_id, event_type, actor_id, payload)
  VALUES (_task_id, 'task_assigned', _actor_id, jsonb_build_object('agent_id', _agent_id, 'mode', _mode));

  -- Refresh capacity counters
  INSERT INTO public.agent_capacity(user_id, current_active, tasks_today)
    VALUES (_agent_id, 1, 1)
    ON CONFLICT (user_id) DO UPDATE SET
      current_active = public.agent_capacity.current_active + 1,
      tasks_today = public.agent_capacity.tasks_today + 1,
      updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.escalate_task(_task_id UUID, _reason TEXT, _actor_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.orchestration_tasks SET
    status = 'escalated',
    escalation_level = escalation_level + 1,
    escalation_reason = _reason,
    queue = 'senior_agent_pool',
    version = version + 1
  WHERE id = _task_id;

  INSERT INTO public.task_status_history(task_id, to_status, actor_id, reason)
  VALUES (_task_id, 'escalated', _actor_id, _reason);

  INSERT INTO public.orchestration_events(task_id, event_type, actor_id, payload)
  VALUES (_task_id, 'task_escalated', _actor_id, jsonb_build_object('reason', _reason));
END $$;

CREATE OR REPLACE FUNCTION public.complete_orchestration_task(_task_id UUID, _resolution TEXT, _actor_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agent UUID;
BEGIN
  SELECT assigned_agent_id INTO v_agent FROM public.orchestration_tasks WHERE id = _task_id;
  UPDATE public.orchestration_tasks SET
    status = 'resolved',
    stage = 'completed',
    resolved_at = now(),
    version = version + 1
  WHERE id = _task_id;

  INSERT INTO public.task_status_history(task_id, to_status, to_stage, actor_id, reason)
  VALUES (_task_id, 'resolved', 'completed', _actor_id, _resolution);

  INSERT INTO public.orchestration_events(task_id, event_type, actor_id, payload)
  VALUES (_task_id, 'task_resolved', _actor_id, jsonb_build_object('resolution', _resolution));

  IF v_agent IS NOT NULL THEN
    UPDATE public.agent_capacity SET
      current_active = GREATEST(current_active - 1, 0),
      resolved_today = resolved_today + 1,
      updated_at = now()
    WHERE user_id = v_agent;
  END IF;
END $$;

-- ===== SEED default assignment rules =====
INSERT INTO public.assignment_rules(scope) VALUES ('global') ON CONFLICT (scope) DO NOTHING;
