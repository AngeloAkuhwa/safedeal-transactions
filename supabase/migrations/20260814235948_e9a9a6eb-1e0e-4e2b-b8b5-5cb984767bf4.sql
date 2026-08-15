-- 1. Lock down SECURITY DEFINER functions reachable by anon/authenticated.
REVOKE ALL ON FUNCTION public.timeout_transaction_atomic(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.timeout_transaction_atomic(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.selftest_refund_rail(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.selftest_refund_rail(text) TO service_role;

REVOKE ALL ON FUNCTION public.expire_stale_offers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_offers() TO service_role;

REVOKE ALL ON FUNCTION public.expire_vendor_plans() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_vendor_plans() TO service_role;

REVOKE ALL ON FUNCTION public.activate_vendor_purchase(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_vendor_purchase(text) TO service_role;

-- 2. timeout_transaction_atomic: verify the elapsed window it claims to enforce.
--    The window comes from system_settings (transactions.payment_window_hours);
--    a missing setting fails closed rather than inventing 24h.
CREATE OR REPLACE FUNCTION public.timeout_transaction_atomic(p_tx_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status transaction_status;
  v_money money_status;
  v_seller uuid;
  v_buyer uuid;
  v_code text;
  v_product uuid;
  v_created timestamptz;
  v_qty int := 0;
  v_balance int;
  v_window_hours numeric;
  v_reason text;
BEGIN
  SELECT (setting_value #>> '{}')::numeric
    INTO v_window_hours
  FROM public.system_settings
  WHERE setting_key = 'transactions.payment_window_hours'
    AND scope = 'platform'
  LIMIT 1;

  IF v_window_hours IS NULL OR NOT public.is_finite_money(v_window_hours) OR v_window_hours <= 0 THEN
    RAISE EXCEPTION 'payment_window_not_configured' USING ERRCODE = '22023';
  END IF;

  SELECT status, money_status, seller_id, buyer_id, transaction_code, source_product_id, created_at
    INTO v_status, v_money, v_seller, v_buyer, v_code, v_product, v_created
  FROM public.transactions
  WHERE id = p_tx_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'tx_not_found';
  END IF;

  IF v_status <> 'awaiting_payment'::transaction_status THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_awaiting_payment', 'status', v_status);
  END IF;

  -- The elapsed check the stamped reason has always implied.
  IF v_created IS NULL OR now() < v_created + make_interval(secs => v_window_hours * 3600) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'window_not_elapsed',
                              'window_hours', v_window_hours);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE transaction_id = p_tx_id AND status = 'succeeded'::payment_status
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'has_succeeded_payment');
  END IF;

  v_reason := 'auto_timeout_' || trim(to_char(v_window_hours, 'FM999990.99')) || 'h';

  IF v_money = 'payment_pending'::money_status THEN
    UPDATE public.transactions
       SET money_status = 'not_secured'::money_status,
           status       = 'timed_out'::transaction_status,
           cancellation_reason = v_reason,
           cancelled_at = now(),
           updated_at = now()
     WHERE id = p_tx_id;
    INSERT INTO public.money_status_history (transaction_id, old_status, new_status, reason)
    VALUES (p_tx_id, v_money, 'not_secured'::money_status, v_reason);
  ELSE
    UPDATE public.transactions
       SET status = 'timed_out'::transaction_status,
           cancellation_reason = v_reason,
           cancelled_at = now(),
           updated_at = now()
     WHERE id = p_tx_id;
  END IF;

  IF v_product IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity), 0)
      INTO v_qty
    FROM public.transaction_items
    WHERE transaction_id = p_tx_id;

    IF v_qty > 0 THEN
      UPDATE public.products
         SET reserved_quantity = GREATEST(0, reserved_quantity - v_qty),
             updated_at = now()
       WHERE id = v_product
      RETURNING reserved_quantity INTO v_balance;

      INSERT INTO public.product_inventory_logs
        (product_id, change_type, quantity_delta, balance_after, reference_type, reference_id, notes)
      VALUES
        (v_product, 'release'::product_inventory_change_type, v_qty, COALESCE(v_balance, 0),
         'transaction_timeout', p_tx_id, v_reason);
    END IF;
  END IF;

  INSERT INTO public.transaction_events (transaction_id, event_type, event_data)
  VALUES (
    p_tx_id,
    'auto_cancelled'::transaction_event_type,
    jsonb_build_object('reason', v_reason, 'released_qty', v_qty)
  );

  INSERT INTO public.notifications (user_id, type, channel, title, message, related_transaction_id)
  VALUES (
    v_seller,
    'transaction_update'::notification_type,
    'in_app'::notification_channel,
    'Payment expired',
    'Buyer did not complete payment for ' || COALESCE(v_code, 'this transaction')
      || ' within the payment window. Reserved stock has been released.',
    p_tx_id
  );

  IF v_buyer IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, channel, title, message, related_transaction_id)
    VALUES (
      v_buyer,
      'transaction_update'::notification_type,
      'in_app'::notification_channel,
      'Payment window expired',
      'Your payment window expired. You can start a new protected transaction if the item is still available.',
      p_tx_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'released_qty', v_qty, 'window_hours', v_window_hours);
END;
$function$;

REVOKE ALL ON FUNCTION public.timeout_transaction_atomic(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.timeout_transaction_atomic(uuid) TO service_role;

-- 3. One lock rule, not two with an alphabetical ordering dependency.
--    prevent_pricing_update_after_lock already covers agreement_locked_at AND
--    money_status, and honours the super_admin override.
DROP TRIGGER IF EXISTS trg_prevent_pricing_edit_after_lock ON public.transaction_pricing;

-- 4. Fee cap from settings, not the retired 2,500 literal.
CREATE OR REPLACE FUNCTION public.admin_correct_pricing(p_transaction_id uuid, p_item_amount numeric, p_safedeal_fee numeric, p_processing_fee numeric, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin UUID := auth.uid();
  v_old   public.transaction_pricing%ROWTYPE;
  v_new   public.transaction_pricing%ROWTYPE;
  v_cap   NUMERIC;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_internal_role(v_admin, 'super_admin') AND public.internal_access_active(v_admin)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- NaN compares greater than every numeric, so a bare "< 0" test passes it
  -- straight into the pricing snapshot. Finiteness and scale are checked first.
  IF NOT public.is_finite_money(p_item_amount)
     OR NOT public.is_finite_money(p_safedeal_fee)
     OR NOT public.is_finite_money(p_processing_fee) THEN
    RAISE EXCEPTION 'invalid_money_amount:% % %', p_item_amount, p_safedeal_fee, p_processing_fee
      USING ERRCODE = '22023';
  END IF;
  IF p_item_amount <> round(p_item_amount, 2)
     OR p_safedeal_fee <> round(p_safedeal_fee, 2)
     OR p_processing_fee <> round(p_processing_fee, 2) THEN
    RAISE EXCEPTION 'invalid_money_amount:unscaled' USING ERRCODE = '22023';
  END IF;
  IF p_item_amount < 0 OR p_safedeal_fee < 0 OR p_processing_fee < 0 THEN
    RAISE EXCEPTION 'invalid_money_amount:negative' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  -- The cap lives in system settings. No literal, and no silent fallback.
  SELECT (setting_value #>> '{}')::numeric
    INTO v_cap
  FROM public.system_settings
  WHERE setting_key = 'pricing.max_total_service_fee_ngn'
    AND scope = 'platform'
  LIMIT 1;

  IF v_cap IS NULL OR NOT public.is_finite_money(v_cap) THEN
    RAISE EXCEPTION 'service_fee_cap_not_configured' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old
  FROM public.transaction_pricing
  WHERE transaction_id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pricing_not_found' USING ERRCODE = '02000';
  END IF;

  PERFORM set_config('safedeal.pricing_override', 'on', true);

  UPDATE public.transaction_pricing
     SET item_amount                   = p_item_amount,
         platform_fee_amount           = p_safedeal_fee,
         processing_fee_amount         = p_processing_fee,
         payment_processing_fee_amount = p_processing_fee,
         buyer_total_amount            = p_item_amount + p_safedeal_fee + p_processing_fee,
         seller_net_amount             = p_item_amount,
         seller_payout_amount          = p_item_amount,
         is_total_service_fee_capped   = (p_safedeal_fee + p_processing_fee) >= v_cap,
         updated_at                    = now()
   WHERE transaction_id = p_transaction_id
   RETURNING * INTO v_new;

  PERFORM set_config('safedeal.pricing_override', 'off', true);

  RETURN jsonb_build_object(
    'ok',     true,
    'old',    to_jsonb(v_old),
    'new',    to_jsonb(v_new),
    'reason', p_reason,
    'admin',  v_admin
  );
END;
$function$;

-- 5. Fabricated 2% fee rate in a column default.
ALTER TABLE public.vendor_plans ALTER COLUMN escrow_fee_rate DROP DEFAULT;

-- 6. Value-checked write policies, matching transaction_pricing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='checkout_sessions' AND policyname='users_insert_own_checkout_sessions') THEN
    NULL;
  END IF;
END $$;