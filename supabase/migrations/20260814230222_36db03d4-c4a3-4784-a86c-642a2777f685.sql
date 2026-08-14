-- 1. The one amount-taking money RPC still outside the finiteness class.
DO $do$
DECLARE s text; s0 text; v_oid oid;
BEGIN
  SELECT oid INTO v_oid FROM pg_proc WHERE proname = 'apply_financial_remediation_atomic'
    AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;
  s := replace(s,
    'IF p_adjustment IS NULL OR p_adjustment = 0 OR p_adjustment <> round(p_adjustment, 2) THEN',
    'IF p_adjustment IS NULL OR NOT public.is_finite_money(p_adjustment) OR p_adjustment = 0 OR p_adjustment <> round(p_adjustment, 2) THEN');
  IF s = s0 THEN RAISE EXCEPTION 'apply_financial_remediation_atomic: expected guard shape not found'; END IF;
  EXECUTE s;
END $do$;

-- 2. Self-test: new checks + a property-based positional-binding rule.
DO $do$
DECLARE s text; s0 text; v_oid oid;
BEGIN
  SELECT oid INTO v_oid FROM pg_proc WHERE proname = 'selftest_refund_rail'
    AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;

  -- 2a. The callee set is selected on the property (SECURITY DEFINER, more than
  --     one argument, touches a money table), not on a naming convention.
  s := replace(s,
'      SELECT p.proname AS callee
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = ''public'' AND p.prokind = ''f'' AND p.prosecdef
         AND (p.proname LIKE ''%\_atomic''
              OR p.proname IN (''ledger_write_guarded'', ''ensure_platform_fee_reversal''))',
'      -- Property, not name: any SECURITY DEFINER function that takes more than
      -- one argument and touches a money table. A naming convention would have
      -- missed the escrow balance helpers, whose two adjacent uuid exclusion
      -- parameters are exactly the shape that caused the refund outage.
      SELECT p.proname AS callee
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = ''public'' AND p.prokind = ''f'' AND p.prosecdef
         AND p.pronargs > 1
         AND pg_get_functiondef(p.oid) ~
             ''\m(escrow_ledger_entries|escrow_states|payouts|refunds|payments|transaction_pricing)\M''');

  -- Named-argument detection must accept both p_x := and _x := styles.
  s := replace(s,
    'regexp_count(src, ''\m'' || callee || ''\(\s*p_\w+\s*:='')',
    'regexp_count(src, ''\m'' || callee || ''\(\s*\w+\s*:='')');

  -- 2b. New checks, inserted immediately before the rollback.
  s := replace(s,
'    RAISE EXCEPTION ''SELFTEST_ROLLBACK:%'',',
'    -- ── +Infinity is refused at the routine layer and at the schema layer ──
    BEGIN
      PERFORM public.start_refund_atomic(
        p_transaction_id := v_tx2, p_amount := ''Infinity''::numeric, p_actor_user_id := v_buyer,
        p_reason := ''selftest'', p_notes := ''infinite amount must be refused'');
      v_res := ''FAILED_no_exception'';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE ''invalid_refund_amount%'' THEN ''raised'' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      ''check'', ''infinite_refund_refused'', ''pass'', v_res = ''raised'', ''detail'', v_res);

    BEGIN
      INSERT INTO public.refunds(
        transaction_id, payment_id, buyer_id, refund_amount, currency_code, reason, status, provider)
      VALUES (v_tx, v_payment, v_buyer, ''Infinity''::numeric, p_currency, ''selftest'', ''pending'', ''paystack'');
      v_res := ''FAILED_no_exception'';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE ''%refunds_refund_amount_positive%'' THEN ''raised'' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      ''check'', ''refunds_check_constraint_rejects_infinity'', ''pass'', v_res = ''raised'', ''detail'', v_res);

    BEGIN
      INSERT INTO public.payouts(transaction_id, seller_id, amount, currency_code, status)
      VALUES (v_gtx, v_seller, ''Infinity''::numeric, p_currency, ''pending'');
      v_res := ''FAILED_no_exception'';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE ''%payouts_amount_finite_positive%'' THEN ''raised'' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      ''check'', ''payouts_check_constraint_rejects_infinity'', ''pass'', v_res = ''raised'', ''detail'', v_res);

    BEGIN
      INSERT INTO public.payments(
        transaction_id, provider, provider_reference, status, payment_method_type, currency_code, amount)
      VALUES (v_gtx, ''paystack'', ''selftest-inf-'' || v_gtx::text, ''pending'', ''card'', p_currency,
              ''Infinity''::numeric);
      v_res := ''FAILED_no_exception'';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE ''%payments_amount_finite_positive%'' THEN ''raised'' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      ''check'', ''payments_check_constraint_rejects_infinity'', ''pass'', v_res = ''raised'', ''detail'', v_res);

    BEGIN
      INSERT INTO public.escrow_ledger_entries(
        transaction_id, entry_type, amount, currency_code, idempotency_key, payload_fingerprint, balance_after)
      VALUES (v_gtx, ''fee_record''::escrow_ledger_entry_type, ''NaN''::numeric, p_currency,
              ''selftest:nan:'' || v_gtx::text, ''v1:'' || repeat(''a'', 64), NULL);
      v_res := ''FAILED_no_exception'';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE ''%escrow_ledger_entries_amount_finite%'' THEN ''raised'' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      ''check'', ''ledger_check_constraint_rejects_nan'', ''pass'', v_res = ''raised'', ''detail'', v_res);

    BEGIN
      PERFORM public.ledger_write_guarded(
        p_transaction_id := v_gtx, p_entry_type := ''adjustment''::escrow_ledger_entry_type,
        p_amount := ''Infinity''::numeric, p_currency := p_currency, p_reference_type := ''selftest'',
        p_reference_id := v_gtx, p_notes := ''infinite adjustment must be refused'', p_created_by := NULL,
        p_metadata := ''{}''::jsonb, p_idempotency_key := ''selftest:inf:'' || v_gtx::text,
        p_payload := jsonb_build_object(''transaction_id'', v_gtx::text, ''entry_type'', ''adjustment''));
      v_res := ''FAILED_no_exception'';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE ''invalid_money_amount%'' THEN ''raised'' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      ''check'', ''ledger_write_refuses_infinity'', ''pass'', v_res = ''raised'', ''detail'', v_res);

    -- ── a reversal can never exceed the payout it reverses ──────────────────
    BEGIN
      PERFORM public.reverse_payout_atomic(
        p_payout_id := v_gpayout, p_amount := v_item * 3, p_reason := ''selftest'',
        p_provider_event_id := ''selftest-evt-ceiling'');
      v_res := ''FAILED_no_exception'';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE ''reversal_exceeds_payout_amount%'' THEN ''raised'' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      ''check'', ''reverse_payout_ceiling_enforced'', ''pass'', v_res = ''raised'', ''detail'', v_res);

    RAISE EXCEPTION ''SELFTEST_ROLLBACK:%'',');

  IF s = s0 THEN RAISE EXCEPTION 'selftest_refund_rail: expected body shape not found'; END IF;
  EXECUTE s;
END $do$;