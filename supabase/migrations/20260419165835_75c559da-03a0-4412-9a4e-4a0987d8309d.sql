-- Phase 1: Backfill missing transaction_delivery_terms + ensure-on-lock trigger

-- 1. Backfill: any locked transaction without a terms row gets a default one
INSERT INTO public.transaction_delivery_terms (
  transaction_id,
  delivery_method,
  expected_delivery_date,
  verification_window_hours
)
SELECT
  t.id,
  'courier'::delivery_method_type,
  (COALESCE(t.agreement_locked_at, t.created_at) + interval '7 days')::date,
  72
FROM public.transactions t
LEFT JOIN public.transaction_delivery_terms d ON d.transaction_id = t.id
WHERE t.agreement_locked_at IS NOT NULL
  AND d.id IS NULL
ON CONFLICT (transaction_id) DO NOTHING;

-- 2. Trigger function: auto-create delivery terms when agreement becomes locked
CREATE OR REPLACE FUNCTION public.ensure_delivery_terms_on_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire only on transition from null → non-null
  IF (OLD.agreement_locked_at IS NULL AND NEW.agreement_locked_at IS NOT NULL) THEN
    INSERT INTO public.transaction_delivery_terms (
      transaction_id,
      delivery_method,
      expected_delivery_date,
      verification_window_hours
    )
    VALUES (
      NEW.id,
      'courier'::delivery_method_type,
      (NEW.agreement_locked_at + interval '7 days')::date,
      72
    )
    ON CONFLICT (transaction_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach the trigger
DROP TRIGGER IF EXISTS trg_ensure_delivery_terms_on_lock ON public.transactions;
CREATE TRIGGER trg_ensure_delivery_terms_on_lock
AFTER UPDATE OF agreement_locked_at ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.ensure_delivery_terms_on_lock();