
-- 1) Investigation enums + table
DO $$ BEGIN
  CREATE TYPE public.admin_investigation_status AS ENUM
    ('open','under_review','escalated','resolved','dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.admin_investigation_priority AS ENUM
    ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.admin_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL UNIQUE
    REFERENCES public.transactions(id) ON DELETE RESTRICT,
  status public.admin_investigation_status NOT NULL DEFAULT 'open',
  priority public.admin_investigation_priority NOT NULL DEFAULT 'medium',
  assigned_admin_id uuid REFERENCES auth.users(id),
  tags text[] NOT NULL DEFAULT '{}',
  opened_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  last_updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_investigations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read investigations" ON public.admin_investigations;
CREATE POLICY "admins read investigations" ON public.admin_investigations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "admins write investigations" ON public.admin_investigations;
CREATE POLICY "admins write investigations" ON public.admin_investigations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS trg_admin_investigations_uat ON public.admin_investigations;
CREATE TRIGGER trg_admin_investigations_uat
  BEFORE UPDATE ON public.admin_investigations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_admin_investigations_status
  ON public.admin_investigations(status);
CREATE INDEX IF NOT EXISTS idx_admin_investigations_assignee
  ON public.admin_investigations(assigned_admin_id);

-- 2) Extend admin_action_type enum (idempotent)
DO $$ BEGIN
  ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'open_investigation';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'update_investigation';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'export_data';
EXCEPTION WHEN others THEN NULL; END $$;

-- 3) Extend transaction_event_type enum
DO $$ BEGIN
  ALTER TYPE public.transaction_event_type ADD VALUE IF NOT EXISTS 'admin_investigation_opened';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.transaction_event_type ADD VALUE IF NOT EXISTS 'admin_investigation_updated';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.transaction_event_type ADD VALUE IF NOT EXISTS 'admin_note_added';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.transaction_event_type ADD VALUE IF NOT EXISTS 'admin_funds_frozen';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.transaction_event_type ADD VALUE IF NOT EXISTS 'admin_funds_unfrozen';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.transaction_event_type ADD VALUE IF NOT EXISTS 'admin_export_generated';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.transaction_event_type ADD VALUE IF NOT EXISTS 'admin_flagged_for_review';
EXCEPTION WHEN others THEN NULL; END $$;

-- 4) Money transition: released is terminal; allow funds_frozen -> funds_held_in_escrow
CREATE OR REPLACE FUNCTION public.validate_money_transition(_old_status money_status, _new_status money_status)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _old_status = 'refund_issued' THEN
    RETURN false;
  END IF;
  RETURN CASE _old_status
    WHEN 'not_secured' THEN
      _new_status IN ('payment_pending')
    WHEN 'payment_pending' THEN
      _new_status IN ('funds_held_in_escrow', 'not_secured')
    WHEN 'funds_held_in_escrow' THEN
      _new_status IN ('funds_pending_release', 'funds_frozen')
    WHEN 'funds_pending_release' THEN
      _new_status IN ('funds_releasing', 'funds_frozen', 'refund_pending')
    WHEN 'funds_frozen' THEN
      _new_status IN ('funds_held_in_escrow', 'funds_pending_release', 'refund_pending')
    WHEN 'funds_releasing' THEN
      _new_status IN ('funds_released', 'funds_pending_release')
    WHEN 'funds_released' THEN
      false
    WHEN 'refund_pending' THEN
      _new_status IN ('refund_issued')
    ELSE false
  END;
END;
$function$;

-- 5) Atomic unfreeze that preserves the amount
CREATE OR REPLACE FUNCTION public.unfreeze_funds_atomic(
  p_transaction_id uuid,
  p_actor uuid,
  p_target money_status,
  p_reason text
) RETURNS money_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old money_status;
  v_frozen numeric;
  v_currency text;
BEGIN
  IF p_target NOT IN ('funds_held_in_escrow','funds_pending_release') THEN
    RAISE EXCEPTION 'invalid_target:%', p_target;
  END IF;

  SELECT money_status, currency_code INTO v_old, v_currency
    FROM public.transactions
   WHERE id = p_transaction_id
   FOR UPDATE;

  IF v_old IS NULL THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;
  IF v_old <> 'funds_frozen' THEN
    RAISE EXCEPTION 'not_frozen:%', v_old;
  END IF;

  SELECT COALESCE(frozen_amount, 0) INTO v_frozen
    FROM public.escrow_states
   WHERE transaction_id = p_transaction_id
   FOR UPDATE;

  -- Move the frozen amount back into the held pool (single secured pool).
  -- money_status itself signals whether the held amount is held or pending release.
  UPDATE public.escrow_states
     SET held_amount = COALESCE(held_amount, 0) + COALESCE(v_frozen, 0),
         frozen_amount = GREATEST(0, COALESCE(frozen_amount, 0) - COALESCE(v_frozen, 0)),
         state = 'held'::escrow_state,
         last_changed_at = now(),
         updated_at = now()
   WHERE transaction_id = p_transaction_id;

  UPDATE public.transactions
     SET money_status = p_target,
         needs_release_review = false,
         release_review_reason = NULL,
         updated_at = now()
   WHERE id = p_transaction_id;

  INSERT INTO public.money_status_history(
    transaction_id, old_status, new_status, changed_by_user_id, reason
  ) VALUES (
    p_transaction_id, v_old, p_target, p_actor, COALESCE(p_reason, 'admin_unfreeze')
  );

  -- Zero-sum reclassification ledger entry for audit
  INSERT INTO public.escrow_ledger_entries(
    transaction_id, entry_type, amount, currency_code,
    reference_type, reference_id, notes
  ) VALUES (
    p_transaction_id, 'adjustment', 0, COALESCE(v_currency, 'NGN'),
    'admin_unfreeze', p_transaction_id,
    concat('unfreeze: ', COALESCE(v_frozen, 0)::text, ' moved frozen→', p_target::text)
  );

  RETURN p_target;
END;
$function$;
