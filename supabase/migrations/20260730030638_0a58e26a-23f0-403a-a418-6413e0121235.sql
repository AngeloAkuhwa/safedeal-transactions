ALTER TABLE public.assignment_rules
  ADD COLUMN IF NOT EXISTS round_robin_state jsonb NOT NULL DEFAULT '{}'::jsonb;