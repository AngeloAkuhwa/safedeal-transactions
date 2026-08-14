CREATE OR REPLACE FUNCTION public.ledger_write_guarded(p_transaction_id uuid, p_entry_type escrow_ledger_entry_type, p_amount numeric, p_currency text, p_reference_type text, p_reference_id uuid, p_notes text, p_created_by uuid, p_metadata jsonb, p_idempotency_key text, p_payload jsonb, p_correlation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fp text;
  v_existing_fp text;
  v_existing_id uuid;
  v_id uuid;
  v_balance numeric;
BEGIN
  IF p_amount IS NULL OR NOT (p_amount = round(p_amount, 2)) THEN
    RAISE EXCEPTION 'invalid_money_amount:%', p_amount;
  END IF;
  IF p_amount = 'NaN'::numeric THEN
    RAISE EXCEPTION 'invalid_money_amount:NaN';
  END IF;
  -- The deepest money primitive never invents a currency. A caller that cannot
  -- state the currency of the movement is refused, not defaulted.
  IF p_currency IS NULL OR btrim(p_currency) = '' THEN
    RAISE EXCEPTION 'ledger_currency_missing:%', p_transaction_id;
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'missing_idempotency_key';
  END IF;

  v_fp := public.canonical_fingerprint_v1(p_payload);

  -- Every entry type that holds a position in the cash chain carries the
  -- resulting canonical balance, using the same arithmetic as
  -- escrow_canonical_balance(): holds and adjustments add, debits subtract.
  -- Intent markers (freeze_hold, payout_awaiting_release,
  -- dispute_release_approved_pending_admin_release, dispute_refund_reserved,
  -- fee_record, payment_credit) are not cash movements and stay NULL.
  IF p_entry_type IN ('escrow_hold'::escrow_ledger_entry_type,
                      'adjustment'::escrow_ledger_entry_type) THEN
    v_balance := round(public.escrow_canonical_balance(p_transaction_id) + p_amount, 2);
  ELSIF p_entry_type IN ('payout_debit'::escrow_ledger_entry_type,
                         'refund_debit'::escrow_ledger_entry_type) THEN
    v_balance := round(public.escrow_canonical_balance(p_transaction_id) - p_amount, 2);
  END IF;

  INSERT INTO public.escrow_ledger_entries(
    transaction_id, entry_type, amount, currency_code, reference_type, reference_id,
    notes, created_by_user_id, metadata, idempotency_key, payload_fingerprint, balance_after
  ) VALUES (
    p_transaction_id, p_entry_type, p_amount, upper(btrim(p_currency)), p_reference_type, p_reference_id,
    p_notes, p_created_by, p_metadata, p_idempotency_key, v_fp, v_balance
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'written', 'entry_id', v_id, 'fingerprint', v_fp);
  END IF;

  SELECT id, payload_fingerprint INTO v_existing_id, v_existing_fp
  FROM public.escrow_ledger_entries WHERE idempotency_key = p_idempotency_key;

  IF v_existing_fp = v_fp THEN
    RETURN jsonb_build_object('status', 'duplicate', 'entry_id', v_existing_id, 'fingerprint', v_fp);
  END IF;

  INSERT INTO public.financial_idempotency_conflicts(
    idempotency_key, existing_fingerprint, incoming_fingerprint,
    transaction_id, entry_type, correlation_id, actor_user_id
  ) VALUES (
    p_idempotency_key, v_existing_fp, v_fp, p_transaction_id, p_entry_type, p_correlation_id, p_created_by
  )
  ON CONFLICT (idempotency_key, existing_fingerprint, incoming_fingerprint)
  DO UPDATE SET last_seen = now(), occurrence_count = public.financial_idempotency_conflicts.occurrence_count + 1;

  RETURN jsonb_build_object('status', 'idempotency_conflict', 'entry_id', v_existing_id, 'correlation_id', p_correlation_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_adjustment_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Every cash movement holds a position in the running balance chain, so every
  -- cash movement must carry the resulting balance. These are exactly the four
  -- types escrow_canonical_balance() sums, and exactly the four ledger_write_guarded
  -- populates. Intent markers (freeze_hold, payout_awaiting_release,
  -- dispute_release_approved_pending_admin_release, dispute_refund_reserved,
  -- fee_record, payment_credit) move no cash and are therefore exempt.
  IF NEW.entry_type IN ('escrow_hold'::escrow_ledger_entry_type,
                        'adjustment'::escrow_ledger_entry_type,
                        'payout_debit'::escrow_ledger_entry_type,
                        'refund_debit'::escrow_ledger_entry_type)
     AND NEW.balance_after IS NULL THEN
    RAISE EXCEPTION 'cash_movement_requires_balance_after:%', NEW.entry_type;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_refund_atomic(p_transaction_id uuid, p_amount numeric, p_actor_user_id uuid, p_reason text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_money money_status; v_payment_id uuid; v_currency text; v_refund_id uuid;
  v_existing uuid; v_uncommitted numeric; v_buyer uuid;
BEGIN
  -- A refund is an outflow. A negative or non-finite amount would invert into an
  -- escrow credit downstream, so it is refused at the door.
  IF p_amount IS NULL OR p_amount = 'NaN'::numeric OR p_amount <= 0
     OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'invalid_refund_amount:%', p_amount;
  END IF;

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

  -- Check first, write second. The platform fee reversal is only booked when the
  -- request genuinely needs it, and the ceiling is re-checked afterwards.
  v_uncommitted := public.escrow_uncommitted_available(p_transaction_id, NULL, NULL);
  IF p_amount > v_uncommitted + 0.005 THEN
    PERFORM public.ensure_platform_fee_reversal(
      p_transaction_id  := p_transaction_id,
      p_required        := p_amount,
      p_actor_user_id   := p_actor_user_id,
      p_reference_type  := 'refund',
      p_reference_id    := v_payment_id
    );
    v_uncommitted := public.escrow_uncommitted_available(p_transaction_id, NULL, NULL);
    IF p_amount > v_uncommitted + 0.005 THEN
      RAISE EXCEPTION 'refund_exceeds_uncommitted_available: uncommitted=% requested=%', v_uncommitted, p_amount;
    END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.complete_payout_atomic(p_payout_id uuid, p_amount numeric, p_provider_event_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_escrow_rows int;
  v_tx_id uuid; v_seller_id uuid; v_currency text; v_status payout_status;
  v_old_money money_status; v_available numeric; v_res jsonb;
  v_existing_id uuid; v_existing_key text; v_existing_fp text; v_incoming_key text;
BEGIN
  IF p_provider_event_id IS NULL OR length(p_provider_event_id) < 3 THEN
    RAISE EXCEPTION 'missing_provider_event_id';
  END IF;
  IF p_amount IS NULL OR p_amount = 'NaN'::numeric OR p_amount <= 0
     OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'invalid_payout_amount:%', p_amount;
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
  GET DIAGNOSTICS v_escrow_rows = ROW_COUNT;
  IF v_escrow_rows = 0 THEN
    RAISE EXCEPTION 'missing_escrow_state:%', v_tx_id;
  END IF;

  IF v_currency IS NULL OR btrim(v_currency) = '' THEN
    RAISE EXCEPTION 'pricing_snapshot_missing_currency:%', v_tx_id;
  END IF;

  v_res := public.ledger_write_guarded(
    p_transaction_id := v_tx_id, 
    p_entry_type := 'payout_debit'::escrow_ledger_entry_type, 
    p_amount := p_amount, 
    p_currency := v_currency, 
    p_reference_type := 'payout', 
    p_reference_id := p_payout_id, 
    p_notes := 'transfer.success', 
    p_created_by := v_seller_id, 
    p_metadata := jsonb_build_object('provider_event_id', p_provider_event_id), 
    p_idempotency_key := v_incoming_key, 
    p_payload := jsonb_build_object('transaction_id', v_tx_id::text, 'payout_id', p_payout_id::text,
      'provider_event_id', p_provider_event_id, 'entry_type', 'payout_debit',
      'amount_minor', round(p_amount * 100)::bigint, 'currency', v_currency)
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

CREATE OR REPLACE FUNCTION public.complete_refund_atomic(p_refund_id uuid, p_provider_event_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_escrow_rows int;
  v_tx_id uuid; v_amount numeric; v_currency text; v_status refund_status;
  v_old_money money_status; v_partial_release numeric := 0; v_available numeric; v_res jsonb;
  v_existing_id uuid; v_existing_key text; v_existing_fp text; v_incoming_key text;
BEGIN
  IF p_provider_event_id IS NULL OR length(p_provider_event_id) < 3 THEN
    RAISE EXCEPTION 'missing_provider_event_id';
  END IF;

  SELECT transaction_id, refund_amount, currency_code, status
    INTO v_tx_id, v_amount, v_currency, v_status
  FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'refund_not_found'; END IF;

  IF v_status = 'completed'::refund_status THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  IF v_status NOT IN ('pending'::refund_status, 'processing'::refund_status) THEN
    RAISE EXCEPTION 'refund_not_eligible_for_completion:%', v_status;
  END IF;

  v_incoming_key := 'refund:complete:' || v_tx_id::text || ':' || p_refund_id::text
                    || '#' || p_provider_event_id || ':refund_debit';

  SELECT id, idempotency_key, payload_fingerprint
    INTO v_existing_id, v_existing_key, v_existing_fp
  FROM public.escrow_ledger_entries
  WHERE transaction_id = v_tx_id
    AND entry_type = 'refund_debit'::escrow_ledger_entry_type
    AND reference_type = 'refund' AND reference_id = p_refund_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL AND COALESCE(v_existing_key, '') <> v_incoming_key THEN
    INSERT INTO public.financial_idempotency_conflicts(
      idempotency_key, existing_fingerprint, incoming_fingerprint,
      transaction_id, entry_type
    ) VALUES (
      v_incoming_key, COALESCE(v_existing_fp, 'unknown'), 'alternate_provider_event',
      v_tx_id, 'refund_debit'::escrow_ledger_entry_type
    )
    ON CONFLICT (idempotency_key, existing_fingerprint, incoming_fingerprint)
    DO UPDATE SET last_seen = now(),
                  occurrence_count = public.financial_idempotency_conflicts.occurrence_count + 1;

    RETURN jsonb_build_object('ok', true, 'idempotent', true,
                              'reason', 'already_final_movement', 'entry_id', v_existing_id);
  END IF;

  v_available := public.escrow_available_balance(v_tx_id);
  IF v_amount > v_available + 0.005 THEN
    RAISE EXCEPTION 'refund_exceeds_escrow_balance: available=% requested=%', v_available, v_amount;
  END IF;

  UPDATE public.refunds SET status='completed', completed_at=now(), updated_at=now() WHERE id = p_refund_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  SELECT COALESCE(o.release_amount, 0) INTO v_partial_release
  FROM public.dispute_outcomes o
  JOIN public.disputes d ON d.id = o.dispute_id
  WHERE d.transaction_id = v_tx_id
    AND o.outcome_type = 'partial_refund_release'::dispute_outcome_type
  ORDER BY o.resolved_at DESC LIMIT 1;

  IF v_old_money = 'refund_pending'::money_status THEN
    IF COALESCE(v_partial_release, 0) > 0 THEN
      UPDATE public.transactions
        SET money_status = 'funds_pending_release', updated_at = now()
        WHERE id = v_tx_id;
      INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
      VALUES (v_tx_id, v_old_money, 'funds_pending_release', 'partial_dispute_refund_completed');

      UPDATE public.release_review_queue
        SET status = 'pending',
            notes = concat(COALESCE(notes,''), ' | refund completed; queued for admin release'),
            updated_at = now()
        WHERE transaction_id = v_tx_id
          AND queue_type = 'dispute_resolved_partial'
          AND status = 'held';
    ELSE
      UPDATE public.transactions
        SET money_status = 'refund_issued', status = 'refunded'::transaction_status, updated_at = now()
        WHERE id = v_tx_id;
      INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
      VALUES (v_tx_id, v_old_money, 'refund_issued', 'refund.processed');
    END IF;
  END IF;

  UPDATE public.escrow_states
  SET refunded_amount = refunded_amount + v_amount,
      held_amount = GREATEST(0, held_amount - v_amount),
      state = CASE WHEN COALESCE(v_partial_release,0) > 0 THEN 'held'::escrow_state ELSE 'refunded'::escrow_state END,
      last_changed_at = now(), updated_at = now()
  WHERE transaction_id = v_tx_id;
  GET DIAGNOSTICS v_escrow_rows = ROW_COUNT;
  IF v_escrow_rows = 0 THEN
    RAISE EXCEPTION 'missing_escrow_state:%', v_tx_id;
  END IF;

  IF v_amount IS NULL OR v_amount = 'NaN'::numeric OR v_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_refund_amount:%', v_amount;
  END IF;
  IF v_currency IS NULL OR btrim(v_currency) = '' THEN
    RAISE EXCEPTION 'pricing_snapshot_missing_currency:%', v_tx_id;
  END IF;

  v_res := public.ledger_write_guarded(
    p_transaction_id := v_tx_id, 
    p_entry_type := 'refund_debit'::escrow_ledger_entry_type, 
    p_amount := v_amount, 
    p_currency := v_currency, 
    p_reference_type := 'refund', 
    p_reference_id := p_refund_id, 
    p_notes := CASE WHEN COALESCE(v_partial_release,0) > 0 THEN 'refund.processed (partial dispute outcome)' ELSE 'refund.processed' END, 
    p_created_by := NULL, 
    p_metadata := jsonb_build_object('provider_event_id', p_provider_event_id), 
    p_idempotency_key := v_incoming_key, 
    p_payload := jsonb_build_object('transaction_id', v_tx_id::text, 'refund_id', p_refund_id::text,
      'provider_event_id', p_provider_event_id, 'entry_type', 'refund_debit',
      'amount_minor', round(v_amount * 100)::bigint, 'currency', v_currency)
  );
  IF (v_res ->> 'status') = 'idempotency_conflict' THEN
    RAISE EXCEPTION 'idempotency_conflict_refund_complete:%', p_refund_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'partial_release_pending', COALESCE(v_partial_release,0) > 0, 'ledger', v_res ->> 'status');
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_payout_atomic(p_payout_id uuid, p_amount numeric, p_reason text, p_provider_event_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_escrow_rows int;
  v_tx_id uuid; v_currency text; v_status payout_status; v_old_money money_status; v_res jsonb;
BEGIN
  IF p_provider_event_id IS NULL OR length(p_provider_event_id) < 3 THEN
    RAISE EXCEPTION 'missing_provider_event_id';
  END IF;
  IF p_amount IS NULL OR p_amount = 'NaN'::numeric OR p_amount <= 0
     OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'invalid_reversal_amount:%', p_amount;
  END IF;

  SELECT transaction_id, currency_code, status INTO v_tx_id, v_currency, v_status
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF v_status = 'reversed'::payout_status THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.payouts
  SET status = 'reversed'::payout_status,
      failure_reason = concat('reversed: ', p_reason),
      last_release_error = concat('reversed: ', p_reason),
      retry_allowed = false,
      updated_at = now()
  WHERE id = p_payout_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  IF v_old_money = 'funds_released'::money_status THEN
    IF v_currency IS NULL OR btrim(v_currency) = '' THEN
      RAISE EXCEPTION 'pricing_snapshot_missing_currency:%', v_tx_id;
    END IF;
    v_res := public.ledger_write_guarded(
    p_transaction_id := v_tx_id, 
    p_entry_type := 'adjustment'::escrow_ledger_entry_type, 
    p_amount := -p_amount, 
    p_currency := v_currency, 
    p_reference_type := 'payout_reversal', 
    p_reference_id := p_payout_id, 
    p_notes := concat('transfer.reversed: ', p_reason), 
    p_created_by := NULL, 
    p_metadata := jsonb_build_object('provider_event_id', p_provider_event_id, 'reason', p_reason), 
    p_idempotency_key := 'payout:reverse:' || v_tx_id::text || ':' || p_payout_id::text || '#' || p_provider_event_id || ':adjustment', 
    p_payload := jsonb_build_object('transaction_id', v_tx_id::text, 'payout_id', p_payout_id::text,
        'provider_event_id', p_provider_event_id, 'entry_type', 'adjustment', 'operation', 'payout_reversal',
        'amount_minor', round(-p_amount * 100)::bigint, 'currency', v_currency)
  );
    IF (v_res ->> 'status') = 'idempotency_conflict' THEN
      RAISE EXCEPTION 'idempotency_conflict_payout_reverse:%', p_payout_id;
    END IF;

    UPDATE public.escrow_states
    SET released_amount = GREATEST(0, released_amount - p_amount),
        frozen_amount = frozen_amount + p_amount,
        state = 'frozen'::escrow_state,
        last_changed_at = now(), updated_at = now()
    WHERE transaction_id = v_tx_id;
    GET DIAGNOSTICS v_escrow_rows = ROW_COUNT;
    IF v_escrow_rows = 0 THEN
      RAISE EXCEPTION 'missing_escrow_state:%', v_tx_id;
    END IF;

    UPDATE public.transactions SET money_status = 'funds_frozen', updated_at = now() WHERE id = v_tx_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'funds_frozen', concat('transfer_reversed:', p_reason));
  ELSIF v_old_money = 'funds_releasing'::money_status THEN
    UPDATE public.transactions SET money_status = 'funds_pending_release', updated_at = now() WHERE id = v_tx_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'funds_pending_release', concat('reversed:', p_reason));
  END IF;

  UPDATE public.transactions
  SET needs_release_review = true, release_review_reason = 'transfer_reversed', updated_at = now()
  WHERE id = v_tx_id;

  UPDATE public.release_review_queue
  SET status = 'failed', notes = concat('reversed: ', p_reason), updated_at = now()
  WHERE transaction_id = v_tx_id AND status IN ('processing','claimed','pending','released');

  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.freeze_funds_atomic(p_transaction_id uuid, p_actor uuid, p_reason text)
 RETURNS money_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_escrow_rows int;
  v_cycle bigint;
  v_lres jsonb;
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
  GET DIAGNOSTICS v_escrow_rows = ROW_COUNT;
  IF v_escrow_rows = 0 THEN
    RAISE EXCEPTION 'missing_escrow_state:%', p_transaction_id;
  END IF;

  UPDATE public.transactions
     SET money_status = v_new,
         needs_release_review = true,
         release_review_reason = COALESCE(p_reason, 'manual_hold'),
         updated_at = now()
   WHERE id = p_transaction_id;

  INSERT INTO public.money_status_history (transaction_id, old_status, new_status, changed_by_user_id, reason, changed_at)
  VALUES (p_transaction_id, v_old, v_new, p_actor, COALESCE(p_reason, 'manual_hold'), now());

  v_cycle := (SELECT count(*) FROM public.money_status_history h
                WHERE h.transaction_id = p_transaction_id AND h.new_status = 'funds_frozen'::money_status);
  IF v_currency IS NULL OR btrim(v_currency) = '' THEN
    RAISE EXCEPTION 'pricing_snapshot_missing_currency:%', p_transaction_id;
  END IF;

  v_lres := public.ledger_write_guarded(
    p_transaction_id := p_transaction_id, 
    p_entry_type := 'freeze_hold'::escrow_ledger_entry_type, 
    p_amount := COALESCE(v_held, 0), 
    p_currency := v_currency, 
    p_reference_type := 'admin_freeze', 
    p_reference_id := p_transaction_id, 
    p_notes := concat('Funds frozen by admin. Reason: ', COALESCE(p_reason, '')), 
    p_created_by := p_actor, 
    p_metadata := jsonb_build_object('admin_freeze', true, 'from_bucket', 'held', 'to_bucket', 'frozen',
      'moved_amount', COALESCE(v_held, 0), 'balance_after_held', 0,
      'balance_after_frozen', COALESCE(v_frozen_after, 0),
      'source_money_status', v_old::text, 'target_money_status', v_new::text, 'reason', p_reason), 
    p_idempotency_key := 'admin:freeze:' || p_transaction_id::text || ':cycle' || v_cycle::text || ':freeze_hold', 
    p_payload := jsonb_build_object('transaction_id', p_transaction_id::text, 'operation', 'admin_freeze',
      'cycle', v_cycle, 'entry_type', 'freeze_hold',
      'amount_minor', round(COALESCE(v_held, 0) * 100)::bigint, 'currency', v_currency)
  );
  IF (v_lres ->> 'status') = 'idempotency_conflict' THEN
    RAISE EXCEPTION 'idempotency_conflict_admin_freeze:%', p_transaction_id;
  END IF;

  RETURN v_new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unfreeze_funds_atomic(p_transaction_id uuid, p_actor uuid, p_target money_status, p_reason text)
 RETURNS money_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_escrow_rows int;
  v_cycle bigint;
  v_lres jsonb;
  v_old money_status;
  v_frozen numeric;
  v_held_after numeric;
  v_currency text;
  v_has_dispute boolean;
  v_has_investigation boolean;
  v_dispute_overdue boolean;
  v_admin_review_reason text;
  v_admin_review_needed boolean;
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
         frozen_amount = 0,
         state = 'held'::escrow_state,
         last_changed_at = now(),
         updated_at = now()
   WHERE transaction_id = p_transaction_id
   RETURNING held_amount INTO v_held_after;
  GET DIAGNOSTICS v_escrow_rows = ROW_COUNT;
  IF v_escrow_rows = 0 THEN
    RAISE EXCEPTION 'missing_escrow_state:%', p_transaction_id;
  END IF;

  -- Compute admin review status
  SELECT EXISTS (
    SELECT 1 FROM public.disputes
    WHERE transaction_id = p_transaction_id
      AND status IN ('open','seller_response_pending','under_review')
  ) INTO v_has_dispute;

  SELECT EXISTS (
    SELECT 1 FROM public.admin_investigations
    WHERE transaction_id = p_transaction_id
      AND status IN ('open','under_review','escalated')
  ) INTO v_has_investigation;

  SELECT EXISTS (
    SELECT 1 FROM public.disputes d
    WHERE d.transaction_id = p_transaction_id
      AND d.seller_response_due_at IS NOT NULL
      AND d.seller_response_due_at < now()
      AND d.status IN ('open','seller_response_pending')
  ) INTO v_dispute_overdue;

  v_admin_review_reason := CASE
    WHEN v_has_dispute THEN 'dispute_open'
    WHEN v_has_investigation THEN 'investigation_open'
    WHEN v_dispute_overdue THEN 'dispute_response_overdue'
    ELSE NULL
  END;
  v_admin_review_needed := v_admin_review_reason IS NOT NULL;

  UPDATE public.transactions
     SET money_status = p_target,
         needs_release_review = false,
         release_review_reason = NULL,
         needs_admin_review = v_admin_review_needed,
         admin_review_reason = v_admin_review_reason,
         updated_at = now()
   WHERE id = p_transaction_id;

  INSERT INTO public.money_status_history(
    transaction_id, old_status, new_status, changed_by_user_id, reason
  ) VALUES (
    p_transaction_id, v_old, p_target, p_actor, COALESCE(p_reason, 'admin_unfreeze')
  );

  v_cycle := (SELECT count(*) FROM public.money_status_history h
                WHERE h.transaction_id = p_transaction_id AND h.new_status = p_target);
  IF v_currency IS NULL OR btrim(v_currency) = '' THEN
    RAISE EXCEPTION 'pricing_snapshot_missing_currency:%', p_transaction_id;
  END IF;

  v_lres := public.ledger_write_guarded(
    p_transaction_id := p_transaction_id, 
    p_entry_type := 'adjustment'::escrow_ledger_entry_type, 
    p_amount := COALESCE(v_frozen, 0), 
    p_currency := v_currency, 
    p_reference_type := 'admin_unfreeze', 
    p_reference_id := p_transaction_id, 
    p_notes := concat('Funds unfrozen by admin to ', p_target::text, ' escrow. Reason: ', COALESCE(p_reason, '')), 
    p_created_by := p_actor, 
    p_metadata := jsonb_build_object('admin_unfreeze', true, 'from_bucket', 'frozen', 'to_bucket', 'held',
      'moved_amount', COALESCE(v_frozen, 0), 'balance_after_held', COALESCE(v_held_after, 0),
      'balance_after_frozen', 0, 'target_money_status', p_target::text, 'reason', p_reason), 
    p_idempotency_key := 'admin:unfreeze:' || p_transaction_id::text || ':cycle' || v_cycle::text || ':adjustment', 
    p_payload := jsonb_build_object('transaction_id', p_transaction_id::text, 'operation', 'admin_unfreeze',
      'cycle', v_cycle, 'entry_type', 'adjustment',
      'amount_minor', round(COALESCE(v_frozen, 0) * 100)::bigint, 'currency', v_currency)
  );
  IF (v_lres ->> 'status') = 'idempotency_conflict' THEN
    RAISE EXCEPTION 'idempotency_conflict_admin_unfreeze:%', p_transaction_id;
  END IF;

  RETURN p_target;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_financial_remediation_atomic(p_finding_key text, p_transaction_id uuid, p_rule_code text, p_reason_code text, p_expected_before numeric, p_adjustment numeric, p_expected_after numeric, p_evidence jsonb DEFAULT '{}'::jsonb, p_actor_user_id uuid DEFAULT NULL::uuid, p_correlation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing public.financial_remediations%ROWTYPE;
  v_current numeric;
  v_after numeric;
  v_idem text;
  v_write jsonb;
  v_entry_id uuid;
  v_currency text;
BEGIN
  IF p_finding_key IS NULL OR length(p_finding_key) < 8 THEN
    RAISE EXCEPTION 'invalid_finding_key';
  END IF;
  IF p_adjustment IS NULL OR p_adjustment = 0 OR p_adjustment <> round(p_adjustment, 2) THEN
    RAISE EXCEPTION 'invalid_adjustment_amount:%', p_adjustment;
  END IF;
  IF round(p_expected_before + p_adjustment, 2) <> round(p_expected_after, 2) THEN
    RAISE EXCEPTION 'inconsistent_expected_after';
  END IF;

  SELECT * INTO v_existing FROM public.financial_remediations WHERE finding_key = p_finding_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'already_applied',
      'remediation_id', v_existing.id,
      'ledger_entry_id', v_existing.ledger_entry_id,
      'before_balance', v_existing.before_balance,
      'after_balance', v_existing.after_balance
    );
  END IF;

  PERFORM 1 FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  v_current := public.escrow_canonical_balance(p_transaction_id);
  IF round(v_current, 2) <> round(p_expected_before, 2) THEN
    RAISE EXCEPTION 'state_fingerprint_mismatch: expected % got %', p_expected_before, v_current;
  END IF;

  SELECT currency_code INTO v_currency
    FROM public.transaction_pricing WHERE transaction_id = p_transaction_id LIMIT 1;
  IF v_currency IS NULL OR btrim(v_currency) = '' THEN
    RAISE EXCEPTION 'pricing_snapshot_missing_currency:%', p_transaction_id;
  END IF;

  v_idem := 'remediation:v1:' || p_finding_key;

  v_write := public.ledger_write_guarded(
    p_transaction_id := p_transaction_id,
    p_entry_type     := 'adjustment'::escrow_ledger_entry_type,
    p_amount         := p_adjustment,
    p_currency       := v_currency,
    p_reference_type := 'remediation',
    p_reference_id   := NULL,
    p_notes          := 'Correction 1 remediation: ' || p_reason_code,
    p_created_by     := p_actor_user_id,
    p_metadata       := jsonb_build_object(
                          'finding_key', p_finding_key,
                          'rule_code', p_rule_code,
                          'reason_code', p_reason_code,
                          'before_balance', p_expected_before,
                          'after_balance', p_expected_after
                        ),
    p_idempotency_key := v_idem,
    -- Canonical payloads carry money as integer minor units (kobo).
    p_payload        := jsonb_build_object(
                          'finding_key', p_finding_key,
                          'transaction_id', p_transaction_id::text,
                          'adjustment_minor', round(p_adjustment * 100)::bigint,
                          'expected_before_minor', round(p_expected_before * 100)::bigint,
                          'expected_after_minor', round(p_expected_after * 100)::bigint
                        ),
    p_correlation_id := p_correlation_id
  );

  IF (v_write->>'status') = 'idempotency_conflict' THEN
    RAISE EXCEPTION 'remediation_idempotency_conflict';
  END IF;
  v_entry_id := (v_write->>'entry_id')::uuid;

  v_after := public.escrow_canonical_balance(p_transaction_id);
  IF round(v_after, 2) <> round(p_expected_after, 2) THEN
    RAISE EXCEPTION 'post_state_mismatch: expected % got %', p_expected_after, v_after;
  END IF;

  INSERT INTO public.financial_remediations(
    finding_key, transaction_id, rule_code, reason_code,
    before_balance, adjustment_amount, after_balance,
    ledger_entry_id, idempotency_key, evidence, actor_user_id, correlation_id
  ) VALUES (
    p_finding_key, p_transaction_id, p_rule_code, p_reason_code,
    p_expected_before, p_adjustment, v_after,
    v_entry_id, v_idem, COALESCE(p_evidence, '{}'::jsonb), p_actor_user_id, p_correlation_id
  );

  RETURN jsonb_build_object(
    'status', 'applied',
    'ledger_entry_id', v_entry_id,
    'idempotency_key', v_idem,
    'before_balance', p_expected_before,
    'after_balance', v_after
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_completion_release_intent_atomic(p_transaction_id uuid, p_actor uuid, p_confirmation_id uuid, p_payout_id uuid, p_amount numeric, p_currency text, p_entry_type escrow_ledger_entry_type DEFAULT 'payout_awaiting_release'::escrow_ledger_entry_type, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_res jsonb; v_open integer;
BEGIN
  IF p_entry_type NOT IN ('payout_awaiting_release', 'dispute_release_approved_pending_admin_release') THEN
    RAISE EXCEPTION 'invalid_commitment_entry_type:%', p_entry_type;
  END IF;
  IF p_confirmation_id IS NULL THEN RAISE EXCEPTION 'missing_confirmation_id'; END IF;
  IF p_amount IS NULL OR p_amount = 'NaN'::numeric OR p_amount <= 0
     OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'invalid_commitment_amount:%', p_amount;
  END IF;
  IF p_currency IS NULL OR btrim(p_currency) = '' THEN
    RAISE EXCEPTION 'pricing_snapshot_missing_currency:%', p_transaction_id;
  END IF;

  PERFORM 1 FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;

  -- at most one open commitment per payout
  SELECT count(*) INTO v_open
  FROM public.escrow_ledger_entries e
  WHERE e.transaction_id = p_transaction_id
    AND e.entry_type IN ('payout_awaiting_release','dispute_release_approved_pending_admin_release')
    AND (p_payout_id IS NULL OR e.reference_id = p_payout_id);

  IF v_open > 0 THEN
    RETURN jsonb_build_object('ok', true, 'status', 'commitment_exists');
  END IF;

  v_res := public.ledger_write_guarded(
    p_transaction_id := p_transaction_id, 
    p_entry_type := p_entry_type, 
    p_amount := p_amount, 
    p_currency := p_currency, 
    p_reference_type := 'payout', 
    p_reference_id := p_payout_id, 
    p_notes := COALESCE(p_notes, 'Both parties confirmed. Commitment recorded; no funds transferred.'), 
    p_created_by := p_actor, 
    p_metadata := jsonb_build_object('confirmation_id', p_confirmation_id), 
    p_idempotency_key := 'release:intent:' || p_transaction_id::text || ':' || p_confirmation_id::text || ':' || p_entry_type::text, 
    p_payload := jsonb_build_object('transaction_id', p_transaction_id::text, 'confirmation_id', p_confirmation_id::text,
      'payout_id', COALESCE(p_payout_id::text, ''), 'entry_type', p_entry_type::text,
      'amount_minor', round(p_amount * 100)::bigint, 'currency', p_currency)
  );

  IF (v_res ->> 'status') = 'idempotency_conflict' THEN
    RAISE EXCEPTION 'idempotency_conflict_release_intent:%', p_confirmation_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', v_res ->> 'status');
END;
$function$;
