CREATE OR REPLACE FUNCTION public.start_refund_atomic(p_transaction_id uuid, p_amount numeric, p_actor_user_id uuid, p_reason text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WHERE transaction_id = p_transaction_id AND status = 'succeeded'::payment_status
  ORDER BY created_at DESC LIMIT 1;
  IF v_payment_id IS NULL THEN RAISE EXCEPTION 'no_successful_payment'; END IF;

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

  IF v_old_money = 'funds_held_in_escrow'::money_status THEN
    UPDATE public.transactions SET money_status = 'funds_pending_release', updated_at = now() WHERE id = p_transaction_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
    VALUES (p_transaction_id, v_old_money, 'funds_pending_release', p_actor_user_id, 'refund_bridge');
    v_old_money := 'funds_pending_release'::money_status;
  END IF;

  UPDATE public.transactions SET money_status = 'refund_pending', updated_at = now() WHERE id = p_transaction_id;
  INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
  VALUES (p_transaction_id, v_old_money, 'refund_pending', p_actor_user_id, p_reason);

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
$function$;