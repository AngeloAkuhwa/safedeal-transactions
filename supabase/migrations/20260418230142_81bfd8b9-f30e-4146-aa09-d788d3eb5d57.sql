-- Multi-item support for private offers
CREATE TABLE public.buyer_specific_offer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.buyer_specific_product_offers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_title text NOT NULL,
  short_description text,
  condition_summary text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_snapshot numeric NOT NULL CHECK (unit_price_snapshot >= 0),
  currency_code text NOT NULL DEFAULT 'NGN',
  primary_media_url text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_offer_items_offer ON public.buyer_specific_offer_items(offer_id);
CREATE INDEX idx_offer_items_product ON public.buyer_specific_offer_items(product_id);

ALTER TABLE public.buyer_specific_offer_items ENABLE ROW LEVEL SECURITY;

-- Sellers see/insert their own offer items
CREATE POLICY "sellers_select_own_offer_items"
  ON public.buyer_specific_offer_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.buyer_specific_product_offers o
    WHERE o.id = offer_id AND o.seller_id = auth.uid()
  ));

CREATE POLICY "sellers_insert_own_offer_items"
  ON public.buyer_specific_offer_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.buyer_specific_product_offers o
    WHERE o.id = offer_id AND o.seller_id = auth.uid()
  ));

-- Linked buyers can view items
CREATE POLICY "buyers_select_linked_offer_items"
  ON public.buyer_specific_offer_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.buyer_specific_product_offers o
    WHERE o.id = offer_id
      AND (
        o.buyer_id = auth.uid()
        OR (o.buyer_id IS NULL AND o.buyer_email IS NOT NULL
            AND lower(o.buyer_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())::text))
      )
  ));

-- Admins
CREATE POLICY "admins_select_all_offer_items"
  ON public.buyer_specific_offer_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::user_role_type));

-- Helpful index for visibility filter on seller storefront
CREATE INDEX IF NOT EXISTS idx_products_visibility_buyer_specific
  ON public.products(seller_id) WHERE visibility_type = 'buyer_specific';