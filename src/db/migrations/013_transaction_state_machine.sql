-- ════════════════════════════════════════════
-- TRANSACTION STATE MACHINE ENFORCEMENT
-- ════════════════════════════════════════════

-- 1. Validate transaction status transitions
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
  IF _old_status IN ('completed', 'cancelled', 'timed_out') THEN
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
      _new_status IN ('delivered_awaiting_verification', 'completed', 'cancelled')
    ELSE false
  END;
END;
$$;

-- 2. Validate money status transitions
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

-- 3. Enforcement trigger function
CREATE OR REPLACE FUNCTION public.enforce_transaction_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT public.validate_transaction_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid transaction status transition: % → %', OLD.status, NEW.status;
    END IF;
  END IF;

  IF OLD.money_status IS DISTINCT FROM NEW.money_status THEN
    IF NOT public.validate_money_transition(OLD.money_status, NEW.money_status) THEN
      RAISE EXCEPTION 'Invalid money status transition: % → %', OLD.money_status, NEW.money_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Attach trigger
CREATE TRIGGER enforce_transaction_state_machine
BEFORE UPDATE ON public.transactions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.money_status IS DISTINCT FROM NEW.money_status)
EXECUTE FUNCTION public.enforce_transaction_transitions();
