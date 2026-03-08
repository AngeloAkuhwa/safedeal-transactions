
-- Allow direct funds_held_in_escrow → funds_released transition
-- (buyer confirmation releases funds synchronously)
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
  IF _old_status IN ('funds_released', 'refund_issued') THEN
    RETURN false;
  END IF;

  RETURN CASE _old_status
    WHEN 'not_secured' THEN
      _new_status IN ('payment_pending')
    WHEN 'payment_pending' THEN
      _new_status IN ('funds_held_in_escrow', 'not_secured')
    WHEN 'funds_held_in_escrow' THEN
      _new_status IN ('funds_frozen', 'funds_releasing', 'funds_released')
    WHEN 'funds_frozen' THEN
      _new_status IN ('funds_held_in_escrow', 'refund_pending')
    WHEN 'funds_releasing' THEN
      _new_status IN ('funds_released')
    WHEN 'refund_pending' THEN
      _new_status IN ('refund_issued')
    ELSE false
  END;
END;
$$;
