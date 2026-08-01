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
-- 3b) Route admin freeze/unfreeze ledger writes through the guarded writer.
DO $do$
DECLARE
  r record; v_src text; v_new text; v_left int;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('freeze_funds_atomic','unfreeze_funds_atomic')
  LOOP
    v_src := regexp_replace(r.def, 'DECLARE', 'DECLARE' || chr(10) || '  v_cycle bigint;' || chr(10) || '  v_lres jsonb;', 1);

    IF r.proname = 'freeze_funds_atomic' THEN
      v_new := regexp_replace(v_src,
        'INSERT INTO public\.escrow_ledger_entries\([^;]*?''freeze_hold''[^;]*?;',
        $r$v_cycle := (SELECT count(*) FROM public.money_status_history h
                WHERE h.transaction_id = p_transaction_id AND h.new_status = 'funds_frozen'::money_status);
  v_lres := public.ledger_write_guarded(
    p_transaction_id, 'freeze_hold'::escrow_ledger_entry_type, COALESCE(v_held, 0), COALESCE(v_currency, 'NGN'),
    'admin_freeze', p_transaction_id,
    concat('Funds frozen by admin. Reason: ', COALESCE(p_reason, '')),
    p_actor,
    jsonb_build_object('admin_freeze', true, 'from_bucket', 'held', 'to_bucket', 'frozen',
      'moved_amount', COALESCE(v_held, 0), 'balance_after_held', 0,
      'balance_after_frozen', COALESCE(v_frozen_after, 0),
      'source_money_status', v_old::text, 'target_money_status', v_new::text, 'reason', p_reason),
    'admin:freeze:' || p_transaction_id::text || ':cycle' || v_cycle::text || ':freeze_hold',
    jsonb_build_object('transaction_id', p_transaction_id::text, 'operation', 'admin_freeze',
      'cycle', v_cycle, 'entry_type', 'freeze_hold',
      'amount_minor', round(COALESCE(v_held, 0) * 100)::bigint, 'currency', COALESCE(v_currency, 'NGN')));
  IF (v_lres ->> 'status') = 'idempotency_conflict' THEN
    RAISE EXCEPTION 'idempotency_conflict_admin_freeze:%', p_transaction_id;
  END IF;$r$,
        'g');
    ELSE
      v_new := regexp_replace(v_src,
        'INSERT INTO public\.escrow_ledger_entries\([^;]*?''admin_unfreeze''[^;]*?;',
        $r$v_cycle := (SELECT count(*) FROM public.money_status_history h
                WHERE h.transaction_id = p_transaction_id AND h.new_status = p_target);
  v_lres := public.ledger_write_guarded(
    p_transaction_id, 'adjustment'::escrow_ledger_entry_type, COALESCE(v_frozen, 0), COALESCE(v_currency, 'NGN'),
    'admin_unfreeze', p_transaction_id,
    concat('Funds unfrozen by admin to ', p_target::text, ' escrow. Reason: ', COALESCE(p_reason, '')),
    p_actor,
    jsonb_build_object('admin_unfreeze', true, 'from_bucket', 'frozen', 'to_bucket', 'held',
      'moved_amount', COALESCE(v_frozen, 0), 'balance_after_held', COALESCE(v_held_after, 0),
      'balance_after_frozen', 0, 'target_money_status', p_target::text, 'reason', p_reason),
    'admin:unfreeze:' || p_transaction_id::text || ':cycle' || v_cycle::text || ':adjustment',
    jsonb_build_object('transaction_id', p_transaction_id::text, 'operation', 'admin_unfreeze',
      'cycle', v_cycle, 'entry_type', 'adjustment',
      'amount_minor', round(COALESCE(v_frozen, 0) * 100)::bigint, 'currency', COALESCE(v_currency, 'NGN')));
  IF (v_lres ->> 'status') = 'idempotency_conflict' THEN
    RAISE EXCEPTION 'idempotency_conflict_admin_unfreeze:%', p_transaction_id;
  END IF;$r$,
        'g');
    END IF;

    SELECT count(*) INTO v_left
    FROM regexp_matches(v_new, 'INSERT INTO public\.escrow_ledger_entries', 'g');
    IF v_left > 0 THEN
      RAISE EXCEPTION 'freeze_rewrite_incomplete:% remaining in %', v_left, r.proname;
    END IF;

    EXECUTE v_new;
  END LOOP;
END
$do$;
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
-- 11) Route the dispute-unfreeze ledger write through the guarded writer.
--     Rewrites every resolve_dispute_atomic overload in place; fails closed if the
--     expected direct-INSERT block is not found exactly once per overload.
DO $do$
DECLARE
  r record;
  v_src text;
  v_new text;
  v_call text;
  v_matches int;
BEGIN
  v_call := $call$public.ledger_write_guarded(
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
    )$call$;

  FOR r IN
    SELECT p.oid, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'resolve_dispute_atomic'
  LOOP
    v_src := r.def;
    SELECT count(*) INTO v_matches
    FROM regexp_matches(v_src, 'INSERT INTO public\.escrow_ledger_entries\([^;]*?''dispute_unfreeze''[^;]*?;', 'g');
    IF v_matches <> 1 THEN
      RAISE EXCEPTION 'dispute_unfreeze_rewrite_unexpected_matches:% for oid %', v_matches, r.oid;
    END IF;

    IF v_src ~ 'INSERT INTO public\.escrow_ledger_entries\([^;]*?''dispute_unfreeze''[^;]*?RETURNING id INTO v_ledger_id;' THEN
      v_new := regexp_replace(
        v_src,
        'INSERT INTO public\.escrow_ledger_entries\([^;]*?''dispute_unfreeze''[^;]*?;',
        'SELECT (' || v_call || ' ->> ''entry_id'')::uuid INTO v_ledger_id;',
        'g');
    ELSE
      v_new := regexp_replace(
        v_src,
        'INSERT INTO public\.escrow_ledger_entries\([^;]*?''dispute_unfreeze''[^;]*?;',
        'PERFORM ' || v_call || ';',
        'g');
    END IF;

    IF position('INSERT INTO public.escrow_ledger_entries' in v_new) > 0
       AND v_new ~ 'INSERT INTO public\.escrow_ledger_entries\([^;]*?''dispute_unfreeze''' THEN
      RAISE EXCEPTION 'dispute_unfreeze_rewrite_failed for oid %', r.oid;
    END IF;

    EXECUTE v_new;
  END LOOP;
END
$do$;

-- 12) Remaining direct ledger INSERTs inside dispute resolution are non-cash entry
--     types (dispute_refund_reserved / dispute_release_approved_pending_admin_release /
--     dispute_no_action). They must still carry an idempotency key, so route them
--     through the guarded writer as well.
DO $do$
DECLARE
  r record;
  v_src text;
  v_new text;
  v_left int;
BEGIN
  FOR r IN
    SELECT p.oid, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'resolve_dispute_atomic'
  LOOP
    v_src := r.def;

    v_new := regexp_replace(v_src,
      'INSERT INTO public\.escrow_ledger_entries\([^;]*?''dispute_refund_reserved''[^;]*?;',
      $r$PERFORM public.ledger_write_guarded(
      v_tx_id, 'dispute_refund_reserved'::escrow_ledger_entry_type, -v_refund_qty, v_currency,
      'dispute', p_dispute_id,
      concat('Refund reserved for dispute outcome ', p_outcome::text),
      p_actor,
      jsonb_build_object('dispute_id', p_dispute_id, 'refund_id', v_refund_id,
        'amount', v_refund_qty, 'outcome', p_outcome::text),
      'dispute:refund_reserved:' || v_tx_id::text || ':' || p_dispute_id::text || ':dispute_refund_reserved',
      jsonb_build_object('transaction_id', v_tx_id::text, 'dispute_id', p_dispute_id::text,
        'entry_type', 'dispute_refund_reserved', 'operation', 'dispute_refund_reserved',
        'amount_minor', round(-v_refund_qty * 100)::bigint, 'currency', COALESCE(v_currency,'NGN')));$r$,
      'g');

    v_new := regexp_replace(v_new,
      'INSERT INTO public\.escrow_ledger_entries\([^;]*?''dispute_release_approved_pending_admin_release''[^;]*?;',
      $r$PERFORM public.ledger_write_guarded(
      v_tx_id, 'dispute_release_approved_pending_admin_release'::escrow_ledger_entry_type, v_release_qty, v_currency,
      'dispute', p_dispute_id,
      concat('Release approved pending admin release. Outcome: ', p_outcome::text),
      p_actor,
      jsonb_build_object('dispute_id', p_dispute_id, 'amount', v_release_qty, 'outcome', p_outcome::text),
      'dispute:release_approved:' || v_tx_id::text || ':' || p_dispute_id::text || ':dispute_release_approved_pending_admin_release',
      jsonb_build_object('transaction_id', v_tx_id::text, 'dispute_id', p_dispute_id::text,
        'entry_type', 'dispute_release_approved_pending_admin_release', 'operation', 'dispute_release_approved',
        'amount_minor', round(v_release_qty * 100)::bigint, 'currency', COALESCE(v_currency,'NGN')));$r$,
      'g');

    v_new := regexp_replace(v_new,
      'INSERT INTO public\.escrow_ledger_entries\([^;]*?''dispute_no_action''[^;]*?;',
      $r$PERFORM public.ledger_write_guarded(
      v_tx_id, 'dispute_no_action'::escrow_ledger_entry_type, 0, v_currency,
      'dispute', p_dispute_id,
      'Dispute closed without money movement',
      p_actor,
      jsonb_build_object('dispute_id', p_dispute_id, 'outcome', p_outcome::text,
        'money_status_at_close', v_old_money::text),
      'dispute:no_action:' || v_tx_id::text || ':' || p_dispute_id::text || ':dispute_no_action',
      jsonb_build_object('transaction_id', v_tx_id::text, 'dispute_id', p_dispute_id::text,
        'entry_type', 'dispute_no_action', 'operation', 'dispute_no_action',
        'amount_minor', 0, 'currency', COALESCE(v_currency,'NGN')));$r$,
      'g');

    SELECT count(*) INTO v_left
    FROM regexp_matches(v_new, 'INSERT INTO public\.escrow_ledger_entries', 'g');
    IF v_left > 0 THEN
      RAISE EXCEPTION 'dispute_ledger_rewrite_incomplete:% remaining for oid %', v_left, r.oid;
    END IF;

    EXECUTE v_new;
  END LOOP;
END
$do$;
