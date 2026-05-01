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
    -- funds_released is terminal; cannot transition out. Flag-for-review only.
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