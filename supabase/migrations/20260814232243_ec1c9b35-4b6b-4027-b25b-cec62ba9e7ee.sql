-- Source-side money hardening: constrain every value before money routines consume it.
ALTER TABLE public.transaction_pricing
  ADD CONSTRAINT transaction_pricing_item_amount_finite_nonnegative
    CHECK (item_amount >= 0 AND item_amount < 'Infinity'::numeric),
  ADD CONSTRAINT transaction_pricing_platform_fee_finite_nonnegative
    CHECK (platform_fee_amount >= 0 AND platform_fee_amount < 'Infinity'::numeric),
  ADD CONSTRAINT transaction_pricing_processing_fee_finite_nonnegative
    CHECK (payment_processing_fee_amount >= 0 AND payment_processing_fee_amount < 'Infinity'::numeric),
  ADD CONSTRAINT transaction_pricing_seller_payout_finite_nonnegative
    CHECK (seller_payout_amount >= 0 AND seller_payout_amount < 'Infinity'::numeric),
  ADD CONSTRAINT transaction_pricing_buyer_total_finite_nonnegative
    CHECK (buyer_total_amount >= 0 AND buyer_total_amount < 'Infinity'::numeric);

ALTER TABLE public.escrow_states
  ADD CONSTRAINT escrow_states_held_finite_nonnegative
    CHECK (held_amount >= 0 AND held_amount < 'Infinity'::numeric),
  ADD CONSTRAINT escrow_states_frozen_finite_nonnegative
    CHECK (frozen_amount >= 0 AND frozen_amount < 'Infinity'::numeric),
  ADD CONSTRAINT escrow_states_released_finite_nonnegative
    CHECK (released_amount >= 0 AND released_amount < 'Infinity'::numeric),
  ADD CONSTRAINT escrow_states_refunded_finite_nonnegative
    CHECK (refunded_amount >= 0 AND refunded_amount < 'Infinity'::numeric);

ALTER TABLE public.dispute_outcomes
  ADD CONSTRAINT dispute_outcomes_refund_finite_nonnegative
    CHECK (refund_amount >= 0 AND refund_amount < 'Infinity'::numeric),
  ADD CONSTRAINT dispute_outcomes_release_finite_nonnegative
    CHECK (release_amount >= 0 AND release_amount < 'Infinity'::numeric);

-- Adjustments are intentionally signed; all three remediation values must only be finite.
ALTER TABLE public.financial_remediations
  ADD CONSTRAINT financial_remediations_before_finite
    CHECK (before_balance > '-Infinity'::numeric AND before_balance < 'Infinity'::numeric),
  ADD CONSTRAINT financial_remediations_adjustment_finite
    CHECK (adjustment_amount > '-Infinity'::numeric AND adjustment_amount < 'Infinity'::numeric),
  ADD CONSTRAINT financial_remediations_after_finite
    CHECK (after_balance > '-Infinity'::numeric AND after_balance < 'Infinity'::numeric);

ALTER TABLE public.orchestration_tasks ALTER COLUMN currency DROP DEFAULT;

DROP POLICY IF EXISTS sellers_insert_txn_pricing ON public.transaction_pricing;
CREATE POLICY sellers_insert_txn_pricing
ON public.transaction_pricing
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transactions
    WHERE id = transaction_id AND seller_id = auth.uid()
  )
  AND public.is_finite_money(item_amount) AND item_amount >= 0
  AND public.is_finite_money(platform_fee_amount) AND platform_fee_amount >= 0
  AND public.is_finite_money(payment_processing_fee_amount) AND payment_processing_fee_amount >= 0
  AND public.is_finite_money(seller_payout_amount) AND seller_payout_amount >= 0
  AND public.is_finite_money(buyer_total_amount) AND buyer_total_amount >= 0
);

-- Refuse invalid required amounts at the function boundary rather than relying on later arithmetic.
DO $do$
DECLARE s text; s0 text; v_oid oid;
BEGIN
  SELECT oid INTO v_oid FROM pg_proc
   WHERE proname = 'ensure_platform_fee_reversal'
     AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;
  s := replace(s,
    'IF p_required IS NULL OR p_required <= 0 THEN RETURN 0; END IF;',
    'IF NOT public.is_finite_money(p_required) OR p_required <= 0 THEN
    RAISE EXCEPTION ''invalid_reversal_amount:%'', p_required;
  END IF;');
  IF s = s0 THEN
    RAISE EXCEPTION 'ensure_platform_fee_reversal: expected guard shape not found';
  END IF;
  EXECUTE s;
END $do$;

-- Repair the self-test claims: NaN reaches numeric(18,2), so these assertions
-- now prove the named CHECK constraints rather than accepting type overflow.
-- Force-inject all four balance helpers into the callee property because helper
-- composition can otherwise hide the underlying money-table touch.
DO $do$
DECLARE s text; s0 text; v_oid oid;
BEGIN
  SELECT oid INTO v_oid FROM pg_proc
   WHERE proname = 'selftest_refund_rail'
     AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;

  s := replace(s, '''Infinity''::numeric, p_currency, ''selftest'', ''pending'', ''paystack'');',
                        '''NaN''::numeric, p_currency, ''selftest'', ''pending'', ''paystack'');');
  s := replace(s, '''check'', ''refunds_check_constraint_rejects_infinity''',
                        '''check'', ''refunds_check_constraint_rejects_nonfinite''');
  s := replace(s, '''Infinity''::numeric, p_currency, ''pending'');',
                        '''NaN''::numeric, p_currency, ''pending'');');
  s := replace(s, '''check'', ''payouts_check_constraint_rejects_infinity''',
                        '''check'', ''payouts_check_constraint_rejects_nonfinite''');
  s := replace(s, '''Infinity''::numeric);', '''NaN''::numeric);');
  s := replace(s, '''check'', ''payments_check_constraint_rejects_infinity''',
                        '''check'', ''payments_check_constraint_rejects_nonfinite''');
  s := replace(s,
    'v_res := CASE WHEN SQLERRM LIKE ''%refunds_refund_amount_positive%'' OR SQLERRM LIKE ''%overflow%'' THEN ''raised'' ELSE SQLERRM END;',
    'v_res := CASE WHEN SQLERRM LIKE ''%refunds_refund_amount_positive%'' THEN ''raised'' ELSE SQLERRM END;');
  s := replace(s,
    'v_res := CASE WHEN SQLERRM LIKE ''%payouts_amount_finite_positive%'' OR SQLERRM LIKE ''%overflow%'' THEN ''raised'' ELSE SQLERRM END;',
    'v_res := CASE WHEN SQLERRM LIKE ''%payouts_amount_finite_positive%'' THEN ''raised'' ELSE SQLERRM END;');
  s := replace(s,
    'v_res := CASE WHEN SQLERRM LIKE ''%payments_amount_finite_positive%'' OR SQLERRM LIKE ''%overflow%'' THEN ''raised'' ELSE SQLERRM END;',
    'v_res := CASE WHEN SQLERRM LIKE ''%payments_amount_finite_positive%'' THEN ''raised'' ELSE SQLERRM END;');

  s := replace(s,
    'AND p.pronargs > 1
          AND pg_get_functiondef(p.oid) ~
              ''\m(escrow_ledger_entries|escrow_states|payouts|refunds|payments|transaction_pricing)\M''',
    'AND p.pronargs > 1
          AND (
            pg_get_functiondef(p.oid) ~
              ''\m(escrow_ledger_entries|escrow_states|payouts|refunds|payments|transaction_pricing|dispute_outcomes|financial_remediations)\M''
            OR p.proname IN (''escrow_available_balance'', ''escrow_uncommitted_available'',
                             ''escrow_open_commitments'', ''escrow_canonical_balance'')
          )');

  IF s = s0 THEN
    RAISE EXCEPTION 'selftest_refund_rail: expected body shapes not found';
  END IF;
  EXECUTE s;
END $do$;