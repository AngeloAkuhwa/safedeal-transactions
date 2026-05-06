CREATE OR REPLACE FUNCTION public.unfreeze_funds_atomic(p_transaction_id uuid, p_actor uuid, p_target money_status, p_reason text)
 RETURNS money_status
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

  SELECT money_status INTO v_old
    FROM public.transactions
   WHERE id = p_transaction_id
   FOR UPDATE;

  IF v_old IS NULL THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;
  IF v_old <> 'funds_frozen' THEN
    RAISE EXCEPTION 'not_frozen:%', v_old;
  END IF;

  SELECT currency_code INTO v_currency
    FROM public.transaction_pricing
   WHERE transaction_id = p_transaction_id
   LIMIT 1;

  SELECT COALESCE(frozen_amount, 0) INTO v_frozen
    FROM public.escrow_states
   WHERE transaction_id = p_transaction_id
   FOR UPDATE;

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