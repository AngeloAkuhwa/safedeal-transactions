CREATE OR REPLACE FUNCTION public.release_payout_atomic(p_transaction_id uuid, p_payout_id uuid, p_actor_user_id uuid, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_money money_status;
  v_amount numeric;
  v_status payout_status;
  v_uncommitted numeric;
  v_open_disputes integer;
BEGIN
  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;

  IF v_old_money IS DISTINCT FROM 'funds_pending_release'::money_status THEN
    RAISE EXCEPTION 'invalid_money_status:%', v_old_money;
  END IF;

  -- Defense in depth: never release while a dispute is unresolved, even if the
  -- caller bypassed the edge-function guard. Queue holds are enforced at the
  -- edge; only OPEN disputes are blocked here.
  SELECT count(*) INTO v_open_disputes
  FROM public.disputes d
  WHERE d.transaction_id = p_transaction_id
    AND d.status <> 'resolved'::dispute_case_status;

  IF v_open_disputes > 0 THEN
    RAISE EXCEPTION 'dispute_open';
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