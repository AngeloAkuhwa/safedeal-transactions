CREATE TABLE public.saved_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, product_id)
);

ALTER TABLE public.saved_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyers_select_own_saved" ON public.saved_products
  FOR SELECT TO authenticated USING (auth.uid() = buyer_id);

CREATE POLICY "buyers_insert_own_saved" ON public.saved_products
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "buyers_delete_own_saved" ON public.saved_products
  FOR DELETE TO authenticated USING (auth.uid() = buyer_id);

CREATE INDEX idx_saved_products_buyer ON public.saved_products(buyer_id);
CREATE INDEX idx_saved_products_product ON public.saved_products(product_id);