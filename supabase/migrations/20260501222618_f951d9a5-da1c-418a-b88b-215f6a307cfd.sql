-- Gap 1: align refunds schema to spec
ALTER TABLE public.refunds RENAME COLUMN amount TO refund_amount;
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS initiated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'paystack',
  ADD COLUMN IF NOT EXISTS provider_response jsonb,
  ADD COLUMN IF NOT EXISTS failed_attempt_count integer NOT NULL DEFAULT 0;

-- Gap 3: allow exactly funds_released → funds_frozen (only that — keep terminal guard for refund_issued)
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
      _new_status IN ('funds_pending_release', 'refund_pending')
    WHEN 'funds_releasing' THEN
      _new_status IN ('funds_released', 'funds_pending_release')
    WHEN 'funds_released' THEN
      -- terminal except for confirmed Paystack reversal (moved to frozen for ops review)
      _new_status IN ('funds_frozen')
    WHEN 'refund_pending' THEN
      _new_status IN ('refund_issued')
    ELSE false
  END;
END;
$function$;

-- Update reverse_payout_atomic to actually move money out of funds_released → funds_frozen
CREATE OR REPLACE FUNCTION public.reverse_payout_atomic(p_payout_id uuid, p_amount numeric, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid;
  v_currency text;
  v_old_money money_status;
BEGIN
  SELECT transaction_id, currency_code INTO v_tx_id, v_currency
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;

  UPDATE public.payouts
  SET status = 'reversed'::payout_status,
      failure_reason = concat('reversed: ', p_reason),
      last_release_error = concat('reversed: ', p_reason),
      retry_allowed = false,
      updated_at = now()
  WHERE id = p_payout_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

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

    UPDATE public.transactions
    SET money_status = 'funds_frozen', updated_at = now()
    WHERE id = v_tx_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'funds_frozen', concat('transfer_reversed:', p_reason));
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
$function$;

-- Gap 2: install retry_payout_atomic (was missing from DB despite migration file)
CREATE OR REPLACE FUNCTION public.retry_payout_atomic(p_payout_id uuid, p_actor_user_id uuid, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid;
  v_old_money money_status;
  v_status payout_status;
  v_retry_allowed boolean;
BEGIN
  SELECT transaction_id, status, retry_allowed
    INTO v_tx_id, v_status, v_retry_allowed
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;

  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF v_status <> 'failed'::payout_status THEN RAISE EXCEPTION 'payout_not_failed:%', v_status; END IF;
  IF NOT v_retry_allowed THEN RAISE EXCEPTION 'retry_not_allowed'; END IF;

  -- Re-arm payout for another release attempt
  UPDATE public.payouts
  SET status = 'pending'::payout_status,
      release_approved_by_user_id = p_actor_user_id,
      released_at = now(),
      notes = COALESCE(p_notes, notes),
      last_release_attempt_at = now(),
      updated_at = now()
  WHERE id = p_payout_id;

  -- Money must be at funds_pending_release (where fail_payout_atomic returned it)
  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;
  IF v_old_money <> 'funds_pending_release'::money_status THEN
    RAISE EXCEPTION 'invalid_money_status_for_retry:%', v_old_money;
  END IF;

  UPDATE public.transactions
  SET money_status = 'funds_releasing',
      release_approved_at = now(),
      release_approved_by = p_actor_user_id,
      updated_at = now()
  WHERE id = v_tx_id;

  INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
  VALUES (v_tx_id, v_old_money, 'funds_releasing', p_actor_user_id, 'retry_payout');

  INSERT INTO public.admin_actions(admin_user_id, transaction_id, action_type, action_notes)
  VALUES (p_actor_user_id, v_tx_id, 'retry_payout', p_notes);

  UPDATE public.release_review_queue
  SET status = 'processing',
      claimed_by_user_id = p_actor_user_id,
      claimed_at = COALESCE(claimed_at, now()),
      updated_at = now()
  WHERE transaction_id = v_tx_id
    AND status IN ('failed','pending','claimed');

  RETURN jsonb_build_object('ok', true);
END;
$function$;