-- (1) start_refund_atomic reads transactions.currency_code, which does not
-- exist on that table — the read would abort every refund. The authoritative
-- currency lives on the pricing snapshot, so read it there. No invented
-- fallback: a refund without a priced snapshot must refuse.
CREATE OR REPLACE FUNCTION public.start_refund_atomic(
  p_transaction_id uuid, p_amount numeric, p_actor_user_id uuid, p_reason text, p_notes text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_money money_status; v_payment_id uuid; v_currency text; v_refund_id uuid;
  v_existing uuid; v_uncommitted numeric;
BEGIN
  SELECT money_status INTO v_old_money
  FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;

  SELECT currency_code INTO v_currency
  FROM public.transaction_pricing WHERE transaction_id = p_transaction_id;

  IF v_old_money NOT IN ('funds_held_in_escrow'::money_status,'funds_pending_release'::money_status,'funds_frozen'::money_status,'refund_pending'::money_status) THEN
    RAISE EXCEPTION 'invalid_money_status_for_refund:%', v_old_money;
  END IF;

  -- Idempotent: one open refund commitment per transaction.
  SELECT id INTO v_existing FROM public.refunds
   WHERE transaction_id = p_transaction_id AND status IN ('pending','processing')
   ORDER BY created_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF v_old_money = 'refund_pending'::money_status THEN
    RAISE EXCEPTION 'invalid_money_status_for_refund:%', v_old_money;
  END IF;

  -- Fail closed on currency: refunds are money movement, never a default.
  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'missing_pricing_snapshot_currency:%', p_transaction_id;
  END IF;

  SELECT id INTO v_payment_id FROM public.payments
  WHERE transaction_id = p_transaction_id AND status = 'succeeded'::payment_status
  ORDER BY created_at DESC LIMIT 1;
  IF v_payment_id IS NULL THEN RAISE EXCEPTION 'no_successful_payment'; END IF;

  IF EXISTS (SELECT 1 FROM public.payouts WHERE transaction_id = p_transaction_id AND status IN ('processing','completed')) THEN
    RAISE EXCEPTION 'payout_already_in_flight_or_completed';
  END IF;

  -- Policy: item + SafeDeal platform fee is refundable (processing fee is not).
  -- Escrow only holds the item amount, so return the booked platform fee to the
  -- available pool via a compensating adjustment before validating availability.
  PERFORM public.ensure_platform_fee_reversal(
    p_transaction_id, p_amount, p_actor_user_id, 'refund', v_payment_id
  );

  -- Initiation validates against uncommitted available balance.
  v_uncommitted := public.escrow_uncommitted_available(p_transaction_id, NULL, NULL);
  IF p_amount > v_uncommitted + 0.005 THEN
    RAISE EXCEPTION 'refund_exceeds_uncommitted_available: uncommitted=% requested=%', v_uncommitted, p_amount;
  END IF;

  INSERT INTO public.refunds(
    transaction_id, payment_id, refund_amount, currency_code,
    reason, notes, status, initiated_by_user_id, provider
  ) VALUES (
    p_transaction_id, v_payment_id, p_amount, v_currency,
    p_reason, p_notes, 'pending', p_actor_user_id, 'paystack'
  ) RETURNING id INTO v_refund_id;

  IF v_old_money = 'funds_held_in_escrow'::money_status THEN
    UPDATE public.transactions
       SET money_status = 'refund_pending'::money_status, updated_at = now()
     WHERE id = p_transaction_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
    VALUES (p_transaction_id, v_old_money, 'refund_pending'::money_status, p_actor_user_id, p_reason);
  END IF;

  RETURN v_refund_id;
END;
$function$;

-- (2) The proof harness must not set a column transactions does not have.
CREATE OR REPLACE FUNCTION public.selftest_refund_rail(p_currency text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_buyer uuid; v_seller uuid; v_tx uuid; v_payment uuid; v_refund uuid;
  v_item numeric := 20000; v_platform numeric := 400; v_processing numeric := 380;
  v_total numeric := 20780; v_adj_balance numeric; v_adj_count int;
  v_capture jsonb; v_checks jsonb := '[]'::jsonb; v_escrow_guard text := 'not_run';
  v_tx2 uuid; v_payment2 uuid;
BEGIN
  BEGIN
    SELECT id INTO v_buyer FROM public.profiles ORDER BY created_at LIMIT 1;
    SELECT id INTO v_seller FROM public.profiles WHERE id <> v_buyer ORDER BY created_at LIMIT 1;
    IF v_buyer IS NULL OR v_seller IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'skipped', true, 'reason', 'needs_two_profiles');
    END IF;

    INSERT INTO public.transactions(
      transaction_code, buyer_id, seller_id, created_by_user_id, status, money_status, share_token)
    VALUES ('SELFTEST-' || substr(gen_random_uuid()::text, 1, 8), v_buyer, v_seller, v_seller,
      'awaiting_payment', 'not_secured', gen_random_uuid()::text)
    RETURNING id INTO v_tx;

    INSERT INTO public.transaction_pricing(
      transaction_id, currency_code, item_amount, platform_fee_amount,
      payment_processing_fee_amount, seller_payout_amount, buyer_total_amount, pricing_model_version)
    VALUES (v_tx, p_currency, v_item, v_platform, v_processing, v_item, v_total, 'selftest');

    INSERT INTO public.escrow_states(transaction_id, state, held_amount)
    VALUES (v_tx, 'awaiting_payment', 0);

    INSERT INTO public.payments(
      transaction_id, provider, provider_reference, status, payment_method_type, currency_code, amount)
    VALUES (v_tx, 'paystack', 'selftest-' || v_tx::text, 'pending', 'card', p_currency, v_total)
    RETURNING id INTO v_payment;

    v_capture := public.record_payment_capture_atomic(v_payment, 'selftest-evt-' || v_tx::text, NULL);
    v_checks := v_checks || jsonb_build_object('check', 'capture_ok', 'pass', (v_capture ->> 'ok') = 'true');

    v_refund := public.start_refund_atomic(
      v_tx, v_item + v_platform, v_buyer, 'selftest', 'live refund rail proof');
    v_checks := v_checks || jsonb_build_object('check', 'refund_created', 'pass', v_refund IS NOT NULL);

    SELECT count(*), max(balance_after) INTO v_adj_count, v_adj_balance
    FROM public.escrow_ledger_entries
    WHERE transaction_id = v_tx AND entry_type = 'adjustment';
    v_checks := v_checks
      || jsonb_build_object('check', 'fee_reversal_written', 'pass', v_adj_count = 1)
      || jsonb_build_object('check', 'balance_after_set', 'pass', v_adj_balance IS NOT NULL);

    v_checks := v_checks || jsonb_build_object(
      'check', 'refund_amount_matches_policy',
      'pass', (SELECT refund_amount FROM public.refunds WHERE id = v_refund) = v_item + v_platform);
    v_checks := v_checks || jsonb_build_object(
      'check', 'refund_currency_from_snapshot',
      'pass', (SELECT currency_code FROM public.refunds WHERE id = v_refund) = p_currency);

    INSERT INTO public.transactions(
      transaction_code, buyer_id, seller_id, created_by_user_id, status, money_status, share_token)
    VALUES ('SELFTEST2-' || substr(gen_random_uuid()::text, 1, 8), v_buyer, v_seller, v_seller,
      'awaiting_payment', 'not_secured', gen_random_uuid()::text)
    RETURNING id INTO v_tx2;
    INSERT INTO public.transaction_pricing(
      transaction_id, currency_code, item_amount, platform_fee_amount,
      payment_processing_fee_amount, seller_payout_amount, buyer_total_amount, pricing_model_version)
    VALUES (v_tx2, p_currency, v_item, v_platform, v_processing, v_item, v_total, 'selftest');
    INSERT INTO public.payments(
      transaction_id, provider, provider_reference, status, payment_method_type, currency_code, amount)
    VALUES (v_tx2, 'paystack', 'selftest2-' || v_tx2::text, 'pending', 'card', p_currency, v_total)
    RETURNING id INTO v_payment2;

    BEGIN
      PERFORM public.record_payment_capture_atomic(v_payment2, 'selftest-evt2-' || v_tx2::text, NULL);
      v_escrow_guard := 'FAILED_no_exception';
    EXCEPTION WHEN others THEN
      v_escrow_guard := CASE WHEN SQLERRM LIKE 'missing_escrow_state%' THEN 'raised' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      'check', 'capture_refuses_missing_escrow', 'pass', v_escrow_guard = 'raised',
      'detail', v_escrow_guard);

    RAISE EXCEPTION 'SELFTEST_ROLLBACK:%', jsonb_build_object(
      'ok', NOT (v_checks @> '[{"pass": false}]'::jsonb), 'checks', v_checks)::text;
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'SELFTEST_ROLLBACK:%' THEN
      RETURN substr(SQLERRM, 19)::jsonb;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'checks', v_checks);
  END;
END;
$function$;