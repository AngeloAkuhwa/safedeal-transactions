-- Phase B5: enum + atomic helper for retrying a failed payout.
ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'retry_payout';

COMMIT;

CREATE OR REPLACE FUNCTION public.retry_payout_atomic(
  p_payout_id uuid,
  p_actor_user_id uuid,
  p_notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx_id uuid;
  v_status payout_status;
  v_retry_allowed boolean;
  v_attempts integer;
  v_money money_status;
BEGIN
  SELECT transaction_id, status, retry_allowed, failed_attempt_count
    INTO v_tx_id, v_status, v_retry_allowed, v_attempts
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;

  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF v_status <> 'failed'::payout_status THEN
    RAISE EXCEPTION 'payout_not_failed:%', v_status;
  END IF;
  IF NOT v_retry_allowed THEN
    RAISE EXCEPTION 'retry_not_allowed:max_attempts_reached';
  END IF;

  SELECT money_status INTO v_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;
  IF v_money <> 'funds_pending_release'::money_status THEN
    RAISE EXCEPTION 'tx_not_in_pending_release:%', v_money;
  END IF;

  UPDATE public.payouts
  SET status = 'awaiting_release'::payout_status,
      release_blocked = false,
      payout_blocked_reason = NULL,
      last_release_error = NULL,
      retry_allowed = false,
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_payout_id;

  UPDATE public.release_review_queue
  SET status = 'pending',
      claimed_by_user_id = NULL,
      claimed_at = NULL,
      resolved_at = NULL,
      notes = concat('retry by admin: ', COALESCE(p_notes, '')),
      updated_at = now()
  WHERE transaction_id = v_tx_id AND status IN ('failed','processing','claimed');

  INSERT INTO public.admin_actions(admin_user_id, transaction_id, action_type, action_notes)
  VALUES (
    p_actor_user_id,
    v_tx_id,
    'retry_payout'::admin_action_type,
    concat('attempt #', v_attempts + 1, ' / ', COALESCE(p_notes, ''))
  );

  RETURN jsonb_build_object('ok', true, 'attempt', v_attempts + 1);
END;
$$;
