-- 1. Restricted public projection for storefronts (definer-rights view: bypasses base-table RLS by design)
CREATE OR REPLACE VIEW public.public_seller_profiles
WITH (security_invoker = off) AS
SELECT
  p.id,
  p.full_name,
  p.avatar_url,
  p.store_slug,
  p.city_name,
  p.state_name,
  p.country_code,
  p.default_role,
  p.created_at
FROM public.profiles p
WHERE p.store_slug IS NOT NULL;

COMMENT ON VIEW public.public_seller_profiles IS
  'Safe public storefront projection of profiles. Never add email, phone, status, last_login_at, region eligibility or verification columns here.';

REVOKE ALL ON public.public_seller_profiles FROM PUBLIC;
GRANT SELECT ON public.public_seller_profiles TO anon, authenticated;
GRANT ALL ON public.public_seller_profiles TO service_role;

-- 2. Remove the residual anonymous read rule on the sensitive base table.
DROP POLICY IF EXISTS anon_select_public_profile_info ON public.profiles;

-- 3. Belt and braces: ensure anon holds no direct privileges on profiles.
REVOKE ALL ON public.profiles FROM anon;