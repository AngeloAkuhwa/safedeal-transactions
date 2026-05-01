-- Phase B7: admin endpoint `flag-for-release-review` — fix latent bugs
-- in the existing helpers and enums before exposing the endpoint.

-- 1. The flag_for_release_review() helper writes queue_type='stuck' but the
-- CHECK constraint doesn't allow it. Map it to the allowed 'manual_hold'.
CREATE OR REPLACE FUNCTION public.flag_for_release_review(
  p_transaction_id uuid,
  p_reason text,
  p_actor_user_id uuid,
  p_notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_seller uuid;
  v_amount numeric;
  v_currency text;
  v_payout_id uuid;
  v_queue_id uuid;
  v_queue_type text;
BEGIN
  SELECT seller_id, total_amount, currency_code
    INTO v_seller, v_amount, v_currency
  FROM public.transactions WHERE id = p_transaction_id;
  IF v_seller IS NULL THEN RAISE EXCEPTION 'transaction_not_found'; END IF;

  SELECT id INTO v_payout_id FROM public.payouts
  WHERE transaction_id = p_transaction_id ORDER BY created_at DESC LIMIT 1;

  -- Map structured reasons to allowed queue_type values
  v_queue_type := CASE
    WHEN p_reason = 'payout_account_missing' THEN 'payout_account_missing'
    WHEN p_reason = 'pricing_missing' THEN 'pricing_missing'
    WHEN p_reason = 'stuck_confirmation' THEN 'stuck_confirmation'
    WHEN p_reason = 'silent_dispute' THEN 'silent_dispute'
    WHEN p_reason = 'failed_payout' THEN 'failed_payout'
    WHEN p_reason = 'refund_request' THEN 'refund_request'
    WHEN p_reason = 'transfer_reversed' THEN 'failed_payout'
    ELSE 'manual_hold'
  END;

  UPDATE public.transactions
  SET needs_release_review = true,
      release_review_reason = p_reason,
      updated_at = now()
  WHERE id = p_transaction_id;

  -- Reuse open row if one exists, else insert
  SELECT id INTO v_queue_id
  FROM public.release_review_queue
  WHERE transaction_id = p_transaction_id
    AND queue_type = v_queue_type
    AND status IN ('pending','claimed','processing')
  LIMIT 1;

  IF v_queue_id IS NULL THEN
    INSERT INTO public.release_review_queue(
      transaction_id, payout_id, seller_id, amount, currency_code,
      queue_type, status, notes
    )
    VALUES (
      p_transaction_id, v_payout_id, v_seller,
      COALESCE(v_amount, 0), COALESCE(v_currency, 'NGN'),
      v_queue_type, 'pending', p_notes
    )
    RETURNING id INTO v_queue_id;
  ELSE
    -- Append note context onto an existing open row
    UPDATE public.release_review_queue
    SET notes = COALESCE(notes, '') || E'\n' || COALESCE(p_notes, ''),
        updated_at = now()
    WHERE id = v_queue_id;
  END IF;

  INSERT INTO public.admin_actions(admin_user_id, transaction_id, action_type, action_notes)
  VALUES (
    p_actor_user_id, p_transaction_id, 'escalate_case'::admin_action_type,
    concat(p_reason, ' / ', COALESCE(p_notes, ''))
  );

  RETURN v_queue_id;
END;
$$;

-- 2. retry_payout_atomic from B5 writes admin_action_type='retry_payout' but
-- the enum doesn't have it. Fall back to 'release_funds' until the enum is
-- extended (ALTER TYPE ADD VALUE cannot run inside a transaction).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'admin_action_type' AND e.enumlabel = 'retry_payout'
  ) THEN
    -- Patch the helper to use 'release_funds' (semantically: re-issuing release)
    -- A separate, transaction-less migration can later add the enum value
    -- and revert this if desired.
    NULL;
  END IF;
END$$;

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
  v_money money_status;
BEGIN
  SELECT transaction_id, status, retry_allowed
    INTO v_tx_id, v_status, v_retry_allowed
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF v_status <> 'failed'::payout_status THEN RAISE EXCEPTION 'payout_not_failed:%', v_status; END IF;
  IF NOT v_retry_allowed THEN RAISE EXCEPTION 'retry_not_allowed'; END IF;

  SELECT money_status INTO v_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;
  IF v_money <> 'funds_pending_release'::money_status THEN
    RAISE EXCEPTION 'invalid_money_status_for_retry:%', v_money;
  END IF;

  UPDATE public.payouts
  SET status = 'awaiting_release'::payout_status,
      last_release_error = NULL,
      release_blocked = false,
      updated_at = now()
  WHERE id = p_payout_id;

  UPDATE public.release_review_queue
  SET status = 'pending', updated_at = now()
  WHERE transaction_id = v_tx_id AND status = 'failed';

  INSERT INTO public.admin_actions(admin_user_id, transaction_id, action_type, action_notes)
  VALUES (
    p_actor_user_id, v_tx_id, 'release_funds'::admin_action_type,
    concat('retry_payout: ', COALESCE(p_notes, ''))
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;
