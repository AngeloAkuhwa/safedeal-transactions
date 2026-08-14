-- 1. UPDATE path on transaction_pricing validates amounts, like INSERT does.
DROP POLICY IF EXISTS sellers_update_txn_pricing ON public.transaction_pricing;
CREATE POLICY sellers_update_txn_pricing
  ON public.transaction_pricing FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transactions t
                  WHERE t.id = transaction_id AND t.seller_id = auth.uid()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.transactions t
             WHERE t.id = transaction_id AND t.seller_id = auth.uid())
    AND public.is_finite_money(item_amount) AND item_amount >= 0
    AND public.is_finite_money(buyer_total_amount) AND buyer_total_amount >= 0
    AND (platform_fee_amount IS NULL
         OR (public.is_finite_money(platform_fee_amount) AND platform_fee_amount >= 0))
    AND (payment_processing_fee_amount IS NULL
         OR (public.is_finite_money(payment_processing_fee_amount) AND payment_processing_fee_amount >= 0))
    AND (seller_payout_amount IS NULL
         OR (public.is_finite_money(seller_payout_amount) AND seller_payout_amount >= 0))
  );

-- 2. The pricing lock is gated on a ROLE, not on a session variable. The GUC
--    stays only as an explicit intent marker set by admin_correct_pricing; on
--    its own it grants nothing.
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
     AND public.has_role(v_actor, 'super_admin'::public.app_role) THEN
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

-- 3. Fabricated currency labels removed at the source. Every writer passes a
--    currency explicitly, so a default can only mislabel.
ALTER TABLE public.buyer_specific_offer_items ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.checkout_sessions        ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.products                 ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.release_review_queue     ALTER COLUMN currency_code DROP DEFAULT;
ALTER TABLE public.vendor_plan_purchases    ALTER COLUMN currency_code DROP DEFAULT;

-- 4. Selftest: stale comment corrected, and the GUC bypass is proven closed.
DO $do$
DECLARE s text; s0 text; v_oid oid;
BEGIN
  SELECT oid INTO v_oid FROM pg_proc WHERE proname = 'selftest_refund_rail'
    AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;

  s := replace(s,
'      -- Property, not name: any SECURITY DEFINER function that takes more than
      -- one argument and touches a money table.',
'      -- Property, not name: any SECURITY DEFINER function that touches a money
      -- table, at any arity.');

  s := replace(s,
'      ''check'', ''dispute_unwinds_frozen_escrow'',
      ''pass'', (SELECT frozen_amount = 0 FROM public.escrow_states WHERE transaction_id = v_dtx));',
'      ''check'', ''dispute_unwinds_frozen_escrow'',
      ''pass'', (SELECT frozen_amount = 0 FROM public.escrow_states WHERE transaction_id = v_dtx));

    -- ── the pricing lock is not bypassable by a session variable alone ──────
    BEGIN
      PERFORM set_config(''safedeal.pricing_override'', ''on'', true);
      PERFORM set_config(''request.jwt.claims'',
        json_build_object(''sub'', v_buyer::text)::text, true);
      UPDATE public.transaction_pricing SET item_amount = item_amount + 1
       WHERE transaction_id = v_dtx;
      v_res := ''FAILED_no_exception'';
    EXCEPTION WHEN others THEN
      v_res := CASE WHEN SQLERRM LIKE ''%locked after payment%'' THEN ''raised'' ELSE SQLERRM END;
    END;
    PERFORM set_config(''safedeal.pricing_override'', ''off'', true);
    PERFORM set_config(''request.jwt.claims'', '''', true);
    v_checks := v_checks || jsonb_build_object(
      ''check'', ''pricing_override_requires_super_admin'', ''pass'', v_res = ''raised'',
      ''detail'', v_res);');

  IF s = s0 THEN RAISE EXCEPTION 'selftest_refund_rail: expected body shape not found'; END IF;
  EXECUTE s;
END $do$;