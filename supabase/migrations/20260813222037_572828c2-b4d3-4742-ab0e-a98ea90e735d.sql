-- 1) Reusable, idempotent platform-fee reversal into the escrow-available pool.
CREATE OR REPLACE FUNCTION public.ensure_platform_fee_reversal(
  p_transaction_id uuid,
  p_required numeric,
  p_actor_user_id uuid,
  p_reference_type text DEFAULT 'refund',
  p_reference_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_excess numeric;
  v_fee numeric;
  v_reversed numeric;
  v_remaining numeric;
  v_currency text;
  v_seq int;
  v_key text;
BEGIN
  IF p_required IS NULL OR p_required <= 0 THEN RETURN 0; END IF;

  v_available := public.escrow_available_balance(p_transaction_id);
  IF p_required <= v_available + 0.005 THEN RETURN 0; END IF;

  v_excess := round(p_required - v_available, 2);

  SELECT COALESCE(SUM(amount), 0) INTO v_fee
  FROM public.escrow_ledger_entries
  WHERE transaction_id = p_transaction_id
    AND entry_type = 'fee_record'::escrow_ledger_entry_type
    AND reference_type = 'platform_fee';

  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_reversed, v_seq
  FROM public.escrow_ledger_entries
  WHERE transaction_id = p_transaction_id
    AND entry_type = 'adjustment'::escrow_ledger_entry_type
    AND reference_type = 'platform_fee_reversal';

  v_remaining := round(COALESCE(v_fee, 0) - COALESCE(v_reversed, 0), 2);

  -- Cannot refund more than item + platform fee out of escrow.
  IF v_remaining <= 0 OR v_excess > v_remaining + 0.005 THEN
    RETURN 0;
  END IF;

  v_excess := LEAST(v_excess, v_remaining);

  SELECT COALESCE(currency_code, 'NGN') INTO v_currency
  FROM public.transaction_pricing WHERE transaction_id = p_transaction_id;

  v_key := 'escrow:platform_fee_reversal:' || p_transaction_id::text || ':' || (v_seq + 1)::text;

  PERFORM public.ledger_write_guarded(
    p_transaction_id,
    'adjustment'::escrow_ledger_entry_type,
    v_excess,
    COALESCE(v_currency, 'NGN'),
    'platform_fee_reversal',
    p_reference_id,
    'SafeDeal platform fee reversed into escrow for buyer refund',
    p_actor_user_id,
    jsonb_build_object(
      'operation', 'platform_fee_reversal_for_refund',
      'required', p_required,
      'available_before', v_available,
      'platform_fee_booked', v_fee,
      'context', p_reference_type
    ),
    v_key,
    jsonb_build_object(
      'transaction_id', p_transaction_id::text,
      'entry_type', 'adjustment',
      'operation', 'platform_fee_reversal_for_refund',
      'sequence', v_seq + 1,
      'amount_minor', round(v_excess * 100)::bigint,
      'currency', COALESCE(v_currency, 'NGN')
    )
  );

  RETURN v_excess;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_platform_fee_reversal(uuid, numeric, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_platform_fee_reversal(uuid, numeric, uuid, text, uuid) TO service_role;

-- 2) start_refund_atomic: reverse the platform fee before the availability check.
CREATE OR REPLACE FUNCTION public.start_refund_atomic(p_transaction_id uuid, p_amount numeric, p_actor_user_id uuid, p_reason text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_money money_status; v_payment_id uuid; v_currency text; v_refund_id uuid;
  v_existing uuid; v_uncommitted numeric;
BEGIN
  SELECT money_status, currency_code INTO v_old_money, v_currency
  FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;

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
  SET status = 'cancelled', notes = 'refunded by SafeDeal review', updated_at = now()
  WHERE transaction_id = p_transaction_id AND status IN ('awaiting_release','blocked');

  UPDATE public.release_review_queue
  SET status = 'refunded', resolved_at = now(), updated_at = now()
  WHERE transaction_id = p_transaction_id AND status IN ('pending','claimed','processing','failed');

  INSERT INTO public.admin_actions(admin_user_id, transaction_id, action_type, action_notes)
  VALUES (p_actor_user_id, p_transaction_id, 'refund_buyer', concat(p_reason, ' / ', COALESCE(p_notes,'')));

  RETURN v_refund_id;
END;
$function$;

-- 3) resolve_dispute_atomic (8-arg): refund ceiling = escrow available + booked platform fee.
CREATE OR REPLACE FUNCTION public.resolve_dispute_atomic(p_dispute_id uuid, p_actor uuid, p_outcome dispute_outcome_type, p_refund_amount numeric, p_release_amount numeric, p_decision_summary text, p_also_close_investigation boolean DEFAULT false, p_acknowledge_frozen_funds boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
  v_currency := COALESCE(v_currency, 'NGN');

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

    SELECT (public.ledger_write_guarded(
      v_tx_id, 'adjustment'::escrow_ledger_entry_type, v_frozen, v_currency,
      'dispute_unfreeze', p_dispute_id,
      'Frozen funds unwound for dispute resolution',
      p_actor,
      jsonb_build_object('from_bucket','frozen','to_bucket','held','moved_amount', v_frozen,
                         'reason','dispute_resolve_unfreeze_bridge'),
      'dispute:unfreeze:' || v_tx_id::text || ':' || p_dispute_id::text || ':adjustment',
      jsonb_build_object('transaction_id', v_tx_id::text, 'dispute_id', p_dispute_id::text,
        'entry_type', 'adjustment', 'operation', 'dispute_unfreeze',
        'amount_minor', round(v_frozen * 100)::bigint, 'currency', COALESCE(v_currency,'NGN'))
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
      v_tx_id, v_refund_qty + v_release_qty, p_actor, 'dispute', p_dispute_id
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
      transaction_id, payment_id, refund_amount, currency_code,
      reason, notes, status, initiated_by_user_id, provider
    ) VALUES (
      v_tx_id, v_payment_id, v_refund_qty, v_currency,
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
      v_tx_id, 'dispute_refund_reserved'::escrow_ledger_entry_type, -v_refund_qty, v_currency,
      'dispute', p_dispute_id,
      concat('Refund reserved for dispute outcome ', p_outcome::text),
      p_actor,
      jsonb_build_object('dispute_id', p_dispute_id, 'refund_id', v_refund_id,
        'amount', v_refund_qty, 'outcome', p_outcome::text),
      'dispute:refund_reserved:' || v_tx_id::text || ':' || p_dispute_id::text || ':dispute_refund_reserved',
      jsonb_build_object('transaction_id', v_tx_id::text, 'dispute_id', p_dispute_id::text,
        'entry_type', 'dispute_refund_reserved', 'operation', 'dispute_refund_reserved',
        'amount_minor', round(-v_refund_qty * 100)::bigint, 'currency', COALESCE(v_currency,'NGN')));
    v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);

    IF p_outcome = 'partial_refund_release' THEN
      PERFORM public.ledger_write_guarded(
      v_tx_id, 'dispute_release_approved_pending_admin_release'::escrow_ledger_entry_type, v_release_qty, v_currency,
      'dispute', p_dispute_id,
      concat('Release approved pending admin release. Outcome: ', p_outcome::text),
      p_actor,
      jsonb_build_object('dispute_id', p_dispute_id, 'amount', v_release_qty, 'outcome', p_outcome::text),
      'dispute:release_approved:' || v_tx_id::text || ':' || p_dispute_id::text || ':dispute_release_approved_pending_admin_release',
      jsonb_build_object('transaction_id', v_tx_id::text, 'dispute_id', p_dispute_id::text,
        'entry_type', 'dispute_release_approved_pending_admin_release', 'operation', 'dispute_release_approved',
        'amount_minor', round(v_release_qty * 100)::bigint, 'currency', COALESCE(v_currency,'NGN')));
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
      v_tx_id, 'dispute_release_approved_pending_admin_release'::escrow_ledger_entry_type, v_release_qty, v_currency,
      'dispute', p_dispute_id,
      concat('Release approved pending admin release. Outcome: ', p_outcome::text),
      p_actor,
      jsonb_build_object('dispute_id', p_dispute_id, 'amount', v_release_qty, 'outcome', p_outcome::text),
      'dispute:release_approved:' || v_tx_id::text || ':' || p_dispute_id::text || ':dispute_release_approved_pending_admin_release',
      jsonb_build_object('transaction_id', v_tx_id::text, 'dispute_id', p_dispute_id::text,
        'entry_type', 'dispute_release_approved_pending_admin_release', 'operation', 'dispute_release_approved',
        'amount_minor', round(v_release_qty * 100)::bigint, 'currency', COALESCE(v_currency,'NGN')));
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
      v_tx_id, 'dispute_no_action'::escrow_ledger_entry_type, 0, v_currency,
      'dispute', p_dispute_id,
      'Dispute closed without money movement',
      p_actor,
      jsonb_build_object('dispute_id', p_dispute_id, 'outcome', p_outcome::text,
        'money_status_at_close', v_old_money::text),
      'dispute:no_action:' || v_tx_id::text || ':' || p_dispute_id::text || ':dispute_no_action',
      jsonb_build_object('transaction_id', v_tx_id::text, 'dispute_id', p_dispute_id::text,
        'entry_type', 'dispute_no_action', 'operation', 'dispute_no_action',
        'amount_minor', 0, 'currency', COALESCE(v_currency,'NGN')));
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
$function$;