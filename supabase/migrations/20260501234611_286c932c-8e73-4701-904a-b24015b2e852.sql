CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.timeout_transaction_atomic(p_tx_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status transaction_status;
  v_money money_status;
  v_seller uuid;
  v_buyer uuid;
  v_code text;
  v_product uuid;
  v_qty int := 0;
  v_balance int;
BEGIN
  SELECT status, money_status, seller_id, buyer_id, transaction_code, source_product_id
    INTO v_status, v_money, v_seller, v_buyer, v_code, v_product
  FROM public.transactions
  WHERE id = p_tx_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'tx_not_found';
  END IF;

  IF v_status <> 'awaiting_payment'::transaction_status THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_awaiting_payment', 'status', v_status);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE transaction_id = p_tx_id AND status = 'succeeded'::payment_status
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'has_succeeded_payment');
  END IF;

  -- Move money_status back to not_secured if currently payment_pending
  IF v_money = 'payment_pending'::money_status THEN
    UPDATE public.transactions
       SET money_status = 'not_secured'::money_status,
           status       = 'timed_out'::transaction_status,
           cancellation_reason = 'auto_timeout_24h',
           cancelled_at = now(),
           updated_at = now()
     WHERE id = p_tx_id;
    INSERT INTO public.money_status_history (transaction_id, old_status, new_status, reason)
    VALUES (p_tx_id, v_money, 'not_secured'::money_status, 'auto_timeout_24h');
  ELSE
    UPDATE public.transactions
       SET status = 'timed_out'::transaction_status,
           cancellation_reason = 'auto_timeout_24h',
           cancelled_at = now(),
           updated_at = now()
     WHERE id = p_tx_id;
  END IF;

  -- Release reserved stock if there is a source product
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
         'transaction_timeout', p_tx_id, 'auto_timeout_24h');
    END IF;
  END IF;

  INSERT INTO public.transaction_events (transaction_id, event_type, event_data)
  VALUES (
    p_tx_id,
    'auto_cancelled'::transaction_event_type,
    jsonb_build_object('reason', 'auto_timeout_24h', 'released_qty', v_qty)
  );

  -- Notify seller
  INSERT INTO public.notifications (user_id, type, channel, title, message, related_transaction_id)
  VALUES (
    v_seller,
    'transaction_update'::notification_type,
    'in_app'::notification_channel,
    'Payment expired',
    'Buyer did not complete payment for ' || COALESCE(v_code, 'this transaction')
      || ' within 24 hours. Reserved stock has been released.',
    p_tx_id
  );

  -- Notify buyer (if known)
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

  RETURN jsonb_build_object('ok', true, 'released_qty', v_qty);
END;
$$;

GRANT EXECUTE ON FUNCTION public.timeout_transaction_atomic(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.timeout_transaction_atomic(uuid) FROM PUBLIC;
