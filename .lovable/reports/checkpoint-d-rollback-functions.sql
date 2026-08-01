CREATE OR REPLACE FUNCTION public.complete_payout_atomic(p_payout_id uuid, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid;
  v_seller_id uuid;
  v_currency text;
  v_old_money money_status;
  v_available numeric;
BEGIN
  SELECT transaction_id, seller_id, currency_code INTO v_tx_id, v_seller_id, v_currency
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;

  IF v_tx_id IS NULL THEN
    RAISE EXCEPTION 'payout_not_found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.payouts WHERE id = p_payout_id AND status = 'completed') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  -- Never move more than escrow actually holds for this transaction.
  v_available := public.escrow_available_balance(v_tx_id);
  IF p_amount > v_available + 0.01 THEN
    RAISE EXCEPTION 'payout_exceeds_escrow_balance: available=% requested=%', v_available, p_amount;
  END IF;

  UPDATE public.payouts
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_payout_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  IF v_old_money = 'funds_releasing'::money_status THEN
    UPDATE public.transactions
    SET money_status = 'funds_released',
        release_completed_at = now(),
        updated_at = now()
    WHERE id = v_tx_id;

    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'funds_released', 'transfer_success_webhook');
  END IF;

  UPDATE public.escrow_states
  SET released_amount = released_amount + p_amount,
      held_amount = GREATEST(0, held_amount - p_amount),
      state = 'released_to_seller'::escrow_state,
      last_changed_at = now(),
      updated_at = now()
  WHERE transaction_id = v_tx_id;

  INSERT INTO public.escrow_ledger_entries(
    transaction_id, entry_type, amount, currency_code, reference_type, reference_id, notes
  ) VALUES (
    v_tx_id, 'payout_debit', p_amount, COALESCE(v_currency, 'NGN'),
    'payout', p_payout_id, 'transfer.success'
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.release_review_queue
  SET status = 'released',
      resolved_at = now(),
      updated_at = now()
  WHERE transaction_id = v_tx_id AND status IN ('processing','claimed','pending');

  RETURN jsonb_build_object('ok', true);
END;
$function$


-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.complete_refund_atomic(p_refund_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid;
  v_amount numeric;
  v_currency text;
  v_old_money money_status;
  v_partial_release numeric := 0;
BEGIN
  SELECT transaction_id, refund_amount, currency_code INTO v_tx_id, v_amount, v_currency
  FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'refund_not_found'; END IF;

  IF EXISTS (SELECT 1 FROM public.refunds WHERE id = p_refund_id AND status = 'completed') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.refunds SET status='completed', completed_at=now(), updated_at=now() WHERE id = p_refund_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  -- Detect partial dispute outcome
  SELECT COALESCE(o.release_amount, 0)
    INTO v_partial_release
  FROM public.dispute_outcomes o
  JOIN public.disputes d ON d.id = o.dispute_id
  WHERE d.transaction_id = v_tx_id
    AND o.outcome_type = 'partial_refund_release'::dispute_outcome_type
  ORDER BY o.resolved_at DESC LIMIT 1;

  IF v_old_money = 'refund_pending'::money_status THEN
    IF COALESCE(v_partial_release, 0) > 0 THEN
      -- Partial: bridge back to funds_pending_release so central release workflow can pay seller
      UPDATE public.transactions
        SET money_status = 'funds_pending_release',
            status = CASE WHEN status = 'resolved' THEN status ELSE status END,
            updated_at = now()
        WHERE id = v_tx_id;
      INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
      VALUES (v_tx_id, v_old_money, 'funds_pending_release', 'partial_dispute_refund_completed');

      -- Activate held queue row(s)
      UPDATE public.release_review_queue
        SET status = 'pending',
            notes = concat(COALESCE(notes,''), ' | refund completed; queued for admin release'),
            updated_at = now()
        WHERE transaction_id = v_tx_id
          AND queue_type = 'dispute_resolved_partial'
          AND status = 'held';
    ELSE
      UPDATE public.transactions
        SET money_status = 'refund_issued',
            status = 'refunded'::transaction_status,
            updated_at = now()
        WHERE id = v_tx_id;
      INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
      VALUES (v_tx_id, v_old_money, 'refund_issued', 'refund.processed');
    END IF;
  END IF;

  UPDATE public.escrow_states
  SET refunded_amount = refunded_amount + v_amount,
      held_amount = GREATEST(0, held_amount - v_amount),
      state = CASE WHEN COALESCE(v_partial_release,0) > 0 THEN 'held'::escrow_state ELSE 'refunded'::escrow_state END,
      last_changed_at = now(),
      updated_at = now()
  WHERE transaction_id = v_tx_id;

  INSERT INTO public.escrow_ledger_entries(
    transaction_id, entry_type, amount, currency_code, reference_type, reference_id, notes
  ) VALUES (
    v_tx_id, 'refund_debit', v_amount, COALESCE(v_currency,'NGN'),
    'refund', p_refund_id,
    CASE WHEN COALESCE(v_partial_release,0) > 0 THEN 'refund.processed (partial dispute outcome)' ELSE 'refund.processed' END
  );

  RETURN jsonb_build_object('ok', true, 'partial_release_pending', COALESCE(v_partial_release,0) > 0);
END;
$function$


-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.escrow_available_balance(_transaction_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(
    CASE e.entry_type
      WHEN 'escrow_hold' THEN e.amount
      WHEN 'payout_debit' THEN -e.amount
      WHEN 'refund_debit' THEN -e.amount
      WHEN 'adjustment' THEN e.amount
      ELSE 0
    END
  ), 0)::numeric
  FROM public.escrow_ledger_entries e
  WHERE e.transaction_id = _transaction_id
$function$


-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.fail_payout_atomic(p_payout_id uuid, p_reason text, p_max_retries integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid;
  v_old_money money_status;
  v_new_count integer;
BEGIN
  SELECT transaction_id INTO v_tx_id FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;

  UPDATE public.payouts
  SET status = 'failed',
      failed_at = now(),
      failure_reason = p_reason,
      last_release_error = p_reason,
      last_release_attempt_at = now(),
      failed_attempt_count = failed_attempt_count + 1,
      updated_at = now()
  WHERE id = p_payout_id
  RETURNING failed_attempt_count INTO v_new_count;

  UPDATE public.payouts
  SET retry_allowed = (v_new_count < p_max_retries)
  WHERE id = p_payout_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  IF v_old_money = 'funds_releasing'::money_status THEN
    UPDATE public.transactions
    SET money_status = 'funds_pending_release', updated_at = now()
    WHERE id = v_tx_id;

    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'funds_pending_release', concat('payout_failed:', p_reason));
  END IF;

  UPDATE public.release_review_queue
  SET status = 'failed',
      notes = concat('transfer failed: ', p_reason),
      updated_at = now()
  WHERE transaction_id = v_tx_id AND status IN ('processing','claimed','pending');

  RETURN jsonb_build_object('ok', true, 'failed_attempt_count', v_new_count);
END;
$function$


-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.fail_refund_atomic(p_refund_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.refunds
  SET status = 'failed',
      failed_at = now(),
      failure_reason = p_reason,
      failed_attempt_count = failed_attempt_count + 1,
      updated_at = now()
  WHERE id = p_refund_id;
  RETURN jsonb_build_object('ok', true);
END;
$function$


-- ----------------------------------------
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
$function$


-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.release_payout_atomic(p_transaction_id uuid, p_payout_id uuid, p_actor_user_id uuid, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_money money_status;
BEGIN
  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;

  IF v_old_money IS DISTINCT FROM 'funds_pending_release'::money_status THEN
    RAISE EXCEPTION 'invalid_money_status:%', v_old_money;
  END IF;

  -- Payout transition
  UPDATE public.payouts
  SET status = 'pending',
      release_approved_by_user_id = p_actor_user_id,
      released_at = now(),
      notes = COALESCE(p_notes, notes),
      last_release_attempt_at = now(),
      updated_at = now()
  WHERE id = p_payout_id AND status = 'awaiting_release';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout_not_in_awaiting_release';
  END IF;

  -- Money transition
  UPDATE public.transactions
  SET money_status = 'funds_releasing',
      release_approved_at = now(),
      release_approved_by = p_actor_user_id,
      updated_at = now()
  WHERE id = p_transaction_id;

  INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
  VALUES (p_transaction_id, v_old_money, 'funds_releasing', p_actor_user_id, 'release_approved');

  INSERT INTO public.admin_actions(admin_user_id, transaction_id, action_type, action_notes)
  VALUES (p_actor_user_id, p_transaction_id, 'release_funds', p_notes);

  UPDATE public.release_review_queue
  SET status = 'processing',
      claimed_by_user_id = p_actor_user_id,
      claimed_at = COALESCE(claimed_at, now()),
      updated_at = now()
  WHERE transaction_id = p_transaction_id
    AND status IN ('pending','claimed');

  RETURN jsonb_build_object('ok', true);
END;
$function$


-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.retry_payout_atomic(p_payout_id uuid, p_actor_user_id uuid, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid;
  v_old_money money_status;
  v_status payout_status;
  v_retry_allowed boolean;
BEGIN
  SELECT transaction_id, status, retry_allowed
    INTO v_tx_id, v_status, v_retry_allowed
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;

  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF v_status <> 'failed'::payout_status THEN RAISE EXCEPTION 'payout_not_failed:%', v_status; END IF;
  IF NOT v_retry_allowed THEN RAISE EXCEPTION 'retry_not_allowed'; END IF;

  -- Re-arm payout for another release attempt
  UPDATE public.payouts
  SET status = 'pending'::payout_status,
      release_approved_by_user_id = p_actor_user_id,
      released_at = now(),
      notes = COALESCE(p_notes, notes),
      last_release_attempt_at = now(),
      updated_at = now()
  WHERE id = p_payout_id;

  -- Money must be at funds_pending_release (where fail_payout_atomic returned it)
  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;
  IF v_old_money <> 'funds_pending_release'::money_status THEN
    RAISE EXCEPTION 'invalid_money_status_for_retry:%', v_old_money;
  END IF;

  UPDATE public.transactions
  SET money_status = 'funds_releasing',
      release_approved_at = now(),
      release_approved_by = p_actor_user_id,
      updated_at = now()
  WHERE id = v_tx_id;

  INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
  VALUES (v_tx_id, v_old_money, 'funds_releasing', p_actor_user_id, 'retry_payout');

  INSERT INTO public.admin_actions(admin_user_id, transaction_id, action_type, action_notes)
  VALUES (p_actor_user_id, v_tx_id, 'retry_payout', p_notes);

  UPDATE public.release_review_queue
  SET status = 'processing',
      claimed_by_user_id = p_actor_user_id,
      claimed_at = COALESCE(claimed_at, now()),
      updated_at = now()
  WHERE transaction_id = v_tx_id
    AND status IN ('failed','pending','claimed');

  RETURN jsonb_build_object('ok', true);
END;
$function$


-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_payout_atomic(p_payout_id uuid, p_amount numeric, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid;
  v_currency text;
  v_old_money money_status;
BEGIN
  SELECT transaction_id, currency_code INTO v_tx_id, v_currency
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;

  UPDATE public.payouts
  SET status = 'reversed'::payout_status,
      failure_reason = concat('reversed: ', p_reason),
      last_release_error = concat('reversed: ', p_reason),
      retry_allowed = false,
      updated_at = now()
  WHERE id = p_payout_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  IF v_old_money = 'funds_released'::money_status THEN
    INSERT INTO public.escrow_ledger_entries(
      transaction_id, entry_type, amount, currency_code, reference_type, reference_id, notes
    ) VALUES (
      v_tx_id, 'adjustment', -p_amount, COALESCE(v_currency,'NGN'),
      'payout_reversal', p_payout_id, concat('transfer.reversed: ', p_reason)
    );

    UPDATE public.escrow_states
    SET released_amount = GREATEST(0, released_amount - p_amount),
        frozen_amount = frozen_amount + p_amount,
        state = 'frozen'::escrow_state,
        last_changed_at = now(),
        updated_at = now()
    WHERE transaction_id = v_tx_id;

    UPDATE public.transactions
    SET money_status = 'funds_frozen', updated_at = now()
    WHERE id = v_tx_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'funds_frozen', concat('transfer_reversed:', p_reason));
  ELSIF v_old_money = 'funds_releasing'::money_status THEN
    UPDATE public.transactions
    SET money_status = 'funds_pending_release', updated_at = now()
    WHERE id = v_tx_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'funds_pending_release', concat('reversed:', p_reason));
  END IF;

  UPDATE public.transactions
  SET needs_release_review = true,
      release_review_reason = 'transfer_reversed',
      updated_at = now()
  WHERE id = v_tx_id;

  UPDATE public.release_review_queue
  SET status = 'failed',
      notes = concat('reversed: ', p_reason),
      updated_at = now()
  WHERE transaction_id = v_tx_id AND status IN ('processing','claimed','pending','released');

  RETURN jsonb_build_object('ok', true);
END;
$function$


-- ----------------------------------------
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
$function$


-- ----------------------------------------
CREATE OR REPLACE FUNCTION public.unfreeze_funds_atomic(p_transaction_id uuid, p_actor uuid, p_target money_status, p_reason text)
 RETURNS money_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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

  INSERT INTO public.escrow_ledger_entries(
    transaction_id, entry_type, amount, currency_code,
    reference_type, reference_id, notes, metadata, created_by_user_id
  ) VALUES (
    p_transaction_id,
    'adjustment'::escrow_ledger_entry_type,
    COALESCE(v_frozen, 0),
    COALESCE(v_currency, 'NGN'),
    'admin_unfreeze',
    p_transaction_id,
    concat('Funds unfrozen by admin to ', p_target::text, ' escrow. Reason: ', COALESCE(p_reason, '')),
    jsonb_build_object(
      'admin_unfreeze', true,
      'from_bucket', 'frozen',
      'to_bucket', 'held',
      'moved_amount', COALESCE(v_frozen, 0),
      'balance_after_held', COALESCE(v_held_after, 0),
      'balance_after_frozen', 0,
      'target_money_status', p_target::text,
      'reason', p_reason
    ),
    p_actor
  );

  RETURN p_target;
END;
$function$

