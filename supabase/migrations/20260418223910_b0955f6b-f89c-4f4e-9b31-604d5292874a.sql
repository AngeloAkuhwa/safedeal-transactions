-- ============================================================
-- Batch 5: Buyer-Specific (Private) Offers
-- ============================================================

-- 1. Enum
CREATE TYPE public.buyer_specific_offer_status AS ENUM (
  'pending_claim',
  'linked',
  'claimed',
  'purchased',
  'expired',
  'cancelled'
);

-- 2. Main offers table
CREATE TABLE public.buyer_specific_product_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  buyer_id uuid NULL,
  buyer_email text NULL,
  offer_token text UNIQUE NOT NULL,
  previous_tokens text[] NOT NULL DEFAULT '{}',
  status public.buyer_specific_offer_status NOT NULL DEFAULT 'pending_claim',
  expires_at timestamptz NULL,
  linked_at timestamptz NULL,
  claimed_at timestamptz NULL,
  purchased_at timestamptz NULL,
  expired_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  created_via text NOT NULL DEFAULT 'create_transaction_wizard',
  source_draft_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_offers_seller ON public.buyer_specific_product_offers(seller_id);
CREATE INDEX idx_offers_buyer ON public.buyer_specific_product_offers(buyer_id) WHERE buyer_id IS NOT NULL;
CREATE INDEX idx_offers_buyer_email ON public.buyer_specific_product_offers(lower(buyer_email)) WHERE buyer_email IS NOT NULL;
CREATE INDEX idx_offers_token ON public.buyer_specific_product_offers(offer_token);
CREATE INDEX idx_offers_status ON public.buyer_specific_product_offers(status);
CREATE INDEX idx_offers_product ON public.buyer_specific_product_offers(product_id);

CREATE TRIGGER trg_offers_updated_at
  BEFORE UPDATE ON public.buyer_specific_product_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.buyer_specific_product_offers ENABLE ROW LEVEL SECURITY;

-- Sellers
CREATE POLICY "sellers_select_own_offers"
  ON public.buyer_specific_product_offers FOR SELECT
  TO authenticated
  USING (auth.uid() = seller_id);

CREATE POLICY "sellers_insert_own_offers"
  ON public.buyer_specific_product_offers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "sellers_update_own_offers"
  ON public.buyer_specific_product_offers FOR UPDATE
  TO authenticated
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

-- Buyers
CREATE POLICY "buyers_select_linked_offers"
  ON public.buyer_specific_product_offers FOR SELECT
  TO authenticated
  USING (
    auth.uid() = buyer_id
    OR (
      buyer_id IS NULL
      AND buyer_email IS NOT NULL
      AND lower(buyer_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
    )
  );

-- Admins
CREATE POLICY "admins_select_all_offers"
  ON public.buyer_specific_product_offers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins_update_all_offers"
  ON public.buyer_specific_product_offers FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Offer events (audit trail)
CREATE TABLE public.offer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.buyer_specific_product_offers(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_offer_events_offer ON public.offer_events(offer_id);
CREATE INDEX idx_offer_events_created ON public.offer_events(created_at DESC);

ALTER TABLE public.offer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties_select_offer_events"
  ON public.offer_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.buyer_specific_product_offers o
      WHERE o.id = offer_events.offer_id
        AND (
          o.seller_id = auth.uid()
          OR o.buyer_id = auth.uid()
        )
    )
  );

CREATE POLICY "admins_select_all_offer_events"
  ON public.offer_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Back-reference column on transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source_offer_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_source_offer
  ON public.transactions(source_offer_id) WHERE source_offer_id IS NOT NULL;

-- 5. Index for seller's private-offer products
CREATE INDEX IF NOT EXISTS idx_products_visibility_buyer_specific
  ON public.products(seller_id)
  WHERE visibility_type = 'buyer_specific';

-- 6. Auto-link trigger on user signup — extend handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, default_role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE((NEW.raw_user_meta_data->>'default_role')::user_role_type, 'buyer')
  );

  INSERT INTO public.account_verifications (user_id) VALUES (NEW.id);
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id);

  -- Auto-link any pending private offers matching this email
  UPDATE public.buyer_specific_product_offers
  SET buyer_id = NEW.id,
      status = 'linked',
      linked_at = now()
  WHERE buyer_id IS NULL
    AND status = 'pending_claim'
    AND buyer_email IS NOT NULL
    AND lower(buyer_email) = lower(NEW.email);

  -- Audit each linked offer
  INSERT INTO public.offer_events (offer_id, event_type, actor_user_id, metadata)
  SELECT id, 'auto_linked_on_signup', NEW.id, jsonb_build_object('email', NEW.email)
  FROM public.buyer_specific_product_offers
  WHERE buyer_id = NEW.id
    AND status = 'linked'
    AND linked_at >= now() - interval '5 seconds';

  RETURN NEW;
END;
$function$;

-- 7. Stale-offer expirer (called from edge functions on read; later by scheduled job)
CREATE OR REPLACE FUNCTION public.expire_stale_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count integer := 0;
BEGIN
  WITH expired AS (
    UPDATE public.buyer_specific_product_offers
    SET status = 'expired',
        expired_at = now()
    WHERE expires_at IS NOT NULL
      AND expires_at < now()
      AND status IN ('pending_claim', 'linked', 'claimed')
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.source_offer_id = buyer_specific_product_offers.id
          AND t.status NOT IN ('cancelled', 'timed_out')
      )
    RETURNING id
  ),
  events AS (
    INSERT INTO public.offer_events (offer_id, event_type, metadata)
    SELECT id, 'expired_by_system', jsonb_build_object('reason', 'past_expires_at')
    FROM expired
    RETURNING 1
  ),
  archive_products AS (
    UPDATE public.products
    SET status = 'archived'
    FROM expired e
    JOIN public.buyer_specific_product_offers o ON o.id = e.id
    WHERE products.id = o.product_id
    RETURNING products.id
  )
  SELECT count(*) INTO _count FROM expired;

  RETURN _count;
END;
$$;