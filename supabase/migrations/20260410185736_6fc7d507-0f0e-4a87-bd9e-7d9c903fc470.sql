
-- =============================================
-- Batch 1: Seller Catalog + Storefront Foundation
-- =============================================

-- 1. New enums
CREATE TYPE public.product_visibility_type AS ENUM ('public', 'buyer_specific', 'private_draft');
CREATE TYPE public.product_status AS ENUM ('draft', 'published', 'out_of_stock', 'archived');

-- 2. product_categories table
CREATE TABLE public.product_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  icon_name text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_select_active_categories"
  ON public.product_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "anon_select_active_categories"
  ON public.product_categories FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "admins_insert_categories"
  ON public.product_categories FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role_type));

CREATE POLICY "admins_update_categories"
  ON public.product_categories FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role_type));

CREATE TRIGGER update_product_categories_updated_at
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. products table
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL,
  short_description text,
  description text NOT NULL,
  condition_label text,
  sku text,
  brand text,
  model text,
  currency_code text NOT NULL DEFAULT 'NGN',
  unit_price numeric(18,2) NOT NULL,
  stock_quantity integer NOT NULL DEFAULT 0,
  reserved_quantity integer NOT NULL DEFAULT 0,
  visibility_type public.product_visibility_type NOT NULL DEFAULT 'public',
  status public.product_status NOT NULL DEFAULT 'draft',
  is_active boolean NOT NULL DEFAULT true,
  seller_notes text,
  agreement_terms text,
  delivery_method text,
  verification_window_hours integer,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_seller_slug UNIQUE (seller_id, slug)
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Sellers manage own products
CREATE POLICY "sellers_select_own_products"
  ON public.products FOR SELECT
  TO authenticated
  USING (auth.uid() = seller_id);

CREATE POLICY "sellers_insert_own_products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "sellers_update_own_products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

-- Public can view published public products (authenticated)
CREATE POLICY "public_select_published_products"
  ON public.products FOR SELECT
  TO authenticated
  USING (status = 'published' AND visibility_type = 'public' AND is_active = true);

-- Anon can view published public products (for public storefront)
CREATE POLICY "anon_select_published_products"
  ON public.products FOR SELECT
  TO anon
  USING (status = 'published' AND visibility_type = 'public' AND is_active = true);

-- Admins see all
CREATE POLICY "admins_select_all_products"
  ON public.products FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type));

CREATE INDEX idx_products_seller_id ON public.products(seller_id);
CREATE INDEX idx_products_status_visibility ON public.products(status, visibility_type) WHERE is_active = true;
CREATE INDEX idx_products_category_id ON public.products(category_id);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. product_media table
CREATE TABLE public.product_media (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.files(id) ON DELETE RESTRICT,
  media_type text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;

-- Sellers manage own product media
CREATE POLICY "sellers_select_own_product_media"
  ON public.product_media FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = product_media.product_id AND p.seller_id = auth.uid()
  ));

CREATE POLICY "sellers_insert_own_product_media"
  ON public.product_media FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = product_media.product_id AND p.seller_id = auth.uid()
  ));

CREATE POLICY "sellers_update_own_product_media"
  ON public.product_media FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = product_media.product_id AND p.seller_id = auth.uid()
  ));

CREATE POLICY "sellers_delete_own_product_media"
  ON public.product_media FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = product_media.product_id AND p.seller_id = auth.uid()
  ));

-- Public can view media for published public products
CREATE POLICY "public_select_published_product_media"
  ON public.product_media FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_media.product_id
      AND p.status = 'published'
      AND p.visibility_type = 'public'
      AND p.is_active = true
  ));

CREATE POLICY "anon_select_published_product_media"
  ON public.product_media FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_media.product_id
      AND p.status = 'published'
      AND p.visibility_type = 'public'
      AND p.is_active = true
  ));

-- Admins see all media
CREATE POLICY "admins_select_all_product_media"
  ON public.product_media FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type));

CREATE INDEX idx_product_media_product_id ON public.product_media(product_id);

-- 5. Add store_slug to profiles
ALTER TABLE public.profiles ADD COLUMN store_slug text UNIQUE;

-- Allow anon to read public profile info for storefronts
CREATE POLICY "anon_select_public_profile_info"
  ON public.profiles FOR SELECT
  TO anon
  USING (store_slug IS NOT NULL);

-- 6. Seed product categories
INSERT INTO public.product_categories (name, slug, icon_name, sort_order) VALUES
  ('Electronics', 'electronics', 'Cpu', 1),
  ('Phones & Tablets', 'phones-tablets', 'Smartphone', 2),
  ('Computing', 'computing', 'Laptop', 3),
  ('Fashion', 'fashion', 'Shirt', 4),
  ('Home & Living', 'home-living', 'Home', 5),
  ('Auto & Parts', 'auto-parts', 'Car', 6),
  ('Services', 'services', 'Wrench', 7),
  ('Other', 'other', 'Package', 8);
