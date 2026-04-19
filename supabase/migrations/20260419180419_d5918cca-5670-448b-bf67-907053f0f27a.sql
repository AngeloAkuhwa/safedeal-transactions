-- Enum for inventory change types
CREATE TYPE public.product_inventory_change_type AS ENUM (
  'restock',
  'reserve',
  'release',
  'sold',
  'manual_adjustment'
);

-- Inventory log table
CREATE TABLE public.product_inventory_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  change_type public.product_inventory_change_type NOT NULL,
  quantity_delta integer NOT NULL,
  balance_after integer NOT NULL,
  reference_type text NULL,
  reference_id uuid NULL,
  notes text NULL,
  changed_by_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_product_inventory_logs_product_id_created_at
  ON public.product_inventory_logs (product_id, created_at DESC);
CREATE INDEX idx_product_inventory_logs_reference
  ON public.product_inventory_logs (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

-- RLS
ALTER TABLE public.product_inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sellers_select_own_inventory_logs"
  ON public.product_inventory_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_inventory_logs.product_id
        AND p.seller_id = auth.uid()
    )
  );

CREATE POLICY "admins_select_all_inventory_logs"
  ON public.product_inventory_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type));

-- Block deletes (financial integrity)
CREATE TRIGGER prevent_inventory_log_delete
  BEFORE DELETE ON public.product_inventory_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete();

-- Auto out-of-stock trigger
CREATE OR REPLACE FUNCTION public.auto_out_of_stock_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _available integer;
BEGIN
  -- Only react if stock_quantity or reserved_quantity actually changed
  IF (OLD.stock_quantity IS NOT DISTINCT FROM NEW.stock_quantity
      AND OLD.reserved_quantity IS NOT DISTINCT FROM NEW.reserved_quantity) THEN
    RETURN NEW;
  END IF;

  -- Skip drafts and archived products
  IF NEW.status IN ('draft', 'archived') THEN
    RETURN NEW;
  END IF;

  _available := COALESCE(NEW.stock_quantity, 0) - COALESCE(NEW.reserved_quantity, 0);

  IF _available <= 0 AND NEW.status = 'published' THEN
    NEW.status := 'out_of_stock';
  ELSIF _available > 0 AND NEW.status = 'out_of_stock' THEN
    NEW.status := 'published';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER products_auto_out_of_stock
  BEFORE UPDATE OF stock_quantity, reserved_quantity ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.auto_out_of_stock_status();