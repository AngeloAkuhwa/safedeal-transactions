
-- Add dispute outcome enum values
ALTER TYPE public.dispute_outcome_type ADD VALUE IF NOT EXISTS 'partial_refund_release';
ALTER TYPE public.dispute_outcome_type ADD VALUE IF NOT EXISTS 'dismissed_seller_favor';
ALTER TYPE public.dispute_outcome_type ADD VALUE IF NOT EXISTS 'dismissed_buyer_favor';

-- Add escrow ledger entry types for dispute resolution
ALTER TYPE public.escrow_ledger_entry_type ADD VALUE IF NOT EXISTS 'dispute_refund_reserved';
ALTER TYPE public.escrow_ledger_entry_type ADD VALUE IF NOT EXISTS 'dispute_release_approved_pending_admin_release';
ALTER TYPE public.escrow_ledger_entry_type ADD VALUE IF NOT EXISTS 'dispute_no_action';

-- Add transaction event types for dispute resolution + more-info flow
ALTER TYPE public.transaction_event_type ADD VALUE IF NOT EXISTS 'dispute_resolved';
ALTER TYPE public.transaction_event_type ADD VALUE IF NOT EXISTS 'dispute_more_info_requested';

-- Loosen release_review_queue.queue_type CHECK to accept dispute-resolved categories
ALTER TABLE public.release_review_queue DROP CONSTRAINT IF EXISTS rrq_queue_type_check;
ALTER TABLE public.release_review_queue ADD CONSTRAINT rrq_queue_type_check CHECK (
  queue_type = ANY (ARRAY[
    'ready_for_release'::text,
    'payout_account_missing'::text,
    'pricing_missing'::text,
    'stuck_confirmation'::text,
    'silent_dispute'::text,
    'failed_payout'::text,
    'refund_request'::text,
    'manual_hold'::text,
    'dispute_resolved_seller_favor'::text,
    'dispute_resolved_dismissed_seller'::text,
    'dispute_resolved_partial'::text
  ])
);

-- Extend money status transition matrix
CREATE OR REPLACE FUNCTION public.validate_money_transition(_old_status money_status, _new_status money_status)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _old_status = 'refund_issued' THEN
    RETURN false;
  END IF;
  RETURN CASE _old_status
    WHEN 'not_secured' THEN
      _new_status IN ('payment_pending')
    WHEN 'payment_pending' THEN
      _new_status IN ('funds_held_in_escrow', 'not_secured')
    WHEN 'funds_held_in_escrow' THEN
      _new_status IN ('funds_pending_release', 'funds_frozen')
    WHEN 'funds_pending_release' THEN
      _new_status IN ('funds_releasing', 'funds_frozen', 'refund_pending')
    WHEN 'funds_frozen' THEN
      _new_status IN ('funds_held_in_escrow', 'funds_pending_release', 'refund_pending')
    WHEN 'funds_releasing' THEN
      _new_status IN ('funds_released', 'funds_pending_release')
    WHEN 'funds_released' THEN
      false
    WHEN 'refund_pending' THEN
      -- refund_issued is normal terminal; funds_pending_release supports partial dispute outcome rollback after refund completes
      _new_status IN ('refund_issued', 'funds_pending_release')
    ELSE false
  END;
END;
$function$;
