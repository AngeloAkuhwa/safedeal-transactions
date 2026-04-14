
-- 1. cart_items table
CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, product_id)
);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyers_select_own_cart" ON public.cart_items FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id);
CREATE POLICY "buyers_insert_own_cart" ON public.cart_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "buyers_update_own_cart" ON public.cart_items FOR UPDATE TO authenticated
  USING (auth.uid() = buyer_id) WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "buyers_delete_own_cart" ON public.cart_items FOR DELETE TO authenticated
  USING (auth.uid() = buyer_id);

CREATE TRIGGER update_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. checkout_sessions table
CREATE TABLE public.checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  currency_code text NOT NULL DEFAULT 'NGN',
  subtotal_amount numeric(18,2) NOT NULL DEFAULT 0,
  total_protection_fee numeric(18,2) NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyers_select_own_checkout_sessions" ON public.checkout_sessions FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id);
CREATE POLICY "buyers_insert_own_checkout_sessions" ON public.checkout_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "buyers_update_own_checkout_sessions" ON public.checkout_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = buyer_id) WITH CHECK (auth.uid() = buyer_id);

CREATE TRIGGER update_checkout_sessions_updated_at
  BEFORE UPDATE ON public.checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. checkout_session_items table
CREATE TABLE public.checkout_session_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid NOT NULL REFERENCES public.checkout_sessions(id) ON DELETE CASCADE,
  cart_item_id uuid REFERENCES public.cart_items(id) ON DELETE SET NULL,
  product_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(18,2) NOT NULL,
  line_total numeric(18,2) NOT NULL,
  transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checkout_session_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyers_select_own_checkout_items" ON public.checkout_session_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.checkout_sessions cs
    WHERE cs.id = checkout_session_items.checkout_session_id AND cs.buyer_id = auth.uid()
  ));
CREATE POLICY "buyers_insert_own_checkout_items" ON public.checkout_session_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.checkout_sessions cs
    WHERE cs.id = checkout_session_items.checkout_session_id AND cs.buyer_id = auth.uid()
  ));

-- 4. Add source_product_id and checkout_session_id to transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source_product_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS checkout_session_id uuid;
CREATE INDEX IF NOT EXISTS idx_transactions_source_product ON public.transactions (source_product_id, buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_checkout_session ON public.transactions (checkout_session_id);

-- 5. Add checkout_session_id to payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS checkout_session_id uuid;
CREATE INDEX IF NOT EXISTS idx_payments_checkout_session ON public.payments (checkout_session_id);

-- 6. Enable realtime on products
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
