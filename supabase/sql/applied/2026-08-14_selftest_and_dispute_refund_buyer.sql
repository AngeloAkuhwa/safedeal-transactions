CREATE OR REPLACE FUNCTION public.resolve_dispute_atomic(p_dispute_id uuid, p_actor uuid, p_outcome dispute_outcome_type, p_refund_amount numeric, p_release_amount numeric, p_decision_summary text, p_also_close_investigation boolean DEFAULT false, p_acknowledge_frozen_funds boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_escrow_rows int;
  v_tx_id uuid;
  v_dispute_status public.dispute_case_status;
  v_old_dispute_status public.dispute_case_status;
  v_old_money public.money_status;
  v_new_money public.money_status;
  v_currency text;
  v_held numeric;
  v_frozen numeric;
  v_available numeric;
  v_old_tx_status public.transaction_status;
  v_refund_id uuid := NULL;
  v_queue_id uuid := NULL;
  v_seller uuid;
  v_payment_id uuid;
  v_has_open_invest boolean;
  v_admin_review_needed boolean;
  v_admin_review_reason text;
  v_inv_closed boolean := false;
  v_refund_qty numeric;
  v_release_qty numeric;
  v_queue_status text;
  v_queue_notes text;
  v_outcome_id uuid;
  v_admin_action_id uuid;
  v_event_id uuid;
  v_ledger_ids uuid[] := ARRAY[]::uuid[];
  v_ledger_id uuid;
  v_remaining_held numeric;
  v_remaining_frozen numeric;
  v_platform_fee_booked numeric;
  v_platform_fee_reversed numeric;
  v_refund_ceiling numeric;
BEGIN
  IF p_outcome NOT IN ('refund_buyer','release_funds_to_seller','partial_refund_release',
                       'dismissed_seller_favor','dismissed_buyer_favor','close_case_without_resolution') THEN
    RAISE EXCEPTION 'invalid_outcome:%', p_outcome;
  END IF;

  -- Dispute money quantities are outflows; negative or non-finite input would
  -- invert the ledger arithmetic.
  IF p_refund_amount IS NOT NULL AND (p_refund_amount = 'NaN'::numeric OR p_refund_amount < 0
     OR p_refund_amount <> round(p_refund_amount, 2)) THEN
    RAISE EXCEPTION 'invalid_refund_amount:%', p_refund_amount;
  END IF;
  IF p_release_amount IS NOT NULL AND (p_release_amount = 'NaN'::numeric OR p_release_amount < 0
     OR p_release_amount <> round(p_release_amount, 2)) THEN
    RAISE EXCEPTION 'invalid_release_amount:%', p_release_amount;
  END IF;

  SELECT transaction_id, status INTO v_tx_id, v_dispute_status
    FROM public.disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'dispute_not_found'; END IF;
  IF v_dispute_status = 'resolved' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_resolved');
  END IF;
  v_old_dispute_status := v_dispute_status;

  SELECT money_status, status, seller_id
    INTO v_old_money, v_old_tx_status, v_seller
    FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  IF v_old_money NOT IN ('funds_held_in_escrow','funds_pending_release','funds_frozen') THEN
    RAISE EXCEPTION 'invalid_money_status_for_resolve:%', v_old_money;
  END IF;

  IF p_outcome = 'close_case_without_resolution'
     AND v_old_money = 'funds_frozen'
     AND COALESCE(p_acknowledge_frozen_funds, false) = false THEN
    RAISE EXCEPTION 'frozen_funds_acknowledgement_required';
  END IF;

  SELECT currency_code INTO v_currency
    FROM public.transaction_pricing WHERE transaction_id = v_tx_id LIMIT 1;
  IF v_currency IS NULL OR btrim(v_currency) = '' THEN
    RAISE EXCEPTION 'pricing_snapshot_missing_currency:%', v_tx_id;
  END IF;

  SELECT COALESCE(held_amount,0), COALESCE(frozen_amount,0)
    INTO v_held, v_frozen
    FROM public.escrow_states WHERE transaction_id = v_tx_id FOR UPDATE;
  v_available := COALESCE(v_held,0) + COALESCE(v_frozen,0);

  -- Buyer-refundable ceiling = escrow (item) + still-unreversed SafeDeal platform fee.
  -- Payment processing fee remains non-refundable.
  SELECT COALESCE(SUM(amount), 0) INTO v_platform_fee_booked
    FROM public.escrow_ledger_entries
   WHERE transaction_id = v_tx_id
     AND entry_type = 'fee_record'::escrow_ledger_entry_type
     AND reference_type = 'platform_fee';
  SELECT COALESCE(SUM(amount), 0) INTO v_platform_fee_reversed
    FROM public.escrow_ledger_entries
   WHERE transaction_id = v_tx_id
     AND entry_type = 'adjustment'::escrow_ledger_entry_type
     AND reference_type = 'platform_fee_reversal';
  v_platform_fee_booked := GREATEST(round(COALESCE(v_platform_fee_booked,0) - COALESCE(v_platform_fee_reversed,0), 2), 0);
  v_refund_ceiling := v_available + v_platform_fee_booked;

  v_refund_qty := COALESCE(p_refund_amount, 0);
  v_release_qty := COALESCE(p_release_amount, 0);

  IF p_outcome = 'refund_buyer' OR p_outcome = 'dismissed_buyer_favor' THEN
    -- Full seller-fault refund defaults to item + platform fee.
    v_refund_qty := COALESCE(NULLIF(v_refund_qty, 0), v_refund_ceiling);
    v_release_qty := 0;
    IF v_refund_qty <= 0 OR v_refund_qty > v_refund_ceiling + 0.005 THEN
      RAISE EXCEPTION 'invalid_refund_amount:% vs refundable %', v_refund_qty, v_refund_ceiling;
    END IF;
  ELSIF p_outcome = 'release_funds_to_seller' OR p_outcome = 'dismissed_seller_favor' THEN
    v_release_qty := COALESCE(NULLIF(v_release_qty, 0), v_available);
    v_refund_qty := 0;
    IF v_release_qty <= 0 OR v_release_qty > v_available THEN
      RAISE EXCEPTION 'invalid_release_amount:% vs available %', v_release_qty, v_available;
    END IF;
  ELSIF p_outcome = 'partial_refund_release' THEN
    IF v_refund_qty <= 0 OR v_release_qty <= 0 THEN
      RAISE EXCEPTION 'partial_requires_both_amounts';
    END IF;
    IF v_release_qty > v_available + 0.005 THEN
      RAISE EXCEPTION 'invalid_release_amount:% vs available %', v_release_qty, v_available;
    END IF;
    IF (v_refund_qty + v_release_qty) > v_refund_ceiling + 0.005 THEN
      RAISE EXCEPTION 'partial_sum_exceeds_available:% + % vs %', v_refund_qty, v_release_qty, v_refund_ceiling;
    END IF;
  ELSE
    v_refund_qty := 0;
    v_release_qty := 0;
  END IF;

  -- Unwind frozen amount into held when outcome moves money
  IF p_outcome <> 'close_case_without_resolution' AND COALESCE(v_frozen, 0) > 0 THEN
    UPDATE public.escrow_states
      SET held_amount = COALESCE(held_amount,0) + v_frozen,
          frozen_amount = 0,
          state = 'held'::escrow_state,
          last_changed_at = now(),
          updated_at = now()
    WHERE transaction_id = v_tx_id;
    GET DIAGNOSTICS v_escrow_rows = ROW_COUNT;
    IF v_escrow_rows = 0 THEN
      RAISE EXCEPTION 'missing_escrow_state:%', v_tx_id;
    END IF;

    SELECT (public.ledger_write_guarded(
    p_transaction_id := v_tx_id, 
    p_entry_type := 'adjustment'::escrow_ledger_entry_type, 
    p_amount := v_frozen, 
    p_currency := v_currency, 
    p_reference_type := 'dispute_unfreeze', 
    p_reference_id := p_dispute_id, 
    p_notes := 'Frozen funds unwound for dispute resolution', 
    p_created_by := p_actor, 
    p_metadata := jsonb_build_object('from_bucket','frozen','to_bucket','held','moved_amount', v_frozen,
                         'reason','dispute_resolve_unfreeze_bridge'), 
    p_idempotency_key := 'dispute:unfreeze:' || v_tx_id::text || ':' || p_dispute_id::text || ':adjustment', 
    p_payload := jsonb_build_object('transaction_id', v_tx_id::text, 'dispute_id', p_dispute_id::text,
        'entry_type', 'adjustment', 'operation', 'dispute_unfreeze',
        'amount_minor', round(v_frozen * 100)::bigint, 'currency', v_currency)
  ) ->> 'entry_id')::uuid INTO v_ledger_id;
    v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);

    IF v_old_money = 'funds_frozen' THEN
      UPDATE public.transactions
        SET money_status = 'funds_held_in_escrow', updated_at = now()
        WHERE id = v_tx_id;
      INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
      VALUES (v_tx_id, v_old_money, 'funds_held_in_escrow', p_actor, 'dispute_resolve_unfreeze_bridge');
      v_old_money := 'funds_held_in_escrow';
    END IF;
    v_held := v_held + v_frozen;
    v_frozen := 0;
  END IF;

  IF p_outcome IN ('refund_buyer','dismissed_buyer_favor') OR p_outcome = 'partial_refund_release' THEN
    -- Return the SafeDeal platform fee into the escrow-available pool so the
    -- dispute_refund_reserved entry balances against real available funds.
    PERFORM public.ensure_platform_fee_reversal(
      p_transaction_id  := v_tx_id,
      p_required        := v_refund_qty + v_release_qty,
      p_actor_user_id   := p_actor,
      p_reference_type  := 'dispute',
      p_reference_id    := p_dispute_id
    );

    IF v_old_money = 'funds_held_in_escrow' THEN
      UPDATE public.transactions
        SET money_status = 'funds_pending_release', updated_at = now()
        WHERE id = v_tx_id;
      INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
      VALUES (v_tx_id, v_old_money, 'funds_pending_release', p_actor, 'dispute_resolve_bridge');
      v_old_money := 'funds_pending_release';
    END IF;

    v_new_money := 'refund_pending'::money_status;
    UPDATE public.transactions
      SET money_status = v_new_money, updated_at = now()
      WHERE id = v_tx_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
    VALUES (v_tx_id, v_old_money, v_new_money, p_actor, concat('dispute_outcome:', p_outcome::text));

    SELECT id INTO v_payment_id
      FROM public.payments
      WHERE transaction_id = v_tx_id AND status = 'succeeded'::payment_status
      ORDER BY created_at DESC LIMIT 1;
    IF v_payment_id IS NULL THEN RAISE EXCEPTION 'no_successful_payment_for_refund'; END IF;

    INSERT INTO public.refunds(
      transaction_id, payment_id, buyer_id, refund_amount, currency_code,
      reason, notes, status, initiated_by_user_id, provider
    ) VALUES (
      v_tx_id, v_payment_id,
      (SELECT buyer_id FROM public.transactions WHERE id = v_tx_id),
      v_refund_qty, v_currency,
      concat('dispute_outcome:', p_outcome::text),
      p_decision_summary, 'pending', p_actor, 'paystack'
    ) RETURNING id INTO v_refund_id;

    UPDATE public.payouts
      SET status = 'cancelled', notes = 'cancelled by dispute resolution', updated_at = now()
      WHERE transaction_id = v_tx_id AND status IN ('awaiting_release','blocked');

    UPDATE public.release_review_queue
      SET status = 'refunded', resolved_at = now(), updated_at = now()
      WHERE transaction_id = v_tx_id AND status IN ('pending','claimed','processing','failed');

    PERFORM public.ledger_write_guarded(
    p_transaction_id := v_tx_id, 
    p_entry_type := 'dispute_refund_reserved'::escrow_ledger_entry_type, 
    p_amount := -v_refund_qty, 
    p_currency := v_currency, 
    p_reference_type := 'dispute', 
    p_reference_id := p_dispute_id, 
    p_notes := concat('Refund reserved for dispute outcome ', p_outcome::text), 
    p_created_by := p_actor, 
    p_metadata := jsonb_build_object('dispute_id', p_dispute_id, 'refund_id', v_refund_id,
        'amount', v_refund_qty, 'outcome', p_outcome::text), 
    p_idempotency_key := 'dispute:refund_reserved:' || v_tx_id::text || ':' || p_dispute_id::text || ':dispute_refund_reserved', 
    p_payload := jsonb_build_object('transaction_id', v_tx_id::text, 'dispute_id', p_dispute_id::text,
        'entry_type', 'dispute_refund_reserved', 'operation', 'dispute_refund_reserved',
        'amount_minor', round(-v_refund_qty * 100)::bigint, 'currency', v_currency)
  );
    v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);

    IF p_outcome = 'partial_refund_release' THEN
      PERFORM public.ledger_write_guarded(
    p_transaction_id := v_tx_id, 
    p_entry_type := 'dispute_release_approved_pending_admin_release'::escrow_ledger_entry_type, 
    p_amount := v_release_qty, 
    p_currency := v_currency, 
    p_reference_type := 'dispute', 
    p_reference_id := p_dispute_id, 
    p_notes := concat('Release approved pending admin release. Outcome: ', p_outcome::text), 
    p_created_by := p_actor, 
    p_metadata := jsonb_build_object('dispute_id', p_dispute_id, 'amount', v_release_qty, 'outcome', p_outcome::text), 
    p_idempotency_key := 'dispute:release_approved:' || v_tx_id::text || ':' || p_dispute_id::text || ':dispute_release_approved_pending_admin_release', 
    p_payload := jsonb_build_object('transaction_id', v_tx_id::text, 'dispute_id', p_dispute_id::text,
        'entry_type', 'dispute_release_approved_pending_admin_release', 'operation', 'dispute_release_approved',
        'amount_minor', round(v_release_qty * 100)::bigint, 'currency', v_currency)
  );
      v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);

      INSERT INTO public.release_review_queue(
        transaction_id, seller_id, queue_type, status, amount, currency_code, notes
      ) VALUES (
        v_tx_id, v_seller, 'dispute_resolved_partial', 'held',
        v_release_qty, v_currency,
        concat('Partial dispute outcome. Blocked until refund ', v_refund_id, ' completes.')
      )
      ON CONFLICT (transaction_id, queue_type) WHERE status = ANY (ARRAY['pending'::text,'claimed'::text,'processing'::text,'awaiting_info'::text,'held'::text])
      DO UPDATE SET notes = EXCLUDED.notes, amount = EXCLUDED.amount, updated_at = now()
      RETURNING id INTO v_queue_id;
    END IF;

  ELSIF p_outcome IN ('release_funds_to_seller','dismissed_seller_favor') THEN
    IF v_old_money = 'funds_held_in_escrow' THEN
      v_new_money := 'funds_pending_release'::money_status;
      UPDATE public.transactions
        SET money_status = v_new_money, updated_at = now()
        WHERE id = v_tx_id;
      INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
      VALUES (v_tx_id, v_old_money, v_new_money, p_actor, concat('dispute_outcome:', p_outcome::text));
    ELSE
      v_new_money := v_old_money;
    END IF;

    PERFORM public.ledger_write_guarded(
    p_transaction_id := v_tx_id, 
    p_entry_type := 'dispute_release_approved_pending_admin_release'::escrow_ledger_entry_type, 
    p_amount := v_release_qty, 
    p_currency := v_currency, 
    p_reference_type := 'dispute', 
    p_reference_id := p_dispute_id, 
    p_notes := concat('Release approved pending admin release. Outcome: ', p_outcome::text), 
    p_created_by := p_actor, 
    p_metadata := jsonb_build_object('dispute_id', p_dispute_id, 'amount', v_release_qty, 'outcome', p_outcome::text), 
    p_idempotency_key := 'dispute:release_approved:' || v_tx_id::text || ':' || p_dispute_id::text || ':dispute_release_approved_pending_admin_release', 
    p_payload := jsonb_build_object('transaction_id', v_tx_id::text, 'dispute_id', p_dispute_id::text,
        'entry_type', 'dispute_release_approved_pending_admin_release', 'operation', 'dispute_release_approved',
        'amount_minor', round(v_release_qty * 100)::bigint, 'currency', v_currency)
  );
    v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);

    v_queue_status := 'pending';
    v_queue_notes := concat('Dispute resolved (', p_outcome::text, '). Awaiting central admin release review.');
    INSERT INTO public.release_review_queue(
      transaction_id, seller_id, queue_type, status, amount, currency_code, notes
    ) VALUES (
      v_tx_id, v_seller,
      CASE p_outcome
        WHEN 'release_funds_to_seller' THEN 'dispute_resolved_seller_favor'
        WHEN 'dismissed_seller_favor' THEN 'dispute_resolved_dismissed_seller'
      END,
      v_queue_status, v_release_qty, v_currency, v_queue_notes
    )
    ON CONFLICT (transaction_id, queue_type) WHERE status = ANY (ARRAY['pending'::text,'claimed'::text,'processing'::text,'awaiting_info'::text,'held'::text])
    DO UPDATE SET notes = EXCLUDED.notes, amount = EXCLUDED.amount, updated_at = now()
    RETURNING id INTO v_queue_id;

    UPDATE public.transactions
      SET needs_release_review = true,
          release_review_reason = COALESCE(release_review_reason, concat('dispute_resolved_', p_outcome::text)),
          updated_at = now()
      WHERE id = v_tx_id;

  ELSE
    v_new_money := v_old_money;
    PERFORM public.ledger_write_guarded(
    p_transaction_id := v_tx_id, 
    p_entry_type := 'dispute_no_action'::escrow_ledger_entry_type, 
    p_amount := 0, 
    p_currency := v_currency, 
    p_reference_type := 'dispute', 
    p_reference_id := p_dispute_id, 
    p_notes := 'Dispute closed without money movement', 
    p_created_by := p_actor, 
    p_metadata := jsonb_build_object('dispute_id', p_dispute_id, 'outcome', p_outcome::text,
        'money_status_at_close', v_old_money::text), 
    p_idempotency_key := 'dispute:no_action:' || v_tx_id::text || ':' || p_dispute_id::text || ':dispute_no_action', 
    p_payload := jsonb_build_object('transaction_id', v_tx_id::text, 'dispute_id', p_dispute_id::text,
        'entry_type', 'dispute_no_action', 'operation', 'dispute_no_action',
        'amount_minor', 0, 'currency', v_currency)
  );
    v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);
  END IF;

  UPDATE public.disputes
    SET status = 'resolved', resolved_at = now(), updated_at = now()
    WHERE id = p_dispute_id;

  INSERT INTO public.dispute_status_history(dispute_id, old_status, new_status, changed_by_user_id, reason)
  VALUES (p_dispute_id, v_old_dispute_status, 'resolved', p_actor, concat('Outcome: ', p_outcome::text));

  INSERT INTO public.dispute_outcomes(
    dispute_id, outcome_type, resolved_by_user_id, decision_summary,
    refund_amount, release_amount, resolved_at
  ) VALUES (
    p_dispute_id, p_outcome, p_actor, p_decision_summary,
    v_refund_qty, v_release_qty, now()
  ) RETURNING id INTO v_outcome_id;

  IF v_old_tx_status = 'disputed' THEN
    UPDATE public.transactions
      SET status = 'resolved', dispute_status = 'resolved', updated_at = now()
      WHERE id = v_tx_id;
  ELSE
    UPDATE public.transactions
      SET dispute_status = 'resolved', updated_at = now()
      WHERE id = v_tx_id;
  END IF;

  IF p_also_close_investigation THEN
    UPDATE public.admin_investigations
      SET status = 'resolved', resolved_at = now(), last_updated_by = p_actor, updated_at = now()
      WHERE transaction_id = v_tx_id AND status IN ('open','under_review','escalated');
    GET DIAGNOSTICS v_inv_closed = ROW_COUNT;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.admin_investigations
    WHERE transaction_id = v_tx_id AND status IN ('open','under_review','escalated')
  ) INTO v_has_open_invest;

  v_admin_review_needed := v_has_open_invest;
  v_admin_review_reason := CASE WHEN v_has_open_invest THEN 'investigation_open' ELSE NULL END;

  UPDATE public.transactions
    SET needs_admin_review = v_admin_review_needed,
        admin_review_reason = v_admin_review_reason,
        updated_at = now()
    WHERE id = v_tx_id;

  INSERT INTO public.transaction_events(transaction_id, event_type, actor_user_id, actor_role, event_data)
  VALUES (v_tx_id, 'dispute_resolved'::transaction_event_type, p_actor, 'admin',
          jsonb_build_object(
            'dispute_id', p_dispute_id, 'outcome', p_outcome::text,
            'refund_amount', v_refund_qty, 'release_amount', v_release_qty,
            'new_money_status', v_new_money::text,
            'investigation_closed', p_also_close_investigation AND v_inv_closed
          ))
  RETURNING id INTO v_event_id;

  INSERT INTO public.admin_actions(admin_user_id, transaction_id, dispute_id, action_type, action_notes)
  VALUES (p_actor, v_tx_id, p_dispute_id, 'resolve_dispute',
          concat(p_outcome::text, ' :: ', LEFT(p_decision_summary, 240)))
  RETURNING id INTO v_admin_action_id;

  INSERT INTO public.audit_logs(action, actor_user_id, transaction_id, description, metadata)
  VALUES ('admin_resolve_dispute', p_actor, v_tx_id,
          concat('Admin resolved dispute ', p_dispute_id, ' as ', p_outcome::text),
          jsonb_build_object(
            'dispute_id', p_dispute_id, 'outcome', p_outcome::text,
            'refund_amount', v_refund_qty, 'release_amount', v_release_qty,
            'money_status', v_new_money::text,
            'also_close_investigation', p_also_close_investigation,
            'acknowledge_frozen_funds', COALESCE(p_acknowledge_frozen_funds, false)
          ));

  SELECT COALESCE(held_amount,0), COALESCE(frozen_amount,0)
    INTO v_remaining_held, v_remaining_frozen
    FROM public.escrow_states WHERE transaction_id = v_tx_id;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome_type', p_outcome::text,
    'dispute_outcome_id', v_outcome_id,
    'money_status', v_new_money::text,
    'refund_id', v_refund_id,
    'release_queue_id', v_queue_id,
    'ledger_entry_ids', to_jsonb(v_ledger_ids),
    'admin_action_id', v_admin_action_id,
    'timeline_event_id', v_event_id,
    'remaining_held_amount', v_remaining_held,
    'remaining_frozen_amount', v_remaining_frozen,
    'refund_amount', v_refund_qty,
    'release_amount', v_release_qty,
    'investigation_closed', p_also_close_investigation AND COALESCE(v_inv_closed, false)
  );
END;
$function$
;
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
  v_tx2 uuid; v_payment2 uuid; v_money text; v_hold_balance numeric;
  v_gtx uuid; v_gpayout uuid; v_grefund uuid; v_gpayment uuid; v_res text;
  v_positional text[];
  v_overloads int;
  v_fee_overloads int;
  v_dtx uuid; v_dispute uuid;
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
      'awaiting_payment', 'payment_pending', gen_random_uuid()::text)
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

    v_capture := public.record_payment_capture_atomic(
      p_payment_id := v_payment, p_provider_event_id := 'selftest-evt-' || v_tx::text, p_raw_payload := NULL);
    v_checks := v_checks || jsonb_build_object('check', 'capture_ok', 'pass', (v_capture ->> 'ok') = 'true');
    v_checks := v_checks || jsonb_build_object('check', 'escrow_held',
      'pass', (SELECT state::text = 'held' AND held_amount = v_item FROM public.escrow_states WHERE transaction_id = v_tx));

    -- balance_after must be populated on cash-moving entries, not only adjustments.
    SELECT balance_after INTO v_hold_balance
      FROM public.escrow_ledger_entries
     WHERE transaction_id = v_tx AND entry_type = 'escrow_hold';
    v_checks := v_checks || jsonb_build_object(
      'check', 'escrow_hold_balance_after', 'pass', v_hold_balance = v_item, 'detail', v_hold_balance);

    v_refund := public.start_refund_atomic(
      p_transaction_id := v_tx, p_amount := v_item + v_platform, p_actor_user_id := v_buyer,
      p_reason := 'selftest', p_notes := 'live refund rail proof');
    v_checks := v_checks || jsonb_build_object('check', 'refund_created', 'pass', v_refund IS NOT NULL);

    SELECT count(*), max(balance_after) INTO v_adj_count, v_adj_balance
    FROM public.escrow_ledger_entries
    WHERE transaction_id = v_tx AND entry_type = 'adjustment';
    v_checks := v_checks
      || jsonb_build_object('check', 'fee_reversal_written', 'pass', v_adj_count = 1)
      || jsonb_build_object('check', 'balance_after_set', 'pass', v_adj_balance IS NOT NULL);

    SELECT money_status::text INTO v_money FROM public.transactions WHERE id = v_tx;
    v_checks := v_checks || jsonb_build_object(
      'check', 'money_status_refund_pending', 'pass', v_money = 'refund_pending', 'detail', v_money);
    v_checks := v_checks || jsonb_build_object(
      'check', 'refund_amount_matches_policy',
      'pass', (SELECT refund_amount FROM public.refunds WHERE id = v_refund) = v_item + v_platform);
    v_checks := v_checks || jsonb_build_object(
      'check', 'refund_currency_from_snapshot',
      'pass', (SELECT currency_code FROM public.refunds WHERE id = v_refund) = p_currency);
    v_checks := v_checks || jsonb_build_object(
      'check', 'refund_is_idempotent',
      'pass', public.start_refund_atomic(
        p_transaction_id := v_tx, p_amount := v_item + v_platform, p_actor_user_id := v_buyer,
        p_reason := 'selftest', p_notes := 'repeat') = v_refund);

    -- ── capture refuses a transaction with no escrow row ────────────────────
    INSERT INTO public.transactions(
      transaction_code, buyer_id, seller_id, created_by_user_id, status, money_status, share_token)
    VALUES ('SELFTEST2-' || substr(gen_random_uuid()::text, 1, 8), v_buyer, v_seller, v_seller,
      'awaiting_payment', 'payment_pending', gen_random_uuid()::text)
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
      PERFORM public.record_payment_capture_atomic(
        p_payment_id := v_payment2, p_provider_event_id := 'selftest-evt2-' || v_tx2::text, p_raw_payload := NULL);
      v_escrow_guard := 'FAILED_no_exception';
    EXCEPTION WHEN others THEN
      v_escrow_guard := CASE WHEN SQLERRM LIKE 'missing_escrow_state%' THEN 'raised' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      'check', 'capture_refuses_missing_escrow', 'pass', v_escrow_guard = 'raised', 'detail', v_escrow_guard);

    -- ── every sibling escrow writer refuses a missing escrow row ────────────
    -- freeze_funds_atomic
    INSERT INTO public.transactions(
      transaction_code, buyer_id, seller_id, created_by_user_id, status, money_status, share_token)
    VALUES ('SELFTEST3-' || substr(gen_random_uuid()::text, 1, 8), v_buyer, v_seller, v_seller,
      'payment_secured', 'funds_held_in_escrow', gen_random_uuid()::text)
    RETURNING id INTO v_gtx;
    INSERT INTO public.transaction_pricing(
      transaction_id, currency_code, item_amount, platform_fee_amount,
      payment_processing_fee_amount, seller_payout_amount, buyer_total_amount, pricing_model_version)
    VALUES (v_gtx, p_currency, v_item, v_platform, v_processing, v_item, v_total, 'selftest');
    BEGIN
      PERFORM public.freeze_funds_atomic(p_transaction_id := v_gtx, p_actor := v_seller, p_reason := 'selftest');
      v_res := 'FAILED_no_exception';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE 'missing_escrow_state%' THEN 'raised' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      'check', 'freeze_refuses_missing_escrow', 'pass', v_res = 'raised', 'detail', v_res);

    -- unfreeze_funds_atomic
    UPDATE public.transactions SET money_status = 'funds_frozen' WHERE id = v_gtx;
    BEGIN
      PERFORM public.unfreeze_funds_atomic(p_transaction_id := v_gtx, p_actor := v_seller,
        p_target := 'funds_held_in_escrow'::money_status, p_reason := 'selftest');
      v_res := 'FAILED_no_exception';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE 'missing_escrow_state%' THEN 'raised' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      'check', 'unfreeze_refuses_missing_escrow', 'pass', v_res = 'raised', 'detail', v_res);

    -- complete_payout_atomic: fund the ledger so the balance guard passes and
    -- the escrow-row guard is the thing under test.
    UPDATE public.transactions SET money_status = 'funds_held_in_escrow' WHERE id = v_gtx;
    PERFORM public.ledger_write_guarded(
      p_transaction_id := v_gtx, p_entry_type := 'escrow_hold'::escrow_ledger_entry_type,
      p_amount := v_item, p_currency := p_currency, p_reference_type := 'escrow',
      p_reference_id := v_gtx, p_notes := 'selftest hold', p_created_by := v_buyer,
      p_metadata := '{}'::jsonb,
      p_idempotency_key := 'selftest:hold:' || v_gtx::text,
      p_payload := jsonb_build_object('transaction_id', v_gtx::text, 'entry_type', 'escrow_hold',
        'amount_minor', round(v_item * 100)::bigint, 'currency', p_currency));

    INSERT INTO public.payouts(
      transaction_id, seller_id, amount, currency_code, status)
    VALUES (v_gtx, v_seller, v_item, p_currency, 'pending')
    RETURNING id INTO v_gpayout;
    BEGIN
      PERFORM public.complete_payout_atomic(p_payout_id := v_gpayout, p_amount := v_item,
        p_provider_event_id := 'selftest-evt-payout');
      v_res := 'FAILED_no_exception';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE 'missing_escrow_state%' THEN 'raised' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      'check', 'complete_payout_refuses_missing_escrow', 'pass', v_res = 'raised', 'detail', v_res);

    -- complete_refund_atomic
    INSERT INTO public.payments(
      transaction_id, provider, provider_reference, status, payment_method_type, currency_code, amount)
    VALUES (v_gtx, 'paystack', 'selftest3-' || v_gtx::text, 'succeeded', 'card', p_currency, v_total)
    RETURNING id INTO v_gpayment;
    INSERT INTO public.refunds(
      transaction_id, payment_id, buyer_id, refund_amount, currency_code, reason, status, provider)
    VALUES (v_gtx, v_gpayment, v_buyer, v_item, p_currency, 'selftest', 'pending', 'paystack')
    RETURNING id INTO v_grefund;
    BEGIN
      PERFORM public.complete_refund_atomic(p_refund_id := v_grefund, p_provider_event_id := 'selftest-evt-refund');
      v_res := 'FAILED_no_exception';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE 'missing_escrow_state%' THEN 'raised' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      'check', 'complete_refund_refuses_missing_escrow', 'pass', v_res = 'raised', 'detail', v_res);

    -- reverse_payout_atomic (only reaches the escrow write once released)
    UPDATE public.transactions SET money_status = 'funds_pending_release' WHERE id = v_gtx;
    UPDATE public.transactions SET money_status = 'funds_releasing' WHERE id = v_gtx;
    UPDATE public.transactions SET money_status = 'funds_released' WHERE id = v_gtx;
    BEGIN
      PERFORM public.reverse_payout_atomic(p_payout_id := v_gpayout, p_amount := v_item,
        p_reason := 'selftest', p_provider_event_id := 'selftest-evt-reverse');
      v_res := 'FAILED_no_exception';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE 'missing_escrow_state%' THEN 'raised' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      'check', 'reverse_payout_refuses_missing_escrow', 'pass', v_res = 'raised', 'detail', v_res);


    -- ── a negative refund is refused at both layers ─────────────────────────
    BEGIN
      PERFORM public.start_refund_atomic(
        p_transaction_id := v_tx2, p_amount := -1000, p_actor_user_id := v_buyer,
        p_reason := 'selftest', p_notes := 'negative amount must be refused');
      v_res := 'FAILED_no_exception';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE 'invalid_refund_amount%' THEN 'raised' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      'check', 'negative_refund_refused', 'pass', v_res = 'raised', 'detail', v_res);

    BEGIN
      INSERT INTO public.refunds(
        transaction_id, payment_id, buyer_id, refund_amount, currency_code, reason, status, provider)
      VALUES (v_tx, v_payment, v_buyer, -1000, p_currency, 'selftest', 'pending', 'paystack');
      v_res := 'FAILED_no_exception';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE '%refunds_refund_amount_positive%' THEN 'raised' ELSE SQLERRM END;
    END;
    v_checks := v_checks || jsonb_build_object(
      'check', 'refunds_check_constraint_rejects_negative', 'pass', v_res = 'raised', 'detail', v_res);

    -- ── resolve_dispute_atomic: real refund_buyer execution ─────────────────
    -- The escrow write in this function is only reachable when there IS an
    -- escrow row (it unwinds frozen funds), so the honest proof is execution
    -- plus the static guard scan below, not a missing-row scenario.
    INSERT INTO public.transactions(
      transaction_code, buyer_id, seller_id, created_by_user_id, status, money_status, share_token)
    VALUES ('SELFTEST4-' || substr(gen_random_uuid()::text, 1, 8), v_buyer, v_seller, v_seller,
      'payment_secured', 'funds_frozen', gen_random_uuid()::text)
    RETURNING id INTO v_dtx;
    INSERT INTO public.transaction_pricing(
      transaction_id, currency_code, item_amount, platform_fee_amount,
      payment_processing_fee_amount, seller_payout_amount, buyer_total_amount, pricing_model_version)
    VALUES (v_dtx, p_currency, v_item, v_platform, v_processing, v_item, v_total, 'selftest');
    INSERT INTO public.escrow_states(transaction_id, state, held_amount, frozen_amount)
    VALUES (v_dtx, 'frozen', 0, v_item);
    PERFORM public.ledger_write_guarded(
      p_transaction_id := v_dtx, p_entry_type := 'fee_record'::escrow_ledger_entry_type,
      p_amount := v_platform, p_currency := p_currency, p_reference_type := 'platform_fee',
      p_reference_id := v_dtx, p_notes := 'selftest fee', p_created_by := v_buyer,
      p_metadata := '{}'::jsonb,
      p_idempotency_key := 'selftest:fee:dispute:' || v_dtx::text,
      p_payload := jsonb_build_object('transaction_id', v_dtx::text, 'entry_type', 'fee_record',
        'amount_minor', round(v_platform * 100)::bigint, 'currency', p_currency));
    INSERT INTO public.payments(
      transaction_id, provider, provider_reference, status, payment_method_type, currency_code, amount)
    VALUES (v_dtx, 'paystack', 'selftest4-' || v_dtx::text, 'succeeded', 'card', p_currency, v_total);
    INSERT INTO public.disputes(transaction_id, opened_by_user_id, reason, description, status)
    VALUES (v_dtx, v_buyer, 'item_not_delivered'::dispute_reason_type, 'selftest', 'open')
    RETURNING id INTO v_dispute;
    BEGIN
      PERFORM public.resolve_dispute_atomic(
        p_dispute_id := v_dispute, p_actor := v_seller, p_outcome := 'refund_buyer'::dispute_outcome_type,
        p_refund_amount := v_item + v_platform, p_release_amount := 0, p_decision_summary := 'selftest',
        p_also_close_investigation := false, p_acknowledge_frozen_funds := true);
      v_res := 'ok';
    EXCEPTION WHEN others THEN
      v_res := SQLERRM;
    END;
    v_checks := v_checks || jsonb_build_object(
      'check', 'resolve_dispute_refund_buyer_executes', 'pass', v_res = 'ok', 'detail', v_res);
    v_checks := v_checks || jsonb_build_object(
      'check', 'dispute_refund_has_buyer',
      'pass', EXISTS (SELECT 1 FROM public.refunds
                       WHERE transaction_id = v_dtx AND buyer_id = v_buyer
                         AND refund_amount = v_item + v_platform));
    v_checks := v_checks || jsonb_build_object(
      'check', 'dispute_unwinds_frozen_escrow',
      'pass', (SELECT frozen_amount = 0 FROM public.escrow_states WHERE transaction_id = v_dtx));

    -- ── every escrow_states write in a money function carries a zero-row guard ─
    SELECT COALESCE(array_agg(proname ORDER BY proname), ARRAY[]::text[]) INTO v_positional
      FROM (
        SELECT p.proname,
               regexp_count(pg_get_functiondef(p.oid), 'UPDATE\s+public\.escrow_states') AS writes,
               regexp_count(pg_get_functiondef(p.oid),
                 'UPDATE\s+public\.escrow_states[^;]*;\s*GET DIAGNOSTICS[^;]*ROW_COUNT\s*;(.|\n){0,255}?missing_escrow_state') AS guards
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
           AND (p.proname LIKE '%\_atomic' OR p.proname = 'ledger_write_guarded')
      ) t
     WHERE writes > guards;
    v_checks := v_checks || jsonb_build_object(
      'check', 'all_escrow_writes_guarded', 'pass', array_length(v_positional, 1) IS NULL,
      'detail', to_jsonb(v_positional));

    -- ── positional-binding regression guard ─────────────────────────────────
    SELECT count(*) INTO v_overloads
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'ledger_write_guarded';
    v_checks := v_checks || jsonb_build_object(
      'check', 'ledger_write_guarded_single_overload', 'pass', v_overloads = 1, 'detail', v_overloads);

    SELECT count(*) INTO v_fee_overloads
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'ensure_platform_fee_reversal';
    v_checks := v_checks || jsonb_build_object(
      'check', 'ensure_platform_fee_reversal_single_overload', 'pass', v_fee_overloads = 1,
      'detail', v_fee_overloads);

    -- Generalised: no SECURITY DEFINER money function may be bound positionally
    -- by any other function. Positional binding is what caused the refund outage;
    -- the rule is the class, not the one function name.
    WITH callees AS (
      SELECT p.proname AS callee
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
         AND (p.proname LIKE '%\_atomic'
              OR p.proname IN ('ledger_write_guarded', 'ensure_platform_fee_reversal'))
    ), callers AS (
      SELECT p.proname AS caller, pg_get_functiondef(p.oid) AS src
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prokind = 'f'
    )
    SELECT COALESCE(array_agg(DISTINCT caller || '->' || callee), ARRAY[]::text[])
      INTO v_positional
      FROM callers, callees
     WHERE caller <> callee
       AND regexp_count(src, '\m' || callee || '\(\s*[^)[:space:]]')
         > regexp_count(src, '\m' || callee || '\(\s*p_\w+\s*:=');
    v_checks := v_checks || jsonb_build_object(
      'check', 'no_positional_money_binding', 'pass', array_length(v_positional, 1) IS NULL,
      'detail', to_jsonb(v_positional));

    RAISE EXCEPTION 'SELFTEST_ROLLBACK:%', jsonb_build_object(
      'ok', NOT (v_checks @> '[{"pass": false}]'::jsonb), 'checks', v_checks)::text;
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'SELFTEST_ROLLBACK:%' THEN
      RETURN substr(SQLERRM, 19)::jsonb;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'checks', v_checks);
  END;
END;
$function$
;
