
CREATE OR REPLACE FUNCTION public.release_expired_awaiting_payment(_cutoff timestamptz)
RETURNS TABLE(transaction_id uuid, product_id uuid, qty integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_qty integer;
  v_product_id uuid;
  v_new_reserved integer;
  v_stock integer;
BEGIN
  FOR rec IN
    SELECT t.id AS tx_id
    FROM public.transactions t
    WHERE t.status = 'awaiting_payment'
      AND t.created_at < _cutoff
  LOOP
    SELECT pil.product_id, pil.quantity_delta
      INTO v_product_id, v_qty
    FROM public.product_inventory_logs pil
    WHERE pil.reference_type = 'transaction'
      AND pil.reference_id = rec.tx_id
      AND pil.change_type = 'reserve'
    ORDER BY pil.created_at DESC
    LIMIT 1;

    IF v_product_id IS NOT NULL AND v_qty IS NOT NULL AND v_qty > 0 THEN
      SELECT stock_quantity, GREATEST(0, reserved_quantity - v_qty)
        INTO v_stock, v_new_reserved
      FROM public.products
      WHERE id = v_product_id
      FOR UPDATE;

      UPDATE public.products
      SET reserved_quantity = v_new_reserved
      WHERE id = v_product_id;

      INSERT INTO public.product_inventory_logs(
        product_id, change_type, quantity_delta, balance_after,
        reference_type, reference_id, notes
      ) VALUES (
        v_product_id, 'release', v_qty, v_stock - v_new_reserved,
        'transaction', rec.tx_id,
        'Auto-released: checkout abandoned past cutoff'
      );

      UPDATE public.products
      SET status = 'published'
      WHERE id = v_product_id
        AND status = 'out_of_stock'
        AND (stock_quantity - v_new_reserved) > 0;

      transaction_id := rec.tx_id;
      product_id := v_product_id;
      qty := v_qty;
      RETURN NEXT;
    END IF;

    UPDATE public.transactions
    SET status = 'timed_out',
        money_status = 'not_secured',
        cancellation_reason = COALESCE(cancellation_reason, 'auto_expired_unpaid'),
        updated_at = now()
    WHERE id = rec.tx_id;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_awaiting_payment(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_awaiting_payment(timestamptz) TO service_role;

SELECT public.release_expired_awaiting_payment(now() - interval '24 hours');
