
-- 1) Catalog of forbidden permission pairs
CREATE TABLE public.permission_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  a_key text NOT NULL,
  b_key text NOT NULL,
  severity text NOT NULL DEFAULT 'high' CHECK (severity IN ('low','medium','high','critical')),
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permission_conflicts_pair_unique UNIQUE (a_key, b_key)
);

GRANT SELECT ON public.permission_conflicts TO authenticated;
GRANT ALL    ON public.permission_conflicts TO service_role;

ALTER TABLE public.permission_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal staff can read conflict catalog"
  ON public.permission_conflicts
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.internal_users iu WHERE iu.id = auth.uid()));

CREATE POLICY "super admins manage conflict catalog"
  ON public.permission_conflicts
  FOR ALL
  TO authenticated
  USING (public.has_internal_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_internal_role(auth.uid(), 'super_admin'));

-- Seed the existing hard-coded pairs
INSERT INTO public.permission_conflicts (a_key, b_key, severity, rationale) VALUES
  ('payouts.create',             'payouts.approve',        'high',     'Same actor cannot both initiate and approve payouts.'),
  ('refunds.create',             'refunds.approve',        'high',     'Same actor cannot both initiate and approve refunds.'),
  ('financial_controls.approve', 'disputes.resolve_all',   'critical', 'Dispute adjudication must be independent from financial control approvals.'),
  ('escrow.update',              'escrow.approve',         'high',     'Escrow modifications must be reviewed independently of approvals.')
ON CONFLICT (a_key, b_key) DO NOTHING;

-- 2) Acknowledgements (per role, per pair, with mandatory reason)
CREATE TABLE public.permission_conflict_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL,
  a_key text NOT NULL,
  b_key text NOT NULL,
  reason text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.internal_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT permission_conflict_ack_reason_min_length CHECK (length(reason) >= 8),
  CONSTRAINT permission_conflict_ack_unique UNIQUE (role_key, a_key, b_key)
);

CREATE INDEX permission_conflict_ack_role_idx ON public.permission_conflict_acknowledgements (role_key);

GRANT SELECT ON public.permission_conflict_acknowledgements TO authenticated;
GRANT ALL    ON public.permission_conflict_acknowledgements TO service_role;

ALTER TABLE public.permission_conflict_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal staff can read acknowledgements"
  ON public.permission_conflict_acknowledgements
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.internal_users iu WHERE iu.id = auth.uid()));

CREATE POLICY "super admins insert acknowledgements"
  ON public.permission_conflict_acknowledgements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_internal_role(auth.uid(), 'super_admin')
    AND actor_id = auth.uid()
  );

CREATE POLICY "super admins revoke acknowledgements"
  ON public.permission_conflict_acknowledgements
  FOR DELETE
  TO authenticated
  USING (public.has_internal_role(auth.uid(), 'super_admin'));

-- Immutable audit record: no updates permitted.

CREATE OR REPLACE FUNCTION public.log_permission_conflict_ack()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_actions (actor_id, action_type, summary, metadata)
  VALUES (
    NEW.actor_id,
    'add_internal_note',
    'Acknowledged permission conflict for role ' || NEW.role_key,
    jsonb_build_object(
      'ack_id',    NEW.id,
      'role_key',  NEW.role_key,
      'a_key',     NEW.a_key,
      'b_key',     NEW.b_key,
      'reason',    NEW.reason,
      'expires_at', NEW.expires_at
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER permission_conflict_ack_audit
  AFTER INSERT ON public.permission_conflict_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.log_permission_conflict_ack();
