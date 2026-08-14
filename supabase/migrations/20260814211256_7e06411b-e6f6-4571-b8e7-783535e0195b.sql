CREATE OR REPLACE FUNCTION public.ensure_delivery_terms_on_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF (OLD.agreement_locked_at IS NULL AND NEW.agreement_locked_at IS NOT NULL) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.transaction_delivery_terms WHERE transaction_id = NEW.id
    ) INTO v_exists;

    IF NOT v_exists THEN
      -- Fail closed: delivery method, delivery date and verification window are
      -- commitments only the seller can make. A locked agreement without them is
      -- a data-integrity fault to be reviewed, never a gap to fill with
      -- fabricated 'courier' / +7 days / 72h terms.
      INSERT INTO public.system_logs (level, service_name, message, metadata)
      VALUES (
        'error',
        'ensure_delivery_terms_on_lock',
        'Agreement locked with no delivery terms recorded',
        jsonb_build_object('transaction_id', NEW.id, 'agreement_locked_at', NEW.agreement_locked_at)
      );

      BEGIN
        PERFORM public.flag_for_release_review(
          NEW.id,
          'manual_hold',
          NULL,
          'Agreement locked without delivery terms: no delivery method or verification window was ever set by the seller. Terms must be established manually; SafeDeal will not invent them.'
        );
      EXCEPTION WHEN OTHERS THEN
        -- Never block payment capture on the flagging path; the log above is
        -- the durable record.
        NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;