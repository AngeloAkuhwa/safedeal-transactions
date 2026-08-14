-- Third live blocker on the same rail: refunds.buyer_id is NOT NULL and the
-- insert never supplied it, so the refund row could not be written at all.
CREATE OR REPLACE FUNCTION public.start_refund_atomic(
  p_transaction_id uuid, p_amount numeric, p_actor_user_id uuid, p_reason text, p_notes text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_money money_status; v_payment_id uuid; v_currency text; v_refund_id uuid;
  v_existing uuid; v_uncommitted numeric; v_buyer uuid;
BEGIN
  SELECT money_status, buyer_id INTO v_old_money, v_buyer
  FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;

  SELECT currency_code INTO v_currency
  FROM public.transaction_pricing WHERE transaction_id = p_transaction_id;

  IF v_old_money NOT IN ('funds_held_in_escrow'::money_status,'funds_pending_release'::money_status,'funds_frozen'::money_status,'refund_pending'::money_status) THEN
    RAISE EXCEPTION 'invalid_money_status_for_refund:%', v_old_money;
  END IF;

  SELECT id INTO v_existing FROM public.refunds
   WHERE transaction_id = p_transaction_id AND status IN ('pending','processing')
   ORDER BY created_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF v_old_money = 'refund_pending'::money_status THEN
    RAISE EXCEPTION 'invalid_money_status_for_refund:%', v_old_money;
  END IF;

  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'missing_pricing_snapshot_currency:%', p_transaction_id;
  END IF;
  -- The refund is owed to a specific buyer. No buyer, no refund.
  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'transaction_has_no_buyer:%', p_transaction_id;
  END IF;

  SELECT id INTO v_payment_id FROM public.payments
  WHERE transaction_id = p_transaction_id AND status = 'succeeded'::payment_status
  ORDER BY created_at DESC LIMIT 1;
  IF v_payment_id IS NULL THEN RAISE EXCEPTION 'no_successful_payment'; END IF;

  IF EXISTS (SELECT 1 FROM public.payouts WHERE transaction_id = p_transaction_id AND status IN ('processing','completed')) THEN
    RAISE EXCEPTION 'payout_already_in_flight_or_completed';
  END IF;

  PERFORM public.ensure_platform_fee_reversal(
    p_transaction_id, p_amount, p_actor_user_id, 'refund', v_payment_id
  );

  v_uncommitted := public.escrow_uncommitted_available(p_transaction_id, NULL, NULL);
  IF p_amount > v_uncommitted + 0.005 THEN
    RAISE EXCEPTION 'refund_exceeds_uncommitted_available: uncommitted=% requested=%', v_uncommitted, p_amount;
  END IF;

  INSERT INTO public.refunds(
    transaction_id, buyer_id, payment_id, refund_amount, currency_code,
    reason, notes, status, initiated_by_user_id, provider
  ) VALUES (
    p_transaction_id, v_buyer, v_payment_id, p_amount, v_currency,
    p_reason, p_notes, 'pending', p_actor_user_id, 'paystack'
  ) RETURNING id INTO v_refund_id;

  IF v_old_money = 'funds_held_in_escrow'::money_status THEN
    UPDATE public.transactions
       SET money_status = 'funds_frozen'::money_status, updated_at = now()
     WHERE id = p_transaction_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
    VALUES (p_transaction_id, v_old_money, 'funds_frozen'::money_status, p_actor_user_id,
            'Funds frozen pending refund: ' || COALESCE(p_reason, 'refund'));
    v_old_money := 'funds_frozen'::money_status;
  END IF;

  IF v_old_money IN ('funds_frozen'::money_status, 'funds_pending_release'::money_status) THEN
    UPDATE public.transactions
       SET money_status = 'refund_pending'::money_status, updated_at = now()
     WHERE id = p_transaction_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
    VALUES (p_transaction_id, v_old_money, 'refund_pending'::money_status, p_actor_user_id, p_reason);
  END IF;

  RETURN v_refund_id;
END;
$function$;