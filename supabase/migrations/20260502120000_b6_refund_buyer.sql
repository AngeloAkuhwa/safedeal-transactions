-- Phase B6: align start_refund_atomic / fail_refund_atomic / complete_refund_atomic
-- with the actual `refunds` schema (amount, reason, failure_reason, buyer_id NOT NULL).

CREATE OR REPLACE FUNCTION public.start_refund_atomic(
  p_transaction_id uuid,
  p_amount numeric,
  p_actor_user_id uuid,
  p_reason text,
  p_notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_money money_status;
  v_payment_id uuid;
  v_currency text;
  v_buyer_id uuid;
  v_refund_id uuid;
BEGIN
  SELECT money_status, currency_code, buyer_id
    INTO v_old_money, v_currency, v_buyer_id
  FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;

  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  IF v_old_money NOT IN (
    'funds_held_in_escrow'::money_status,
    'funds_pending_release'::money_status,
    'funds_frozen'::money_status
  ) THEN
    RAISE EXCEPTION 'invalid_money_status_for_refund:%', v_old_money;
  END IF;

  SELECT id INTO v_payment_id
  FROM public.payments
  WHERE transaction_id = p_transaction_id
    AND status = 'succeeded'::payment_status
  ORDER BY created_at DESC LIMIT 1;
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'no_successful_payment';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payouts
    WHERE transaction_id = p_transaction_id
      AND status IN ('processing','completed')
  ) THEN
    RAISE EXCEPTION 'payout_already_in_flight_or_completed';
  END IF;

  -- Reuse open refund if one already exists (unique partial index allows only one).
  SELECT id INTO v_refund_id
  FROM public.refunds
  WHERE transaction_id = p_transaction_id
    AND status IN ('pending'::refund_status, 'processing'::refund_status)
  LIMIT 1;

  IF v_refund_id IS NULL THEN
    INSERT INTO public.refunds(
      transaction_id, buyer_id, payment_id, amount, currency_code,
      reason, status
    ) VALUES (
      p_transaction_id, v_buyer_id, v_payment_id, p_amount,
      COALESCE(v_currency, 'NGN'),
      concat(p_reason, CASE WHEN p_notes IS NOT NULL AND length(p_notes) > 0 THEN ' / ' || p_notes ELSE '' END),
      'pending'::refund_status
    ) RETURNING id INTO v_refund_id;
  END IF;

  -- Bridge held -> pending_release if needed (state machine requires it).
  IF v_old_money = 'funds_held_in_escrow'::money_status THEN
    UPDATE public.transactions SET money_status = 'funds_pending_release', updated_at = now()
    WHERE id = p_transaction_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
    VALUES (p_transaction_id, v_old_money, 'funds_pending_release', p_actor_user_id, 'refund_bridge');
    v_old_money := 'funds_pending_release'::money_status;
  END IF;

  -- Skip transition if already in refund_pending.
  IF v_old_money <> 'refund_pending'::money_status THEN
    UPDATE public.transactions SET money_status = 'refund_pending', updated_at = now() WHERE id = p_transaction_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
    VALUES (p_transaction_id, v_old_money, 'refund_pending', p_actor_user_id, p_reason);
  END IF;

  UPDATE public.payouts
  SET status = 'cancelled',
      notes = 'refunded by SafeDeal review',
      updated_at = now()
  WHERE transaction_id = p_transaction_id AND status IN ('awaiting_release','blocked','failed');

  UPDATE public.release_review_queue
  SET status = 'refunded', resolved_at = now(), updated_at = now()
  WHERE transaction_id = p_transaction_id AND status IN ('pending','claimed','processing','failed');

  INSERT INTO public.admin_actions(admin_user_id, transaction_id, action_type, action_notes)
  VALUES (
    p_actor_user_id, p_transaction_id, 'refund_buyer'::admin_action_type,
    concat(p_reason, ' / ', COALESCE(p_notes, ''))
  );

  RETURN v_refund_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_refund_atomic(p_refund_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.refunds
  SET status = 'failed'::refund_status,
      failed_at = now(),
      failure_reason = p_reason,
      updated_at = now()
  WHERE id = p_refund_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

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
  SELECT transaction_id, amount, currency_code INTO v_tx_id, v_amount, v_currency
  FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'refund_not_found'; END IF;

  IF EXISTS (SELECT 1 FROM public.refunds WHERE id = p_refund_id AND status = 'completed') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.refunds
  SET status = 'completed'::refund_status,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_refund_id;

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
      state = 'refunded'::escrow_state,
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

-- Also patch complete_payout_atomic which referenced a non-existent enum label.
CREATE OR REPLACE FUNCTION public.complete_payout_atomic(p_payout_id uuid, p_amount numeric)
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

  UPDATE public.escrow_states
  SET released_amount = released_amount + p_amount,
      held_amount = GREATEST(0, held_amount - p_amount),
      state = 'released'::escrow_state,
      last_changed_at = now(),
      updated_at = now()
  WHERE transaction_id = v_tx_id;

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
