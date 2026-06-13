
CREATE OR REPLACE FUNCTION public.reconcile_all_product_reservations()
RETURNS TABLE(product_id uuid, old_reserved integer, new_reserved integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  v_open_reserved integer;
BEGIN
  FOR p IN SELECT id, reserved_quantity, stock_quantity, status FROM public.products LOOP
    -- Sum reserves whose transaction is still awaiting_payment (i.e. truly open)
    SELECT COALESCE(SUM(pil.quantity_delta), 0)
      INTO v_open_reserved
    FROM public.product_inventory_logs pil
    JOIN public.transactions t ON t.id = pil.reference_id
    WHERE pil.product_id = p.id
      AND pil.change_type = 'reserve'
      AND pil.reference_type = 'transaction'
      AND t.status = 'awaiting_payment';

    IF v_open_reserved <> p.reserved_quantity THEN
      UPDATE public.products
      SET reserved_quantity = v_open_reserved
      WHERE id = p.id;

      product_id := p.id;
      old_reserved := p.reserved_quantity;
      new_reserved := v_open_reserved;
      RETURN NEXT;
    END IF;

    -- Republish if available > 0 but status stuck at out_of_stock
    IF p.status = 'out_of_stock' AND (p.stock_quantity - v_open_reserved) > 0 THEN
      UPDATE public.products SET status = 'published' WHERE id = p.id;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_all_product_reservations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_all_product_reservations() TO service_role;

SELECT * FROM public.reconcile_all_product_reservations();
