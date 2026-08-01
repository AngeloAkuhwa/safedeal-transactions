-- Checkpoint D: settlement state machine, guarded ledger writes, privilege boundary

-- 1) Commitment helpers -------------------------------------------------
CREATE OR REPLACE FUNCTION public.escrow_open_commitments(
  _transaction_id uuid,
  _exclude_payout_id uuid DEFAULT NULL,
  _exclude_refund_id uuid DEFAULT NULL
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT SUM(p.amount) FROM public.payouts p
     WHERE p.transaction_id = _transaction_id
       AND p.status IN ('awaiting_release','pending','processing','blocked')
       AND (_exclude_payout_id IS NULL OR p.id <> _exclude_payout_id)
  ), 0)
  + COALESCE((
    SELECT SUM(r.refund_amount) FROM public.refunds r
     WHERE r.transaction_id = _transaction_id
       AND r.status IN ('pending','processing')
       AND (_exclude_refund_id IS NULL OR r.id <> _exclude_refund_id)
  ), 0);
$function$;

CREATE OR REPLACE FUNCTION public.escrow_uncommitted_available(
  _transaction_id uuid,
  _exclude_payout_id uuid DEFAULT NULL,
  _exclude_refund_id uuid DEFAULT NULL
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.escrow_available_balance(_transaction_id)
       - public.escrow_open_commitments(_transaction_id, _exclude_payout_id, _exclude_refund_id);
$function$;

GRANT EXECUTE ON FUNCTION public.escrow_open_commitments(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escrow_uncommitted_available(uuid, uuid, uuid) TO authenticated, service_role;

-- 2) #1 release_payout_atomic: initiation validates uncommitted availability
CREATE OR REPLACE FUNCTION public.release_payout_atomic(p_transaction_id uuid, p_payout_id uuid, p_actor_user_id uuid, p_notes text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_old_money money_status;
  v_amount numeric;
  v_status payout_status;
  v_uncommitted numeric;
BEGIN
  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;

  IF v_old_money IS DISTINCT FROM 'funds_pending_release'::money_status THEN
    RAISE EXCEPTION 'invalid_money_status:%', v_old_money;
  END IF;

  SELECT amount, status INTO v_amount, v_status
  FROM public.payouts WHERE id = p_payout_id AND transaction_id = p_transaction_id FOR UPDATE;

  IF v_amount IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF v_status <> 'awaiting_release'::payout_status THEN
    RAISE EXCEPTION 'payout_not_in_awaiting_release';
  END IF;

  -- The payout being initiated is itself an open commitment; exclude it from the guard.
  v_uncommitted := public.escrow_uncommitted_available(p_transaction_id, p_payout_id, NULL);
  IF v_amount > v_uncommitted + 0.005 THEN
    RAISE EXCEPTION 'payout_exceeds_uncommitted_available: uncommitted=% requested=%', v_uncommitted, v_amount;
  END IF;

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
$function$;

-- 3) #2 complete_payout_atomic: guarded, idempotent debit
DROP FUNCTION IF EXISTS public.complete_payout_atomic(uuid, numeric);
CREATE OR REPLACE FUNCTION public.complete_payout_atomic(
  p_payout_id uuid, p_amount numeric, p_provider_event_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid; v_seller_id uuid; v_currency text; v_status payout_status;
  v_old_money money_status; v_available numeric; v_res jsonb;
BEGIN
  IF p_provider_event_id IS NULL OR length(p_provider_event_id) < 3 THEN
    RAISE EXCEPTION 'missing_provider_event_id';
  END IF;

  SELECT transaction_id, seller_id, currency_code, status
    INTO v_tx_id, v_seller_id, v_currency, v_status
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;

  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF v_status = 'completed'::payout_status THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  IF v_status IN ('cancelled'::payout_status, 'reversed'::payout_status) THEN
    RAISE EXCEPTION 'payout_terminal_cannot_complete:%', v_status;
  END IF;

  -- Completion validates against cash available (the reservation is this payout itself).
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
      state = 'released_to_seller'::escrow_state,
      last_changed_at = now(), updated_at = now()
  WHERE transaction_id = v_tx_id;

  v_res := public.ledger_write_guarded(
    v_tx_id, 'payout_debit'::escrow_ledger_entry_type, p_amount, COALESCE(v_currency,'NGN'),
    'payout', p_payout_id, 'transfer.success', v_seller_id,
    jsonb_build_object('provider_event_id', p_provider_event_id),
    'payout:complete:' || v_tx_id::text || ':' || p_payout_id::text || '#' || p_provider_event_id || ':payout_debit',
    jsonb_build_object('transaction_id', v_tx_id::text, 'payout_id', p_payout_id::text,
      'provider_event_id', p_provider_event_id, 'entry_type', 'payout_debit',
      'amount_minor', round(p_amount * 100)::bigint, 'currency', COALESCE(v_currency,'NGN'))
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
CREATE OR REPLACE FUNCTION public.freeze_funds_atomic(p_transaction_id uuid, p_actor uuid, p_reason text)
 RETURNS money_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
  v_lres := public.ledger_write_guarded(
    p_transaction_id, 'freeze_hold'::escrow_ledger_entry_type, COALESCE(v_held, 0), COALESCE(v_currency, 'NGN'),
    'admin_freeze', p_transaction_id,
    concat('Funds frozen by admin. Reason: ', COALESCE(p_reason, '')),
    p_actor,
    jsonb_build_object(
      'admin_freeze', true, 'from_bucket', 'held', 'to_bucket', 'frozen',
      'moved_amount', COALESCE(v_held, 0), 'balance_after_held', 0,
      'balance_after_frozen', COALESCE(v_frozen_after, 0),
      'source_money_status', v_old::text, 'target_money_status', v_new::text, 'reason', p_reason),
    'admin:freeze:' || p_transaction_id::text || ':cycle' || v_cycle::text || ':' || 'freeze_hold'::escrow_ledger_entry_type::text,
    jsonb_build_object('transaction_id', p_transaction_id::text, 'operation', 'admin_freeze',
      'cycle', v_cycle, 'entry_type', 'freeze_hold'::escrow_ledger_entry_type::text,
      'amount_minor', round(COALESCE(v_held, 0) * 100)::bigint, 'currency', COALESCE(v_currency, 'NGN'))
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
                WHERE h.transaction_id = p_transaction_id AND h.new_status = p_target::money_status);
  v_lres := public.ledger_write_guarded(
    p_transaction_id, 'adjustment'::escrow_ledger_entry_type, COALESCE(v_frozen, 0), COALESCE(v_currency, 'NGN'),
    'admin_unfreeze', p_transaction_id,
    concat('Funds unfrozen by admin to ', p_target::text, ' escrow. Reason: ', COALESCE(p_reason, '')),
    p_actor,
    jsonb_build_object(
      'admin_unfreeze', true, 'from_bucket', 'frozen', 'to_bucket', 'held',
      'moved_amount', COALESCE(v_frozen, 0), 'balance_after_held', COALESCE(v_held_after, 0),
      'balance_after_frozen', 0, 'target_money_status', p_target::text, 'reason', p_reason),
    'admin:unfreeze:' || p_transaction_id::text || ':cycle' || v_cycle::text || ':' || 'adjustment'::escrow_ledger_entry_type::text,
    jsonb_build_object('transaction_id', p_transaction_id::text, 'operation', 'admin_unfreeze',
      'cycle', v_cycle, 'entry_type', 'adjustment'::escrow_ledger_entry_type::text,
      'amount_minor', round(COALESCE(v_frozen, 0) * 100)::bigint, 'currency', COALESCE(v_currency, 'NGN'))
  );
  IF (v_lres ->> 'status') = 'idempotency_conflict' THEN
    RAISE EXCEPTION 'idempotency_conflict_admin_unfreeze:%', p_transaction_id;
  END IF;

  RETURN p_target;
END;
$function$;
-- 4) #7 complete_refund_atomic: guarded, idempotent debit
DROP FUNCTION IF EXISTS public.complete_refund_atomic(uuid);
CREATE OR REPLACE FUNCTION public.complete_refund_atomic(
  p_refund_id uuid, p_provider_event_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid; v_amount numeric; v_currency text; v_status refund_status;
  v_old_money money_status; v_partial_release numeric := 0; v_available numeric; v_res jsonb;
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
  IF v_status = 'cancelled'::refund_status THEN
    RAISE EXCEPTION 'refund_terminal_cannot_complete:%', v_status;
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

  v_res := public.ledger_write_guarded(
    v_tx_id, 'refund_debit'::escrow_ledger_entry_type, v_amount, COALESCE(v_currency,'NGN'),
    'refund', p_refund_id,
    CASE WHEN COALESCE(v_partial_release,0) > 0 THEN 'refund.processed (partial dispute outcome)' ELSE 'refund.processed' END,
    NULL,
    jsonb_build_object('provider_event_id', p_provider_event_id),
    'refund:complete:' || v_tx_id::text || ':' || p_refund_id::text || '#' || p_provider_event_id || ':refund_debit',
    jsonb_build_object('transaction_id', v_tx_id::text, 'refund_id', p_refund_id::text,
      'provider_event_id', p_provider_event_id, 'entry_type', 'refund_debit',
      'amount_minor', round(v_amount * 100)::bigint, 'currency', COALESCE(v_currency,'NGN'))
  );
  IF (v_res ->> 'status') = 'idempotency_conflict' THEN
    RAISE EXCEPTION 'idempotency_conflict_refund_complete:%', p_refund_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'partial_release_pending', COALESCE(v_partial_release,0) > 0, 'ledger', v_res ->> 'status');
END;
$function$;

-- 5) #5 reverse_payout_atomic: guarded reversal adjustment
DROP FUNCTION IF EXISTS public.reverse_payout_atomic(uuid, numeric, text);
CREATE OR REPLACE FUNCTION public.reverse_payout_atomic(
  p_payout_id uuid, p_amount numeric, p_reason text, p_provider_event_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid; v_currency text; v_status payout_status; v_old_money money_status; v_res jsonb;
BEGIN
  IF p_provider_event_id IS NULL OR length(p_provider_event_id) < 3 THEN
    RAISE EXCEPTION 'missing_provider_event_id';
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
    v_res := public.ledger_write_guarded(
      v_tx_id, 'adjustment'::escrow_ledger_entry_type, -p_amount, COALESCE(v_currency,'NGN'),
      'payout_reversal', p_payout_id, concat('transfer.reversed: ', p_reason), NULL,
      jsonb_build_object('provider_event_id', p_provider_event_id, 'reason', p_reason),
      'payout:reverse:' || v_tx_id::text || ':' || p_payout_id::text || '#' || p_provider_event_id || ':adjustment',
      jsonb_build_object('transaction_id', v_tx_id::text, 'payout_id', p_payout_id::text,
        'provider_event_id', p_provider_event_id, 'entry_type', 'adjustment', 'operation', 'payout_reversal',
        'amount_minor', round(-p_amount * 100)::bigint, 'currency', COALESCE(v_currency,'NGN'))
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
-- 6) #6 start_refund_atomic: commitment guard + business-row idempotency
CREATE OR REPLACE FUNCTION public.start_refund_atomic(p_transaction_id uuid, p_amount numeric, p_actor_user_id uuid, p_reason text, p_notes text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

-- 7) #3 fail_payout_atomic: reject failing a settled/terminal payout
CREATE OR REPLACE FUNCTION public.fail_payout_atomic(p_payout_id uuid, p_reason text, p_max_retries integer DEFAULT 3)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid; v_status payout_status; v_old_money money_status; v_new_count integer;
BEGIN
  SELECT transaction_id, status INTO v_tx_id, v_status FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF v_status IN ('completed'::payout_status,'reversed'::payout_status,'cancelled'::payout_status) THEN
    RAISE EXCEPTION 'payout_terminal_cannot_fail:%', v_status;
  END IF;

  UPDATE public.payouts
  SET status = 'failed', failed_at = now(), failure_reason = p_reason,
      last_release_error = p_reason, last_release_attempt_at = now(),
      failed_attempt_count = failed_attempt_count + 1, updated_at = now()
  WHERE id = p_payout_id
  RETURNING failed_attempt_count INTO v_new_count;

  UPDATE public.payouts SET retry_allowed = (v_new_count < p_max_retries) WHERE id = p_payout_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  IF v_old_money = 'funds_releasing'::money_status THEN
    UPDATE public.transactions SET money_status = 'funds_pending_release', updated_at = now() WHERE id = v_tx_id;
    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'funds_pending_release', concat('payout_failed:', p_reason));
  END IF;

  UPDATE public.release_review_queue
  SET status = 'failed', notes = concat('transfer failed: ', p_reason), updated_at = now()
  WHERE transaction_id = v_tx_id AND status IN ('processing','claimed','pending');

  RETURN jsonb_build_object('ok', true, 'failed_attempt_count', v_new_count);
END;
$function$;

-- 8) #8 fail_refund_atomic: reject failing a completed refund
CREATE OR REPLACE FUNCTION public.fail_refund_atomic(p_refund_id uuid, p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_status refund_status;
BEGIN
  SELECT status INTO v_status FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'refund_not_found'; END IF;
  IF v_status IN ('completed'::refund_status,'cancelled'::refund_status) THEN
    RAISE EXCEPTION 'refund_terminal_cannot_fail:%', v_status;
  END IF;

  UPDATE public.refunds
  SET status = 'failed', failed_at = now(), failure_reason = p_reason,
      failed_attempt_count = failed_attempt_count + 1, updated_at = now()
  WHERE id = p_refund_id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 9) Idempotency enforcement trigger for value-affecting ledger writes
CREATE OR REPLACE FUNCTION public.escrow_ledger_require_idem()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.idempotency_key IS NULL OR length(NEW.idempotency_key) < 8 THEN
    RAISE EXCEPTION 'ledger_write_requires_idempotency_key: use public.ledger_write_guarded()';
  END IF;
  IF NEW.payload_fingerprint IS NULL OR NEW.payload_fingerprint NOT LIKE 'v1:%' THEN
    RAISE EXCEPTION 'ledger_write_requires_payload_fingerprint: use public.ledger_write_guarded()';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_escrow_ledger_require_idem ON public.escrow_ledger_entries;
CREATE TRIGGER trg_escrow_ledger_require_idem
BEFORE INSERT ON public.escrow_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.escrow_ledger_require_idem();

-- 10) Privilege boundary: no direct DML on the ledger from application roles
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.escrow_ledger_entries FROM anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.resolve_dispute_atomic(p_dispute_id uuid, p_actor uuid, p_outcome dispute_outcome_type, p_refund_amount numeric, p_release_amount numeric, p_decision_summary text, p_also_close_investigation boolean DEFAULT false)
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
BEGIN
  IF p_outcome NOT IN ('refund_buyer','release_funds_to_seller','partial_refund_release',
                       'dismissed_seller_favor','dismissed_buyer_favor','close_case_without_resolution') THEN
    RAISE EXCEPTION 'invalid_outcome:%', p_outcome;
  END IF;

  -- Lock dispute
  SELECT transaction_id, status INTO v_tx_id, v_dispute_status
    FROM public.disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_tx_id IS NULL THEN
    RAISE EXCEPTION 'dispute_not_found';
  END IF;
  IF v_dispute_status = 'resolved' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_resolved');
  END IF;
  v_old_dispute_status := v_dispute_status;

  -- Lock transaction + escrow
  SELECT money_status, status, seller_id
    INTO v_old_money, v_old_tx_status, v_seller
    FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  IF v_old_money NOT IN ('funds_held_in_escrow','funds_pending_release','funds_frozen') THEN
    RAISE EXCEPTION 'invalid_money_status_for_resolve:%', v_old_money;
  END IF;

  SELECT currency_code INTO v_currency
    FROM public.transaction_pricing WHERE transaction_id = v_tx_id LIMIT 1;
  v_currency := COALESCE(v_currency, 'NGN');

  SELECT COALESCE(held_amount,0), COALESCE(frozen_amount,0)
    INTO v_held, v_frozen
    FROM public.escrow_states WHERE transaction_id = v_tx_id FOR UPDATE;
  v_available := COALESCE(v_held,0) + COALESCE(v_frozen,0);

  -- Outcome-specific amount validation
  v_refund_qty := COALESCE(p_refund_amount, 0);
  v_release_qty := COALESCE(p_release_amount, 0);

  IF p_outcome = 'refund_buyer' OR p_outcome = 'dismissed_buyer_favor' THEN
    v_refund_qty := COALESCE(NULLIF(v_refund_qty, 0), v_available);
    v_release_qty := 0;
    IF v_refund_qty <= 0 OR v_refund_qty > v_available THEN
      RAISE EXCEPTION 'invalid_refund_amount:% vs available %', v_refund_qty, v_available;
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
    IF (v_refund_qty + v_release_qty) > v_available THEN
      RAISE EXCEPTION 'partial_sum_exceeds_available:% + % vs %', v_refund_qty, v_release_qty, v_available;
    END IF;
  ELSE
    -- close_case_without_resolution: no amounts
    v_refund_qty := 0;
    v_release_qty := 0;
  END IF;

  -- Unwind frozen amount into held when needed (for outcomes that move money)
  IF p_outcome <> 'close_case_without_resolution' AND COALESCE(v_frozen, 0) > 0 THEN
    UPDATE public.escrow_states
      SET held_amount = COALESCE(held_amount,0) + v_frozen,
          frozen_amount = 0,
          state = 'held'::escrow_state,
          last_changed_at = now(),
          updated_at = now()
    WHERE transaction_id = v_tx_id;

    PERFORM public.ledger_write_guarded(
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
    );

    -- Reflect intermediate state if old money was funds_frozen → bridge to funds_held_in_escrow logically
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

  -- Determine new money_status and side-effects per outcome
  IF p_outcome IN ('refund_buyer','dismissed_buyer_favor') OR p_outcome = 'partial_refund_release' THEN
    -- Need to bridge money_status to refund_pending
    -- Path: funds_held_in_escrow → funds_pending_release → refund_pending
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

    -- Create refund record
    SELECT id INTO v_payment_id
      FROM public.payments
      WHERE transaction_id = v_tx_id AND status = 'succeeded'::payment_status
      ORDER BY created_at DESC LIMIT 1;
    IF v_payment_id IS NULL THEN
      RAISE EXCEPTION 'no_successful_payment_for_refund';
    END IF;

    INSERT INTO public.refunds(
      transaction_id, payment_id, refund_amount, currency_code,
      reason, notes, status, initiated_by_user_id, provider
    ) VALUES (
      v_tx_id, v_payment_id, v_refund_qty, v_currency,
      concat('dispute_outcome:', p_outcome::text),
      p_decision_summary,
      'pending', p_actor, 'paystack'
    ) RETURNING id INTO v_refund_id;

    -- Cancel any pending payouts / open release queues (refund_request style)
    UPDATE public.payouts
      SET status = 'cancelled',
          notes = 'cancelled by dispute resolution',
          updated_at = now()
      WHERE transaction_id = v_tx_id AND status IN ('awaiting_release','blocked');

    UPDATE public.release_review_queue
      SET status = 'refunded', resolved_at = now(), updated_at = now()
      WHERE transaction_id = v_tx_id AND status IN ('pending','claimed','processing','failed');

    -- Ledger: refund reserved
    INSERT INTO public.escrow_ledger_entries(
      transaction_id, entry_type, amount, currency_code,
      reference_type, reference_id, notes, metadata, created_by_user_id
    ) VALUES (
      v_tx_id, 'dispute_refund_reserved'::escrow_ledger_entry_type,
      -v_refund_qty, v_currency,
      'dispute', p_dispute_id,
      concat('Refund reserved for dispute outcome ', p_outcome::text),
      jsonb_build_object(
        'dispute_id', p_dispute_id, 'refund_id', v_refund_id,
        'amount', v_refund_qty, 'outcome', p_outcome::text,
        'balance_after_held', v_held - v_refund_qty
      ),
      p_actor
    );

    -- Partial: also reserve release portion + queue release_review_queue (held until refund completes)
    IF p_outcome = 'partial_refund_release' THEN
      INSERT INTO public.escrow_ledger_entries(
        transaction_id, entry_type, amount, currency_code,
        reference_type, reference_id, notes, metadata, created_by_user_id
      ) VALUES (
        v_tx_id, 'dispute_release_approved_pending_admin_release'::escrow_ledger_entry_type,
        v_release_qty, v_currency,
        'dispute', p_dispute_id,
        'Release approved pending admin release (partial outcome)',
        jsonb_build_object(
          'dispute_id', p_dispute_id, 'amount', v_release_qty,
          'outcome', p_outcome::text, 'blocked_by_refund_id', v_refund_id
        ),
        p_actor
      );

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
    -- Move to funds_pending_release (NEVER funds_releasing)
    IF v_old_money = 'funds_held_in_escrow' THEN
      v_new_money := 'funds_pending_release'::money_status;
      UPDATE public.transactions
        SET money_status = v_new_money, updated_at = now()
        WHERE id = v_tx_id;
      INSERT INTO public.money_status_history(transaction_id, old_status, new_status, changed_by_user_id, reason)
      VALUES (v_tx_id, v_old_money, v_new_money, p_actor, concat('dispute_outcome:', p_outcome::text));
    ELSE
      v_new_money := v_old_money;  -- already funds_pending_release
    END IF;

    INSERT INTO public.escrow_ledger_entries(
      transaction_id, entry_type, amount, currency_code,
      reference_type, reference_id, notes, metadata, created_by_user_id
    ) VALUES (
      v_tx_id, 'dispute_release_approved_pending_admin_release'::escrow_ledger_entry_type,
      v_release_qty, v_currency,
      'dispute', p_dispute_id,
      concat('Release approved pending admin release. Outcome: ', p_outcome::text),
      jsonb_build_object('dispute_id', p_dispute_id, 'amount', v_release_qty, 'outcome', p_outcome::text),
      p_actor
    );

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

    -- Flag transaction for release review (informational; does not block UI)
    UPDATE public.transactions
      SET needs_release_review = true,
          release_review_reason = COALESCE(release_review_reason, concat('dispute_resolved_', p_outcome::text)),
          updated_at = now()
      WHERE id = v_tx_id;

  ELSE
    -- close_case_without_resolution: no money movement
    v_new_money := v_old_money;
    INSERT INTO public.escrow_ledger_entries(
      transaction_id, entry_type, amount, currency_code,
      reference_type, reference_id, notes, metadata, created_by_user_id
    ) VALUES (
      v_tx_id, 'dispute_no_action'::escrow_ledger_entry_type,
      0, v_currency,
      'dispute', p_dispute_id,
      'Dispute closed without money movement',
      jsonb_build_object('dispute_id', p_dispute_id, 'outcome', p_outcome::text,
                         'money_status_at_close', v_old_money::text),
      p_actor
    );
  END IF;

  -- Dispute status -> resolved
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
  );

  -- Transaction status: disputed → resolved (if currently disputed)
  IF v_old_tx_status = 'disputed' THEN
    UPDATE public.transactions
      SET status = 'resolved', dispute_status = 'resolved', updated_at = now()
      WHERE id = v_tx_id;
  ELSE
    UPDATE public.transactions
      SET dispute_status = 'resolved', updated_at = now()
      WHERE id = v_tx_id;
  END IF;

  -- Investigation co-close
  IF p_also_close_investigation THEN
    UPDATE public.admin_investigations
      SET status = 'resolved', resolved_at = now(), last_updated_by = p_actor, updated_at = now()
      WHERE transaction_id = v_tx_id AND status IN ('open','under_review','escalated');
    GET DIAGNOSTICS v_inv_closed = ROW_COUNT;
  END IF;

  -- Recompute admin review need
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

  -- Audit + timeline
  INSERT INTO public.transaction_events(transaction_id, event_type, actor_user_id, actor_role, event_data)
  VALUES (v_tx_id, 'dispute_resolved'::transaction_event_type, p_actor, 'admin',
          jsonb_build_object(
            'dispute_id', p_dispute_id, 'outcome', p_outcome::text,
            'refund_amount', v_refund_qty, 'release_amount', v_release_qty,
            'new_money_status', v_new_money::text,
            'investigation_closed', p_also_close_investigation AND v_inv_closed
          ));

  INSERT INTO public.admin_actions(admin_user_id, transaction_id, dispute_id, action_type, action_notes)
  VALUES (p_actor, v_tx_id, p_dispute_id, 'resolve_dispute',
          concat(p_outcome::text, ' :: ', LEFT(p_decision_summary, 240)));

  INSERT INTO public.audit_logs(action, actor_user_id, transaction_id, description, metadata)
  VALUES ('admin_resolve_dispute', p_actor, v_tx_id,
          concat('Admin resolved dispute ', p_dispute_id, ' as ', p_outcome::text),
          jsonb_build_object(
            'dispute_id', p_dispute_id, 'outcome', p_outcome::text,
            'refund_amount', v_refund_qty, 'release_amount', v_release_qty,
            'money_status', v_new_money::text,
            'also_close_investigation', p_also_close_investigation
          ));

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', p_outcome::text,
    'money_status', v_new_money::text,
    'refund_id', v_refund_id,
    'release_queue_id', v_queue_id,
    'investigation_closed', p_also_close_investigation AND COALESCE(v_inv_closed, false)
  );
END;
$function$;

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

  -- Frozen-funds ack required for close_case_without_resolution
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

  v_refund_qty := COALESCE(p_refund_amount, 0);
  v_release_qty := COALESCE(p_release_amount, 0);

  IF p_outcome = 'refund_buyer' OR p_outcome = 'dismissed_buyer_favor' THEN
    v_refund_qty := COALESCE(NULLIF(v_refund_qty, 0), v_available);
    v_release_qty := 0;
    IF v_refund_qty <= 0 OR v_refund_qty > v_available THEN
      RAISE EXCEPTION 'invalid_refund_amount:% vs available %', v_refund_qty, v_available;
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
    IF (v_refund_qty + v_release_qty) > v_available THEN
      RAISE EXCEPTION 'partial_sum_exceeds_available:% + % vs %', v_refund_qty, v_release_qty, v_available;
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

    INSERT INTO public.escrow_ledger_entries(
      transaction_id, entry_type, amount, currency_code,
      reference_type, reference_id, notes, metadata, created_by_user_id
    ) VALUES (
      v_tx_id, 'dispute_refund_reserved'::escrow_ledger_entry_type,
      -v_refund_qty, v_currency, 'dispute', p_dispute_id,
      concat('Refund reserved for dispute outcome ', p_outcome::text),
      jsonb_build_object('dispute_id', p_dispute_id, 'refund_id', v_refund_id,
                         'amount', v_refund_qty, 'outcome', p_outcome::text),
      p_actor
    ) RETURNING id INTO v_ledger_id;
    v_ledger_ids := array_append(v_ledger_ids, v_ledger_id);

    IF p_outcome = 'partial_refund_release' THEN
      INSERT INTO public.escrow_ledger_entries(
        transaction_id, entry_type, amount, currency_code,
        reference_type, reference_id, notes, metadata, created_by_user_id
      ) VALUES (
        v_tx_id, 'dispute_release_approved_pending_admin_release'::escrow_ledger_entry_type,
        v_release_qty, v_currency, 'dispute', p_dispute_id,
        'Release approved pending admin release (partial outcome)',
        jsonb_build_object('dispute_id', p_dispute_id, 'amount', v_release_qty,
                           'outcome', p_outcome::text, 'blocked_by_refund_id', v_refund_id),
        p_actor
      ) RETURNING id INTO v_ledger_id;
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

    INSERT INTO public.escrow_ledger_entries(
      transaction_id, entry_type, amount, currency_code,
      reference_type, reference_id, notes, metadata, created_by_user_id
    ) VALUES (
      v_tx_id, 'dispute_release_approved_pending_admin_release'::escrow_ledger_entry_type,
      v_release_qty, v_currency, 'dispute', p_dispute_id,
      concat('Release approved pending admin release. Outcome: ', p_outcome::text),
      jsonb_build_object('dispute_id', p_dispute_id, 'amount', v_release_qty, 'outcome', p_outcome::text),
      p_actor
    ) RETURNING id INTO v_ledger_id;
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
    -- close_case_without_resolution
    v_new_money := v_old_money;
    INSERT INTO public.escrow_ledger_entries(
      transaction_id, entry_type, amount, currency_code,
      reference_type, reference_id, notes, metadata, created_by_user_id
    ) VALUES (
      v_tx_id, 'dispute_no_action'::escrow_ledger_entry_type,
      0, v_currency, 'dispute', p_dispute_id,
      'Dispute closed without money movement',
      jsonb_build_object('dispute_id', p_dispute_id, 'outcome', p_outcome::text,
                         'money_status_at_close', v_old_money::text,
                         'frozen_acknowledged', COALESCE(p_acknowledge_frozen_funds,false),
                         'remaining_held', v_held, 'remaining_frozen', v_frozen),
      p_actor
    ) RETURNING id INTO v_ledger_id;
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

  -- Re-read remaining balances for reporting
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
