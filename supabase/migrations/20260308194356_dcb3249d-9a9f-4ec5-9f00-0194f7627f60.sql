
-- Add resolved and refunded to transaction_status enum
ALTER TYPE public.transaction_status ADD VALUE IF NOT EXISTS 'resolved';
ALTER TYPE public.transaction_status ADD VALUE IF NOT EXISTS 'refunded';

-- Replace validate_transaction_transition with corrected map
CREATE OR REPLACE FUNCTION public.validate_transaction_transition(
  _old_status transaction_status,
  _new_status transaction_status
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Terminal states: no transitions allowed out
  IF _old_status IN ('completed', 'cancelled', 'timed_out', 'refunded') THEN
    RETURN false;
  END IF;

  RETURN CASE _old_status
    WHEN 'draft' THEN
      _new_status IN ('awaiting_buyer', 'awaiting_payment', 'cancelled')
    WHEN 'awaiting_buyer' THEN
      _new_status IN ('awaiting_payment', 'cancelled')
    WHEN 'awaiting_payment' THEN
      _new_status IN ('payment_secured', 'cancelled', 'timed_out')
    WHEN 'payment_secured' THEN
      _new_status IN ('seller_preparing_delivery', 'cancelled')
    WHEN 'seller_preparing_delivery' THEN
      _new_status IN ('seller_dispatched', 'cancelled')
    WHEN 'seller_dispatched' THEN
      _new_status IN ('delivered_awaiting_verification')
    WHEN 'delivered_awaiting_verification' THEN
      _new_status IN ('completed', 'disputed', 'timed_out')
    WHEN 'disputed' THEN
      _new_status IN ('resolved')
    WHEN 'resolved' THEN
      _new_status IN ('completed', 'refunded')
    ELSE false
  END;
END;
$$;

-- Replace validate_money_transition with corrected map
CREATE OR REPLACE FUNCTION public.validate_money_transition(
  _old_status money_status,
  _new_status money_status
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Terminal states
  IF _old_status IN ('funds_released', 'refund_issued') THEN
    RETURN false;
  END IF;

  RETURN CASE _old_status
    WHEN 'not_secured' THEN
      _new_status IN ('payment_pending')
    WHEN 'payment_pending' THEN
      _new_status IN ('funds_held_in_escrow', 'not_secured')
    WHEN 'funds_held_in_escrow' THEN
      _new_status IN ('funds_frozen', 'funds_releasing')
    WHEN 'funds_frozen' THEN
      _new_status IN ('funds_releasing', 'refund_pending')
    WHEN 'funds_releasing' THEN
      _new_status IN ('funds_released')
    WHEN 'refund_pending' THEN
      _new_status IN ('refund_issued')
    ELSE false
  END;
END;
$$;
