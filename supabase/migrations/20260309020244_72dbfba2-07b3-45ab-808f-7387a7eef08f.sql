
-- Function to prevent edits on agreement tables after lock
CREATE OR REPLACE FUNCTION public.prevent_edit_after_agreement_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _locked_at timestamptz;
BEGIN
  SELECT agreement_locked_at INTO _locked_at
  FROM public.transactions
  WHERE id = NEW.transaction_id;

  IF _locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot modify a locked agreement. Payment has been made and terms are immutable.';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to transaction_items
CREATE TRIGGER trg_prevent_item_edit_after_lock
  BEFORE UPDATE ON public.transaction_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_edit_after_agreement_lock();

-- Attach trigger to transaction_pricing
CREATE TRIGGER trg_prevent_pricing_edit_after_lock
  BEFORE UPDATE ON public.transaction_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_edit_after_agreement_lock();

-- Attach trigger to transaction_delivery_terms
CREATE TRIGGER trg_prevent_delivery_edit_after_lock
  BEFORE UPDATE ON public.transaction_delivery_terms
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_edit_after_agreement_lock();
