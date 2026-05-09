CREATE OR REPLACE FUNCTION public.freeze_funds_atomic(p_transaction_id uuid, p_actor uuid, p_reason text)
 RETURNS money_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.money_status;
  v_new public.money_status := 'funds_frozen';
  v_allowed boolean;
  v_held numeric;
  v_currency text;
  v_frozen_after numeric;
BEGIN
  SELECT money_status INTO v_old FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  IF v_old = v_new THEN
    UPDATE public.transactions
       SET needs_release_review = true,
           release_review_reason = COALESCE(release_review_reason, 'manual_hold')
     WHERE id = p_transaction_id;
    RETURN v_new;
  END IF;

  IF v_old NOT IN ('funds_held_in_escrow','funds_pending_release') THEN
    RAISE EXCEPTION 'invalid_source_status:%', v_old;
  END IF;

  SELECT public.validate_money_transition(v_old, v_new) INTO v_allowed;
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> %', v_old, v_new;
  END IF;

  SELECT currency_code INTO v_currency
    FROM public.transaction_pricing
   WHERE transaction_id = p_transaction_id
   LIMIT 1;

  SELECT COALESCE(held_amount, 0) INTO v_held
    FROM public.escrow_states
   WHERE transaction_id = p_transaction_id
   FOR UPDATE;

  UPDATE public.escrow_states
     SET frozen_amount = COALESCE(frozen_amount, 0) + COALESCE(v_held, 0),
         held_amount = 0,
         state = 'frozen'::escrow_state,
         last_changed_at = now(),
         updated_at = now()
   WHERE transaction_id = p_transaction_id
   RETURNING frozen_amount INTO v_frozen_after;

  UPDATE public.transactions
     SET money_status = v_new,
         needs_release_review = true,
         release_review_reason = COALESCE(p_reason, 'manual_hold'),
         updated_at = now()
   WHERE id = p_transaction_id;

  INSERT INTO public.money_status_history (transaction_id, old_status, new_status, changed_by_user_id, reason, changed_at)
  VALUES (p_transaction_id, v_old, v_new, p_actor, COALESCE(p_reason, 'manual_hold'), now());

  INSERT INTO public.escrow_ledger_entries(
    transaction_id, entry_type, amount, currency_code,
    reference_type, reference_id, notes, metadata, created_by_user_id
  ) VALUES (
    p_transaction_id,
    'freeze_hold'::escrow_ledger_entry_type,
    COALESCE(v_held, 0),
    COALESCE(v_currency, 'NGN'),
    'admin_freeze',
    p_transaction_id,
    concat('Funds frozen by admin. Reason: ', COALESCE(p_reason, '')),
    jsonb_build_object(
      'admin_freeze', true,
      'from_bucket', 'held',
      'to_bucket', 'frozen',
      'moved_amount', COALESCE(v_held, 0),
      'balance_after_held', 0,
      'balance_after_frozen', COALESCE(v_frozen_after, 0),
      'source_money_status', v_old::text,
      'target_money_status', v_new::text,
      'reason', p_reason
    ),
    p_actor
  );

  RETURN v_new;
END;
$function$;