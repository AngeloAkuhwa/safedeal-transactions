-- safedeal:seed-fixture
-- =====================================================================
-- E2E AUDIT SEED — three disposable accounts. All rows tagged with the
-- 'claude.e2e.' email prefix and/or e2e_seed=true in JSON metadata.
--
-- The marker above exempts this file from the invented-defaults SQL rules
-- in src/__tests__/invented-defaults.contract.test.ts. It inserts rows it
-- owns and states their values outright; the literal 'NGN' and the enum
-- literals below are this fixture describing its own disposable product,
-- not a default imposed on anyone else's data. The exemption holds only
-- while this file declares no schema — add a CREATE, an ALTER or a DEFAULT
-- here and the rules apply again.
-- =====================================================================

-- 1. AUTH USERS (email-confirmed per-user; global confirm setting untouched)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000000', '0e2e0001-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'claude.e2e.buyer@safedeal.test',
   crypt('GUj3nGkqD7EFyVa2GEa376xS', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Claude E2E Buyer","default_role":"buyer","e2e_seed":true}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '0e2e0001-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'claude.e2e.seller@safedeal.test',
   crypt('hw2PHrEUvibPBFI58KpU2S', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Claude E2E Seller","default_role":"seller","e2e_seed":true}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '0e2e0001-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'claude.e2e.admin@safedeal.test',
   crypt('Ab3LrATRUifanaipa3hRrX', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Claude E2E Admin","default_role":"buyer","e2e_seed":true}'::jsonb, now(), now());

INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
SELECT gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'e2e_seed', true),
       now(), now()
FROM auth.users u
WHERE u.email LIKE 'claude.e2e.%@safedeal.test';

-- 2. ROLES / PROFILE SHAPE (profiles rows created by handle_new_user trigger)
UPDATE public.profiles
   SET default_role = 'seller',
       store_slug = 'claude-e2e-store',
       state_name = 'Lagos', city_name = 'Lagos', is_region_eligible = true
 WHERE email = 'claude.e2e.seller@safedeal.test';

UPDATE public.profiles
   SET state_name = 'Lagos', city_name = 'Lagos', is_region_eligible = true
 WHERE email IN ('claude.e2e.buyer@safedeal.test', 'claude.e2e.admin@safedeal.test');

INSERT INTO public.user_roles (user_id, role, is_primary) VALUES
  ('0e2e0001-0000-4000-8000-000000000001', 'buyer',  true),
  ('0e2e0001-0000-4000-8000-000000000002', 'seller', true);

-- 3. INTERNAL (BACK-OFFICE) ACCESS for the admin account.
--    Same shape the invite edge function writes: internal_users row in the
--    'invited' pre-activation state + one primary internal role. First
--    sign-in promotes it to 'active' through admin-me, exercising the real
--    activation mechanism.
INSERT INTO public.internal_users (
  id, display_id, full_name, first_name, last_name, email, department, team,
  job_title, status, invitation_status, reason_for_access
) VALUES (
  '0e2e0001-0000-4000-8000-000000000003', 'SD-E2E-ADMIN',
  'Claude E2E Admin', 'Claude', 'E2E Admin', 'claude.e2e.admin@safedeal.test',
  'Engineering', 'QA', 'Disposable audit account', 'invited', 'sent',
  'e2e_seed: disposable mobile/layout audit account'
);

INSERT INTO public.internal_user_roles (user_id, role_key, is_primary)
VALUES ('0e2e0001-0000-4000-8000-000000000003', 'super_admin', true);

-- 4. SELLER STOREFRONT — one published product at ₦1,250,000 with 3 photos.
INSERT INTO public.files (
  id, provider, provider_asset_id, resource_type, file_url, secure_url,
  original_file_name, mime_type, uploaded_by_user_id, context_type,
  is_temporary, retention_category, metadata_json
) VALUES
  ('0e2e0002-0000-4000-8000-000000000001', 'manual', 'claude-e2e-photo-1', 'image',
   'https://picsum.photos/seed/claude-e2e-1/1200/1200', 'https://picsum.photos/seed/claude-e2e-1/1200/1200',
   'e2e-1.jpg', 'image/jpeg', '0e2e0001-0000-4000-8000-000000000002', 'product_evidence',
   false, 'product_evidence', '{"e2e_seed":true}'::jsonb),
  ('0e2e0002-0000-4000-8000-000000000002', 'manual', 'claude-e2e-photo-2', 'image',
   'https://picsum.photos/seed/claude-e2e-2/1200/1200', 'https://picsum.photos/seed/claude-e2e-2/1200/1200',
   'e2e-2.jpg', 'image/jpeg', '0e2e0001-0000-4000-8000-000000000002', 'product_evidence',
   false, 'product_evidence', '{"e2e_seed":true}'::jsonb),
  ('0e2e0002-0000-4000-8000-000000000003', 'manual', 'claude-e2e-photo-3', 'image',
   'https://picsum.photos/seed/claude-e2e-3/1200/1200', 'https://picsum.photos/seed/claude-e2e-3/1200/1200',
   'e2e-3.jpg', 'image/jpeg', '0e2e0001-0000-4000-8000-000000000002', 'product_evidence',
   false, 'product_evidence', '{"e2e_seed":true}'::jsonb);

INSERT INTO public.products (
  id, seller_id, category_id, title, slug, short_description, description,
  condition_label, brand, model, currency_code, unit_price, stock_quantity,
  visibility_type, status, is_active, delivery_method, delivery_scope,
  estimated_delivery_days, verification_window_hours, feature_highlights, published_at
) VALUES (
  '0e2e0003-0000-4000-8000-000000000001',
  '0e2e0001-0000-4000-8000-000000000002',
  (SELECT id FROM public.product_categories WHERE slug = 'phones-tablets'),
  'E2E Test Listing — 16in Pro Laptop (seed data)',
  'claude-e2e-test-listing-16in-pro-laptop',
  'Disposable seed listing used for layout auditing. Not for sale.',
  'This listing was created by an automated layout audit seed (e2e_seed). It exists only so signed-in storefront, cart and dashboard screens are not empty. It is not a real item and is not for sale.',
  'brand_new', 'SafeDeal QA', 'E2E-1250', 'NGN', 1250000.00, 3,
  'public', 'published', true,
  '["pickup","delivery","courier_shipping"]', NULL, '2', 72,
  '["Seed data — do not purchase","Priced to exercise seven-figure layout"]'::jsonb,
  now()
);

INSERT INTO public.product_media (product_id, file_id, media_type, sort_order, is_primary) VALUES
  ('0e2e0003-0000-4000-8000-000000000001', '0e2e0002-0000-4000-8000-000000000001', 'image', 0, true),
  ('0e2e0003-0000-4000-8000-000000000001', '0e2e0002-0000-4000-8000-000000000002', 'image', 1, false),
  ('0e2e0003-0000-4000-8000-000000000001', '0e2e0002-0000-4000-8000-000000000003', 'image', 2, false);

-- 5. BUYER CART — one item.
INSERT INTO public.cart_items (buyer_id, product_id, quantity)
VALUES ('0e2e0001-0000-4000-8000-000000000001', '0e2e0003-0000-4000-8000-000000000001', 1);
