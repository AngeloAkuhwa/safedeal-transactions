
-- =========================================================================
-- B0: Phase B Release Pipeline Foundation
-- =========================================================================

-- 1) payout_accounts: add provider linkage + error tracking
ALTER TABLE public.payout_accounts
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_recipient_id text,
  ADD COLUMN IF NOT EXISTS last_verification_error text,
  ADD COLUMN IF NOT EXISTS provider_response jsonb;

-- Constrain verification_status to known values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payout_accounts_verification_status_check'
  ) THEN
    ALTER TABLE public.payout_accounts
      ADD CONSTRAINT payout_accounts_verification_status_check
      CHECK (verification_status IN ('pending','verified','failed','requires_update'));
  END IF;
END $$;

-- 2) payouts: retry tracking
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS last_release_error text,
  ADD COLUMN IF NOT EXISTS last_release_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_allowed boolean NOT NULL DEFAULT false;

-- 3) transactions: release lifecycle timestamps + actor
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS release_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS release_approved_by uuid,
  ADD COLUMN IF NOT EXISTS release_completed_at timestamptz;

-- 4) refunds table
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  payment_id uuid,
  refund_amount numeric NOT NULL CHECK (refund_amount > 0),
  currency_code text NOT NULL DEFAULT 'NGN',
  reason text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  provider text,
  provider_reference text,
  provider_response jsonb,
  initiated_by_user_id uuid NOT NULL,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  failed_attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_transaction ON public.refunds (transaction_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_provider_reference
  ON public.refunds (provider_reference) WHERE provider_reference IS NOT NULL;

-- Block multiple in-flight refunds per transaction
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_one_open_per_tx
  ON public.refunds (transaction_id) WHERE status IN ('pending','processing');

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parties_select_refunds ON public.refunds;
CREATE POLICY parties_select_refunds
  ON public.refunds
  FOR SELECT
  TO authenticated
  USING (public.is_transaction_party(auth.uid(), transaction_id));

DROP POLICY IF EXISTS admins_select_refunds ON public.refunds;
CREATE POLICY admins_select_refunds
  ON public.refunds
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type));

-- INSERT/UPDATE intentionally service-role only (no policies)

CREATE TRIGGER refunds_set_updated_at
  BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER refunds_prevent_delete
  BEFORE DELETE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete();

-- 5) Stronger webhook idempotency
ALTER TABLE public.payment_webhook_logs
  ADD COLUMN IF NOT EXISTS provider_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_webhook_event_ref
  ON public.payment_webhook_logs (provider, event_type, provider_reference)
  WHERE provider_reference IS NOT NULL;

-- 6) System settings
INSERT INTO public.system_settings (setting_key, setting_value)
VALUES
  ('payout_max_retry_attempts', '3'::jsonb),
  ('release_review_severity_threshold', '"medium"'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- =========================================================================
-- 7) State-machine SQL helpers (SECURITY DEFINER)
-- =========================================================================

-- 7a) release_payout_atomic: awaiting_release -> pending, money funds_pending_release -> funds_releasing
CREATE OR REPLACE FUNCTION public.release_payout_atomic(
  p_transaction_id uuid,
  p_payout_id uuid,
  p_actor_user_id uuid,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_money money_status;
BEGIN
  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;

  IF v_old_money IS DISTINCT FROM 'funds_pending_release'::money_status THEN
    RAISE EXCEPTION 'invalid_money_status:%', v_old_money;
  END IF;

  -- Payout transition
  UPDATE public.payouts
  SET status = 'pending',
      release_approved_by_user_id = p_actor_user_id,
      released_at = now(),
      notes = COALESCE(p_notes, notes),
      last_release_attempt_at = now(),
      updated_at = now()
  WHERE id = p_payout_id AND status = 'awaiting_release';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_in_awaiting_release';
  END IF;

  -- Money transition
  UPDATE public.transactions
  SET money_status = 'funds_releasing',
      release_approved_at = now(),
      release_approved_by = p_actor_user_id,
      updated_at = now()
  WHERE id = p_transaction_id;

  INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
  VALUES (p_transaction_id, v_old_money, 'funds_releasing', p_actor_user_id, 'release_approved');

  INSERT INTO public.admin_actions(admin_user_id, transaction_id, action_type, action_notes)
  VALUES (p_actor_user_id, p_transaction_id, 'release_funds', p_notes);

  UPDATE public.release_review_queue
  SET status = 'processing',
      claimed_by_user_id = p_actor_user_id,
      claimed_at = COALESCE(claimed_at, now()),
      updated_at = now()
  WHERE transaction_id = p_transaction_id
    AND status IN ('pending','claimed');

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7b) complete_payout_atomic: payout pending|processing -> completed, money funds_releasing -> funds_released
CREATE OR REPLACE FUNCTION public.complete_payout_atomic(
  p_payout_id uuid,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx_id uuid;
  v_seller_id uuid;
  v_currency text;
  v_old_money money_status;
BEGIN
  SELECT transaction_id, seller_id, currency_code INTO v_tx_id, v_seller_id, v_currency
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;

  IF v_tx_id IS NULL THEN
    RAISE EXCEPTION 'payout_not_found';
  END IF;

  -- Idempotency: skip if already completed
  IF EXISTS (SELECT 1 FROM public.payouts WHERE id = p_payout_id AND status = 'completed') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.payouts
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_payout_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  IF v_old_money = 'funds_releasing'::money_status THEN
    UPDATE public.transactions
    SET money_status = 'funds_released',
        release_completed_at = now(),
        updated_at = now()
    WHERE id = v_tx_id;

    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'funds_released', 'transfer_success_webhook');
  END IF;

  -- Escrow state aggregate
  UPDATE public.escrow_states
  SET released_amount = released_amount + p_amount,
      held_amount = GREATEST(0, held_amount - p_amount),
      state = 'released_to_seller'::escrow_state,
      last_changed_at = now(),
      updated_at = now()
  WHERE transaction_id = v_tx_id;

  -- Ledger entry
  INSERT INTO public.escrow_ledger_entries(
    transaction_id, entry_type, amount, currency_code, reference_type, reference_id, notes
  ) VALUES (
    v_tx_id, 'payout_debit', p_amount, COALESCE(v_currency, 'NGN'),
    'payout', p_payout_id, 'transfer.success'
  );

  UPDATE public.release_review_queue
  SET status = 'released',
      resolved_at = now(),
      updated_at = now()
  WHERE transaction_id = v_tx_id AND status IN ('processing','claimed','pending');

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7c) fail_payout_atomic: rollback after Paystack failure or transfer.failed webhook
CREATE OR REPLACE FUNCTION public.fail_payout_atomic(
  p_payout_id uuid,
  p_reason text,
  p_max_retries integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx_id uuid;
  v_old_money money_status;
  v_new_count integer;
BEGIN
  SELECT transaction_id INTO v_tx_id FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;

  UPDATE public.payouts
  SET status = 'failed',
      failed_at = now(),
      failure_reason = p_reason,
      last_release_error = p_reason,
      last_release_attempt_at = now(),
      failed_attempt_count = failed_attempt_count + 1,
      updated_at = now()
  WHERE id = p_payout_id
  RETURNING failed_attempt_count INTO v_new_count;

  UPDATE public.payouts
  SET retry_allowed = (v_new_count < p_max_retries)
  WHERE id = p_payout_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  IF v_old_money = 'funds_releasing'::money_status THEN
    UPDATE public.transactions
    SET money_status = 'funds_pending_release', updated_at = now()
    WHERE id = v_tx_id;

    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'funds_pending_release', concat('payout_failed:', p_reason));
  END IF;

  UPDATE public.release_review_queue
  SET status = 'failed',
      notes = concat('transfer failed: ', p_reason),
      updated_at = now()
  WHERE transaction_id = v_tx_id AND status IN ('processing','claimed','pending');

  RETURN jsonb_build_object('ok', true, 'failed_attempt_count', v_new_count);
END;
$$;

-- 7d) reverse_payout_atomic: high-severity reversal after success
CREATE OR REPLACE FUNCTION public.reverse_payout_atomic(
  p_payout_id uuid,
  p_amount numeric,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx_id uuid;
  v_currency text;
  v_old_money money_status;
BEGIN
  SELECT transaction_id, currency_code INTO v_tx_id, v_currency
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;

  UPDATE public.payouts
  SET status = 'failed',
      failure_reason = concat('reversed: ', p_reason),
      last_release_error = concat('reversed: ', p_reason),
      retry_allowed = false,
      updated_at = now()
  WHERE id = p_payout_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  -- If funds were already marked released, post a reversal ledger entry and freeze
  IF v_old_money = 'funds_released'::money_status THEN
    INSERT INTO public.escrow_ledger_entries(
      transaction_id, entry_type, amount, currency_code, reference_type, reference_id, notes
    ) VALUES (
      v_tx_id, 'adjustment', -p_amount, COALESCE(v_currency,'NGN'),
      'payout_reversal', p_payout_id, concat('transfer.reversed: ', p_reason)
    );

    UPDATE public.escrow_states
    SET released_amount = GREATEST(0, released_amount - p_amount),
        frozen_amount = frozen_amount + p_amount,
        state = 'frozen'::escrow_state,
        last_changed_at = now(),
        updated_at = now()
    WHERE transaction_id = v_tx_id;
    -- Cannot transition out of funds_released (terminal); flag for review only
  ELSIF v_old_money = 'funds_releasing'::money_status THEN
    UPDATE public.transactions
    SET money_status = 'funds_pending_release', updated_at = now()
    WHERE id = v_tx_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'funds_pending_release', concat('reversed:', p_reason));
  END IF;

  UPDATE public.transactions
  SET needs_release_review = true,
      release_review_reason = 'transfer_reversed',
      updated_at = now()
  WHERE id = v_tx_id;

  UPDATE public.release_review_queue
  SET status = 'failed',
      notes = concat('reversed: ', p_reason),
      updated_at = now()
  WHERE transaction_id = v_tx_id AND status IN ('processing','claimed','pending','released');

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7e) start_refund_atomic
CREATE OR REPLACE FUNCTION public.start_refund_atomic(
  p_transaction_id uuid,
  p_amount numeric,
  p_actor_user_id uuid,
  p_reason text,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_money money_status;
  v_payment_id uuid;
  v_currency text;
  v_refund_id uuid;
BEGIN
  SELECT money_status, currency_code INTO v_old_money, v_currency
  FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;

  IF v_old_money NOT IN ('funds_held_in_escrow'::money_status,'funds_pending_release'::money_status,'funds_frozen'::money_status) THEN
    RAISE EXCEPTION 'invalid_money_status_for_refund:%', v_old_money;
  END IF;

  SELECT id INTO v_payment_id FROM public.payments
  WHERE transaction_id = p_transaction_id AND status = 'success'::payment_status
  ORDER BY created_at DESC LIMIT 1;
  IF v_payment_id IS NULL THEN RAISE EXCEPTION 'no_successful_payment'; END IF;

  -- Block if a payout is processing or completed
  IF EXISTS (SELECT 1 FROM public.payouts WHERE transaction_id = p_transaction_id AND status IN ('processing','completed')) THEN
    RAISE EXCEPTION 'payout_already_in_flight_or_completed';
  END IF;

  INSERT INTO public.refunds(
    transaction_id, payment_id, refund_amount, currency_code,
    reason, notes, status, initiated_by_user_id, provider
  ) VALUES (
    p_transaction_id, v_payment_id, p_amount, COALESCE(v_currency,'NGN'),
    p_reason, p_notes, 'pending', p_actor_user_id, 'paystack'
  ) RETURNING id INTO v_refund_id;

  -- Bridge through refund_pending (state machine: held/frozen/pending_release -> refund_pending allowed only from pending_release/frozen)
  IF v_old_money = 'funds_held_in_escrow'::money_status THEN
    -- Move held -> pending_release first, then to refund_pending
    UPDATE public.transactions SET money_status = 'funds_pending_release', updated_at = now() WHERE id = p_transaction_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
    VALUES (p_transaction_id, v_old_money, 'funds_pending_release', p_actor_user_id, 'refund_bridge');
    v_old_money := 'funds_pending_release'::money_status;
  END IF;

  UPDATE public.transactions SET money_status = 'refund_pending', updated_at = now() WHERE id = p_transaction_id;
  INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
  VALUES (p_transaction_id, v_old_money, 'refund_pending', p_actor_user_id, p_reason);

  -- Cancel awaiting/blocked payouts
  UPDATE public.payouts
  SET status = 'cancelled',
      notes = 'refunded by SafeDeal review',
      updated_at = now()
  WHERE transaction_id = p_transaction_id AND status IN ('awaiting_release','blocked');

  UPDATE public.release_review_queue
  SET status = 'refunded', resolved_at = now(), updated_at = now()
  WHERE transaction_id = p_transaction_id AND status IN ('pending','claimed','processing','failed');

  INSERT INTO public.admin_actions(admin_user_id, transaction_id, action_type, action_notes)
  VALUES (p_actor_user_id, p_transaction_id, 'refund_buyer', concat(p_reason, ' / ', COALESCE(p_notes,'')));

  RETURN v_refund_id;
END;
$$;

-- 7f) complete_refund_atomic
CREATE OR REPLACE FUNCTION public.complete_refund_atomic(p_refund_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx_id uuid;
  v_amount numeric;
  v_currency text;
  v_old_money money_status;
BEGIN
  SELECT transaction_id, refund_amount, currency_code INTO v_tx_id, v_amount, v_currency
  FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'refund_not_found'; END IF;

  IF EXISTS (SELECT 1 FROM public.refunds WHERE id = p_refund_id AND status = 'completed') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.refunds SET status='completed', completed_at=now(), updated_at=now() WHERE id = p_refund_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;
  IF v_old_money = 'refund_pending'::money_status THEN
    UPDATE public.transactions
    SET money_status = 'refund_issued',
        status = 'refunded'::transaction_status,
        updated_at = now()
    WHERE id = v_tx_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'refund_issued', 'refund.processed');
  END IF;

  UPDATE public.escrow_states
  SET refunded_amount = refunded_amount + v_amount,
      held_amount = GREATEST(0, held_amount - v_amount),
      state = 'refunded_to_buyer'::escrow_state,
      last_changed_at = now(),
      updated_at = now()
  WHERE transaction_id = v_tx_id;

  INSERT INTO public.escrow_ledger_entries(
    transaction_id, entry_type, amount, currency_code, reference_type, reference_id, notes
  ) VALUES (
    v_tx_id, 'refund_debit', v_amount, COALESCE(v_currency,'NGN'),
    'refund', p_refund_id, 'refund.processed'
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7g) fail_refund_atomic
CREATE OR REPLACE FUNCTION public.fail_refund_atomic(p_refund_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.refunds
  SET status = 'failed',
      failed_at = now(),
      failure_reason = p_reason,
      failed_attempt_count = failed_attempt_count + 1,
      updated_at = now()
  WHERE id = p_refund_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7h) flag_for_release_review (idempotent helper)
CREATE OR REPLACE FUNCTION public.flag_for_release_review(
  p_transaction_id uuid,
  p_reason text,
  p_actor_user_id uuid,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_seller uuid;
  v_amount numeric;
  v_currency text;
  v_payout_id uuid;
  v_queue_id uuid;
BEGIN
  SELECT seller_id, total_amount, currency_code
    INTO v_seller, v_amount, v_currency
  FROM public.transactions WHERE id = p_transaction_id;
  IF v_seller IS NULL THEN RAISE EXCEPTION 'transaction_not_found'; END IF;

  SELECT id INTO v_payout_id FROM public.payouts
  WHERE transaction_id = p_transaction_id ORDER BY created_at DESC LIMIT 1;

  UPDATE public.transactions
  SET needs_release_review = true,
      release_review_reason = p_reason,
      updated_at = now()
  WHERE id = p_transaction_id;

  INSERT INTO public.release_review_queue(
    transaction_id, payout_id, seller_id, amount, currency_code,
    queue_type, status, notes
  )
  VALUES (
    p_transaction_id, v_payout_id, v_seller, COALESCE(v_amount,0), COALESCE(v_currency,'NGN'),
    'stuck', 'pending', p_notes
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_queue_id;

  INSERT INTO public.admin_actions(admin_user_id, transaction_id, action_type, action_notes)
  VALUES (p_actor_user_id, p_transaction_id, 'escalate_case', concat(p_reason, ' / ', COALESCE(p_notes,'')));

  RETURN v_queue_id;
END;
$$;
