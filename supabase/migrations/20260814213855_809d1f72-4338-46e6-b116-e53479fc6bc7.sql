-- Live refund-rail proof. Executes the REAL capture + refund RPCs against the
-- real triggers, then rolls the whole thing back by raising a sentinel from an
-- inner block. Nothing it writes ever persists. This is the check that would
-- have caught the ledger_write_guarded overload outage: no file-scanning rule
-- can see a positional-binding fault.
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

    ---------------------------------------------------------------- happy path
    INSERT INTO public.transactions(
      transaction_code, buyer_id, seller_id, created_by_user_id, status,
      money_status, share_token, currency_code)
    VALUES ('SELFTEST-' || substr(gen_random_uuid()::text, 1, 8), v_buyer, v_seller, v_seller,
      'awaiting_payment', 'not_secured', gen_random_uuid()::text, p_currency)
    RETURNING id INTO v_tx;

    INSERT INTO public.transaction_pricing(
      transaction_id, currency_code, item_amount, platform_fee_amount,
      payment_processing_fee_amount, seller_payout_amount, buyer_total_amount,
      pricing_model_version)
    VALUES (v_tx, p_currency, v_item, v_platform, v_processing, v_item, v_total, 'selftest');

    INSERT INTO public.escrow_states(transaction_id, state, held_amount)
    VALUES (v_tx, 'awaiting_payment', 0);

    INSERT INTO public.payments(
      transaction_id, provider, provider_reference, status,
      payment_method_type, currency_code, amount)
    VALUES (v_tx, 'paystack', 'selftest-' || v_tx::text, 'pending', 'card', p_currency, v_total)
    RETURNING id INTO v_payment;

    v_capture := public.record_payment_capture_atomic(v_payment, 'selftest-evt-' || v_tx::text, NULL);
    v_checks := v_checks || jsonb_build_object(
      'check', 'capture_ok', 'pass', (v_capture ->> 'ok') = 'true');

    -- THE outage: item + platform fee exceeds the escrow hold, so the platform
    -- fee reversal always runs. If it binds a signature that cannot set
    -- balance_after, enforce_adjustment_balance aborts the whole RPC.
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

    -------------------------------------------- capture fails without escrow
    INSERT INTO public.transactions(
      transaction_code, buyer_id, seller_id, created_by_user_id, status,
      money_status, share_token, currency_code)
    VALUES ('SELFTEST2-' || substr(gen_random_uuid()::text, 1, 8), v_buyer, v_seller, v_seller,
      'awaiting_payment', 'not_secured', gen_random_uuid()::text, p_currency)
    RETURNING id INTO v_tx2;
    INSERT INTO public.transaction_pricing(
      transaction_id, currency_code, item_amount, platform_fee_amount,
      payment_processing_fee_amount, seller_payout_amount, buyer_total_amount,
      pricing_model_version)
    VALUES (v_tx2, p_currency, v_item, v_platform, v_processing, v_item, v_total, 'selftest');
    INSERT INTO public.payments(
      transaction_id, provider, provider_reference, status,
      payment_method_type, currency_code, amount)
    VALUES (v_tx2, 'paystack', 'selftest2-' || v_tx2::text, 'pending', 'card', p_currency, v_total)
    RETURNING id INTO v_payment2;

    BEGIN
      PERFORM public.record_payment_capture_atomic(v_payment2, 'selftest-evt2-' || v_tx2::text, NULL);
      v_escrow_guard := 'FAILED_no_exception';
    EXCEPTION WHEN others THEN
      v_escrow_guard := CASE WHEN SQLERRM LIKE 'missing_escrow_state%' THEN 'raised' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      'check', 'capture_refuses_missing_escrow', 'pass', v_escrow_guard = 'raised');

    RAISE EXCEPTION 'SELFTEST_ROLLBACK:%', jsonb_build_object(
      'ok', NOT (v_checks @> '[{"pass": false}]'::jsonb),
      'checks', v_checks)::text;
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'SELFTEST_ROLLBACK:%' THEN
      RETURN substr(SQLERRM, 19)::jsonb;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'checks', v_checks);
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.selftest_refund_rail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.selftest_refund_rail(text) TO service_role;

COMMENT ON FUNCTION public.selftest_refund_rail(text) IS
  'Executable proof of the buyer refund rail (capture -> platform fee reversal -> refund) against live triggers. Self-rolls back; writes nothing.';