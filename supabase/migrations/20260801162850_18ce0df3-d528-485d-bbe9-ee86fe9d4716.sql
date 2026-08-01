CREATE OR REPLACE FUNCTION public.complete_payout_atomic(p_payout_id uuid, p_amount numeric, p_provider_event_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid; v_seller_id uuid; v_currency text; v_status payout_status;
  v_old_money money_status; v_available numeric; v_res jsonb;
  v_existing_id uuid; v_existing_key text; v_existing_fp text; v_incoming_key text;
BEGIN
  IF p_provider_event_id IS NULL OR length(p_provider_event_id) < 3 THEN
    RAISE EXCEPTION 'missing_provider_event_id';
  END IF;

  SELECT transaction_id, seller_id, currency_code, status
    INTO v_tx_id, v_seller_id, v_currency, v_status
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;

  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF v_status = 'completed'::payout_status THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  IF v_status NOT IN ('pending'::payout_status, 'processing'::payout_status) THEN
    RAISE EXCEPTION 'payout_not_eligible_for_completion:%', v_status;
  END IF;

  v_incoming_key := 'payout:complete:' || v_tx_id::text || ':' || p_payout_id::text
                    || '#' || p_provider_event_id || ':payout_debit';

  SELECT id, idempotency_key, payload_fingerprint
    INTO v_existing_id, v_existing_key, v_existing_fp
  FROM public.escrow_ledger_entries
  WHERE transaction_id = v_tx_id
    AND entry_type = 'payout_debit'::escrow_ledger_entry_type
    AND reference_type = 'payout' AND reference_id = p_payout_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL AND COALESCE(v_existing_key, '') <> v_incoming_key THEN
    INSERT INTO public.financial_idempotency_conflicts(
      idempotency_key, existing_fingerprint, incoming_fingerprint,
      transaction_id, entry_type, actor_user_id
    ) VALUES (
      v_incoming_key, COALESCE(v_existing_fp, 'unknown'), 'alternate_provider_event',
      v_tx_id, 'payout_debit'::escrow_ledger_entry_type, v_seller_id
    )
    ON CONFLICT (idempotency_key, existing_fingerprint, incoming_fingerprint)
    DO UPDATE SET last_seen = now(),
                  occurrence_count = public.financial_idempotency_conflicts.occurrence_count + 1;

    RETURN jsonb_build_object('ok', true, 'idempotent', true,
                              'reason', 'already_final_movement', 'entry_id', v_existing_id);
  END IF;

  v_available := public.escrow_available_balance(v_tx_id);
  IF p_amount > v_available + 0.005 THEN
    RAISE EXCEPTION 'payout_exceeds_escrow_balance: available=% requested=%', v_available, p_amount;
  END IF;

  UPDATE public.payouts
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_payout_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  IF v_old_money = 'funds_releasing'::money_status THEN
    UPDATE public.transactions
    SET money_status = 'funds_released', release_completed_at = now(), updated_at = now()
    WHERE id = v_tx_id;

    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'funds_released', 'transfer_success_webhook');
  END IF;

  UPDATE public.escrow_states
  SET released_amount = released_amount + p_amount,
      held_amount = GREATEST(0, held_amount - p_amount),
      state = 'released'::escrow_state,
      last_changed_at = now(), updated_at = now()
  WHERE transaction_id = v_tx_id;

  v_res := public.ledger_write_guarded(
    v_tx_id, 'payout_debit'::escrow_ledger_entry_type, p_amount, COALESCE(v_currency,'NGN'),
    'payout', p_payout_id, 'transfer.success', v_seller_id,
    jsonb_build_object('provider_event_id', p_provider_event_id),
    v_incoming_key,
    jsonb_build_object('transaction_id', v_tx_id::text, 'payout_id', p_payout_id::text,
      'provider_event_id', p_provider_event_id, 'entry_type', 'payout_debit',
      'amount_minor', round(p_amount * 100)::bigint, 'currency', COALESCE(v_currency,'NGN'))
  );
  IF (v_res ->> 'status') = 'idempotency_conflict' THEN
    RAISE EXCEPTION 'idempotency_conflict_payout_complete:%', p_payout_id;
  END IF;

  UPDATE public.release_review_queue
  SET status = 'released', resolved_at = now(), updated_at = now()
  WHERE transaction_id = v_tx_id AND status IN ('processing','claimed','pending');

  RETURN jsonb_build_object('ok', true, 'ledger', v_res ->> 'status');
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_payout_atomic(uuid,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payout_atomic(uuid,numeric,text) TO service_role;