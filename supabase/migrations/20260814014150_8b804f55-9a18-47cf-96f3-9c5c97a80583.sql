-- 1. Plan catalogue -------------------------------------------------------
CREATE TABLE public.vendor_plans (
  code text PRIMARY KEY,
  name text NOT NULL,
  tagline text,
  monthly_price_naira numeric(12,2) NOT NULL DEFAULT 0 CHECK (monthly_price_naira >= 0),
  yearly_price_naira numeric(12,2) NOT NULL DEFAULT 0 CHECK (yearly_price_naira >= 0),
  photo_slots integer NOT NULL DEFAULT 5 CHECK (photo_slots >= 0),
  escrow_fee_rate numeric(6,4) NOT NULL DEFAULT 0.0200 CHECK (escrow_fee_rate >= 0 AND escrow_fee_rate <= 0.2),
  featured_placement boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vendor_plans TO anon;
GRANT SELECT ON public.vendor_plans TO authenticated;
GRANT ALL ON public.vendor_plans TO service_role;

ALTER TABLE public.vendor_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plan catalogue is public" ON public.vendor_plans
  FOR SELECT USING (true);

CREATE POLICY "Internal admins manage plan catalogue" ON public.vendor_plans
  FOR ALL TO authenticated
  USING (public.is_internal_admin(auth.uid()))
  WITH CHECK (public.is_internal_admin(auth.uid()));

CREATE TRIGGER update_vendor_plans_updated_at
  BEFORE UPDATE ON public.vendor_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.vendor_plans
  (code, name, tagline, monthly_price_naira, yearly_price_naira, photo_slots, escrow_fee_rate, featured_placement, sort_order)
VALUES
  ('verified', 'Verified Vendor', 'Free forever', 0, 0, 5, 0.0200, false, 1),
  ('starter',  'Starter',         'For growing stores', 2500, 25000, 30, 0.0200, false, 2),
  ('growth',   'Growth',          'For serious sellers', 7500, 75000, 200, 0.0150, true, 3);

-- 2. Seller plan state -----------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN vendor_plan_code text NOT NULL DEFAULT 'verified'
    REFERENCES public.vendor_plans(code) ON DELETE RESTRICT,
  ADD COLUMN vendor_plan_period text CHECK (vendor_plan_period IN ('monthly','yearly')),
  ADD COLUMN vendor_plan_expires_at timestamptz,
  ADD COLUMN extra_photo_slots integer NOT NULL DEFAULT 0 CHECK (extra_photo_slots >= 0),
  ADD COLUMN featured_until timestamptz;

CREATE INDEX idx_profiles_featured_until ON public.profiles (featured_until DESC NULLS LAST);
CREATE INDEX idx_profiles_vendor_plan_expiry ON public.profiles (vendor_plan_expires_at)
  WHERE vendor_plan_expires_at IS NOT NULL;

-- 3. Purchases -------------------------------------------------------------
CREATE TABLE public.vendor_plan_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  purchase_type text NOT NULL CHECK (purchase_type IN ('plan','photo_slots','store_boost')),
  plan_code text REFERENCES public.vendor_plans(code) ON DELETE RESTRICT,
  billing_period text NOT NULL DEFAULT 'one_time' CHECK (billing_period IN ('monthly','yearly','one_time')),
  amount_naira numeric(12,2) NOT NULL CHECK (amount_naira > 0),
  currency_code text NOT NULL DEFAULT 'NGN',
  provider text NOT NULL DEFAULT 'paystack',
  provider_reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','abandoned')),
  paid_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_plan_purchases_user ON public.vendor_plan_purchases (user_id, created_at DESC);
CREATE INDEX idx_vendor_plan_purchases_status ON public.vendor_plan_purchases (status);

GRANT SELECT ON public.vendor_plan_purchases TO authenticated;
GRANT ALL ON public.vendor_plan_purchases TO service_role;

ALTER TABLE public.vendor_plan_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers view their own purchases" ON public.vendor_plan_purchases
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Internal admins view all purchases" ON public.vendor_plan_purchases
  FOR SELECT TO authenticated
  USING (public.is_internal_admin(auth.uid()));

CREATE TRIGGER update_vendor_plan_purchases_updated_at
  BEFORE UPDATE ON public.vendor_plan_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Helpers ---------------------------------------------------------------

-- Effective plan code: falls back to 'verified' once the paid plan expires.
CREATE OR REPLACE FUNCTION public.effective_vendor_plan_code(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.vendor_plan_code IS NULL THEN 'verified'
    WHEN p.vendor_plan_code = 'verified' THEN 'verified'
    WHEN p.vendor_plan_expires_at IS NULL THEN 'verified'
    WHEN p.vendor_plan_expires_at < now() THEN 'verified'
    ELSE p.vendor_plan_code
  END
  FROM public.profiles p
  WHERE p.id = _user_id;
$$;

-- Showcase slot limit = effective plan slots + permanently purchased extras.
CREATE OR REPLACE FUNCTION public.vendor_photo_slot_limit(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(vp.photo_slots, 5) + COALESCE(p.extra_photo_slots, 0)
  FROM public.profiles p
  LEFT JOIN public.vendor_plans vp
    ON vp.code = public.effective_vendor_plan_code(p.id)
  WHERE p.id = _user_id;
$$;

-- Showcase slots in use = product images across the vendor's live products.
CREATE OR REPLACE FUNCTION public.vendor_photo_slot_usage(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count(*), 0)::integer
  FROM public.product_media pm
  JOIN public.products pr ON pr.id = pm.product_id
  WHERE pr.seller_id = _user_id
    AND pm.media_type = 'image'
    AND COALESCE(pr.is_active, true) = true;
$$;

-- Idempotently activate a paid purchase.
CREATE OR REPLACE FUNCTION public.activate_vendor_purchase(_provider_reference text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.vendor_plan_purchases%ROWTYPE;
  v_expires timestamptz;
BEGIN
  SELECT * INTO v_row
  FROM public.vendor_plan_purchases
  WHERE provider_reference = _provider_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_row.status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'already_applied', true, 'purchase_id', v_row.id);
  END IF;

  IF v_row.purchase_type = 'plan' THEN
    v_expires := GREATEST(
      COALESCE((SELECT vendor_plan_expires_at FROM public.profiles WHERE id = v_row.user_id), now()),
      now()
    ) + CASE WHEN v_row.billing_period = 'yearly' THEN interval '365 days' ELSE interval '30 days' END;

    UPDATE public.profiles
    SET vendor_plan_code = v_row.plan_code,
        vendor_plan_period = v_row.billing_period,
        vendor_plan_expires_at = v_expires,
        updated_at = now()
    WHERE id = v_row.user_id;

  ELSIF v_row.purchase_type = 'photo_slots' THEN
    UPDATE public.profiles
    SET extra_photo_slots = COALESCE(extra_photo_slots, 0)
      + COALESCE((v_row.metadata->>'slots')::integer, 10),
        updated_at = now()
    WHERE id = v_row.user_id;

  ELSIF v_row.purchase_type = 'store_boost' THEN
    v_expires := GREATEST(
      COALESCE((SELECT featured_until FROM public.profiles WHERE id = v_row.user_id), now()),
      now()
    ) + make_interval(days => COALESCE((v_row.metadata->>'days')::integer, 7));

    UPDATE public.profiles
    SET featured_until = v_expires,
        updated_at = now()
    WHERE id = v_row.user_id;
  END IF;

  UPDATE public.vendor_plan_purchases
  SET status = 'paid',
      paid_at = COALESCE(paid_at, now()),
      activated_at = now(),
      expires_at = v_expires,
      updated_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'already_applied', false,
    'purchase_id', v_row.id, 'purchase_type', v_row.purchase_type, 'expires_at', v_expires);
END;
$$;

-- Auto-downgrade expired plans (called by cron / the timeout job).
CREATE OR REPLACE FUNCTION public.expire_vendor_plans()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH downgraded AS (
    UPDATE public.profiles
    SET vendor_plan_code = 'verified',
        vendor_plan_period = NULL,
        vendor_plan_expires_at = NULL,
        updated_at = now()
    WHERE vendor_plan_code <> 'verified'
      AND vendor_plan_expires_at IS NOT NULL
      AND vendor_plan_expires_at < now()
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM downgraded;
  RETURN COALESCE(v_count, 0);
END;
$$;