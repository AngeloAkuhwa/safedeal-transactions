-- The pricing lock's role gate must read the internal roles catalogue; the
-- buyer/seller role enum has no super_admin member, so the previous check
-- raised a type error instead of authorising.
CREATE OR REPLACE FUNCTION public.prevent_pricing_update_after_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_locked   TIMESTAMPTZ;
  v_money    public.money_status;
  v_actor    UUID := auth.uid();
  v_override BOOLEAN := COALESCE(current_setting('safedeal.pricing_override', true) = 'on', false);
BEGIN
  IF v_override AND v_actor IS NOT NULL
     AND public.has_internal_role(v_actor, 'super_admin')
     AND public.internal_access_active(v_actor) THEN
    RETURN NEW;
  END IF;

  SELECT agreement_locked_at, money_status
    INTO v_locked, v_money
  FROM public.transactions
  WHERE id = NEW.transaction_id;

  IF v_locked IS NOT NULL
     OR v_money IN ('funds_held_in_escrow','funds_pending_release','funds_releasing',
                    'funds_released','funds_frozen','refund_pending','refund_issued') THEN
    RAISE EXCEPTION 'transaction_pricing is locked after payment (tx=%, money_status=%)',
      NEW.transaction_id, v_money
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

-- Same correction inside the audited correction path, which was gated on the
-- same non-existent enum value and therefore could never run.
DO $do$
DECLARE s text; s0 text; v_oid oid;
BEGIN
  SELECT oid INTO v_oid FROM pg_proc WHERE proname = 'admin_correct_pricing'
    AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;
  s := replace(s,
    'NOT public.has_role(v_admin, ''super_admin''::public.app_role)',
    'NOT (public.has_internal_role(v_admin, ''super_admin'') AND public.internal_access_active(v_admin))');
  IF s = s0 THEN RAISE EXCEPTION 'admin_correct_pricing: expected role check not found'; END IF;
  EXECUTE s;
END $do$;