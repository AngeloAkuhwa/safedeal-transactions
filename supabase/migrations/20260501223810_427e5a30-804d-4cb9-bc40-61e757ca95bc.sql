-- Phase B finalize: freeze_funds_atomic + extend flag_for_release_review reasons

-- 1) freeze_funds_atomic: atomically move money to funds_frozen and stamp the tx
CREATE OR REPLACE FUNCTION public.freeze_funds_atomic(
  p_transaction_id uuid,
  p_actor uuid,
  p_reason text
) RETURNS public.money_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.money_status;
  v_new public.money_status := 'funds_frozen';
  v_allowed boolean;
BEGIN
  SELECT money_status INTO v_old FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  IF v_old = v_new THEN
    -- Already frozen — idempotent no-op
    UPDATE public.transactions
       SET needs_release_review = true,
           release_review_reason = COALESCE(release_review_reason, 'manual_hold')
     WHERE id = p_transaction_id;
    RETURN v_new;
  END IF;

  -- Validate using the existing money state machine
  SELECT public.validate_money_transition(v_old, v_new) INTO v_allowed;
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'transition_not_allowed: % -> %', v_old, v_new;
  END IF;

  UPDATE public.transactions
     SET money_status = v_new,
         needs_release_review = true,
         release_review_reason = COALESCE(p_reason, 'manual_hold'),
         updated_at = now()
   WHERE id = p_transaction_id;

  INSERT INTO public.money_status_history (transaction_id, old_status, new_status, changed_by_user_id, reason, changed_at)
  VALUES (p_transaction_id, v_old, v_new, p_actor, COALESCE(p_reason, 'manual_hold'), now());

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.freeze_funds_atomic(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.freeze_funds_atomic(uuid, uuid, text) TO service_role;

-- 2) Extend flag_for_release_review to accept the 2 missing-confirmation reasons
--    plus delivery_proof_missing and suspicious_activity. queue_type is text,
--    so we map the missing-confirmation reasons to 'stuck' and pass-through the rest.
CREATE OR REPLACE FUNCTION public.flag_for_release_review(
  p_transaction_id uuid,
  p_reason text,
  p_actor_user_id uuid,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_type text;
  v_queue_id uuid;
  v_seller uuid;
  v_payout uuid;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  -- Map reasons -> queue_type
  v_queue_type := CASE p_reason
    WHEN 'missing_seller_confirmation' THEN 'stuck'
    WHEN 'missing_buyer_confirmation' THEN 'stuck'
    WHEN 'stuck_confirmation' THEN 'stuck'
    WHEN 'payout_account_missing' THEN 'payout_account_missing'
    WHEN 'pricing_missing' THEN 'pricing_missing'
    WHEN 'silent_dispute' THEN 'silent_dispute'
    WHEN 'failed_payout' THEN 'failed_payout'
    WHEN 'refund_request' THEN 'refund_request'
    WHEN 'transfer_reversed' THEN 'transfer_reversed'
    WHEN 'manual_hold' THEN 'manual_hold'
    WHEN 'delivery_proof_missing' THEN 'delivery_proof_missing'
    WHEN 'suspicious_activity' THEN 'suspicious_activity'
    ELSE p_reason
  END;

  -- Stamp the transaction
  UPDATE public.transactions
     SET needs_release_review = true,
         release_review_reason = p_reason,
         updated_at = now()
   WHERE id = p_transaction_id
   RETURNING seller_id INTO v_seller;

  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  SELECT id INTO v_payout
    FROM public.payouts
   WHERE transaction_id = p_transaction_id
   ORDER BY created_at DESC
   LIMIT 1;

  -- Idempotent upsert via the unique partial index on open queue rows
  INSERT INTO public.release_review_queue (
    transaction_id, payout_id, seller_id, queue_type, status, notes, entered_queue_at
  ) VALUES (
    p_transaction_id, v_payout, v_seller, v_queue_type, 'pending', p_notes, now()
  )
  ON CONFLICT (transaction_id, queue_type) WHERE status = ANY (ARRAY['pending'::text,'claimed'::text,'processing'::text,'awaiting_info'::text,'held'::text])
  DO UPDATE SET
    notes = COALESCE(EXCLUDED.notes, public.release_review_queue.notes),
    payout_id = COALESCE(EXCLUDED.payout_id, public.release_review_queue.payout_id)
  RETURNING id INTO v_queue_id;

  -- Audit
  INSERT INTO public.admin_actions (admin_user_id, transaction_id, action_type, action_notes)
  VALUES (p_actor_user_id, p_transaction_id, 'escalate_case', COALESCE(p_notes, p_reason));

  RETURN v_queue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.flag_for_release_review(uuid, text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.flag_for_release_review(uuid, text, uuid, text) TO service_role;