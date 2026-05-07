
-- 1. Add metadata to ledger
ALTER TABLE public.escrow_ledger_entries
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- 2. Add admin review flags to transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS needs_admin_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_review_reason text;

-- 3. Replace unfreeze_funds_atomic
CREATE OR REPLACE FUNCTION public.unfreeze_funds_atomic(
  p_transaction_id uuid,
  p_actor uuid,
  p_target money_status,
  p_reason text
)
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
$function$;
