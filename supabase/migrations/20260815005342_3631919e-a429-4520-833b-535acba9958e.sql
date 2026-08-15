-- 1. public_seller_profiles: read-only, non-auto-updatable, invoker-secured.
CREATE OR REPLACE FUNCTION public.storefront_seller_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  store_slug text,
  city_name text,
  state_name text,
  country_code text,
  default_role public.user_role_type,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url, p.store_slug, p.city_name,
         p.state_name, p.country_code, p.default_role, p.created_at
  FROM public.profiles p
  WHERE p.store_slug IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.storefront_seller_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_seller_profiles() TO anon, authenticated, service_role;

DROP VIEW IF EXISTS public.public_seller_profiles;
CREATE VIEW public.public_seller_profiles
WITH (security_invoker = on) AS
  SELECT id, full_name, avatar_url, store_slug, city_name, state_name,
         country_code, default_role, created_at
  FROM public.storefront_seller_profiles();

REVOKE ALL ON public.public_seller_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_seller_profiles TO anon, authenticated, service_role;

-- 2. No client role may hold DML on ANY view or materialized view.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON %s FROM PUBLIC, anon, authenticated',
      r.rel);
  END LOOP;
END $$;

-- 3. TRUNCATE is not subject to RLS. No client role keeps it, anywhere.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  LOOP
    EXECUTE format('REVOKE TRUNCATE ON %s FROM PUBLIC, anon, authenticated', r.rel);
  END LOOP;
END $$;

-- 4. One unified security-table list: anon holds no DML, authenticated keeps
--    only privileges backed by a policy, and RLS is FORCEd.
DO $$
DECLARE
  t text;
  security_tables text[] := array[
    'payments','payouts','refunds','escrow_states','escrow_ledger_entries',
    'dispute_outcomes','money_status_history','vendor_plan_purchases',
    'transaction_pricing','financial_remediations','escrow_reconciliation_results',
    'payout_accounts','checkout_sessions','release_review_queue','transactions',
    'transaction_items','transaction_delivery_terms','checkout_session_items',
    'financial_idempotency_conflicts','admin_rate_limits','system_settings',
    'system_settings_history','internal_users','internal_user_roles','user_roles',
    'permissions','role_permissions','user_permission_overrides','audit_logs',
    'admin_actions','vendor_plans','profiles'
  ];
BEGIN
  FOREACH t IN ARRAY security_tables LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;

  -- authenticated: revoke everything, then re-grant only policy-backed writes.
  FOREACH t IN ARRAY array[
    'financial_idempotency_conflicts','admin_rate_limits','system_settings_history',
    'audit_logs','user_roles','admin_actions','profiles','system_settings',
    'internal_users','internal_user_roles','permissions','role_permissions',
    'user_permission_overrides','vendor_plans'
  ] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t);
  END LOOP;
END $$;

-- policy-backed authenticated writes, re-granted explicitly
GRANT INSERT ON public.admin_actions TO authenticated;              -- admins_insert_admin_actions
GRANT INSERT ON public.user_roles TO authenticated;                 -- users_insert_own_non_admin_role
GRANT UPDATE ON public.profiles TO authenticated;                   -- users_update_own_profile
GRANT INSERT, UPDATE ON public.system_settings TO authenticated;    -- admins_{insert,update}_system_settings
GRANT INSERT, UPDATE, DELETE ON public.internal_users TO authenticated;             -- staff manage internal_users
GRANT INSERT, UPDATE, DELETE ON public.internal_user_roles TO authenticated;        -- staff manage user_roles
GRANT INSERT, UPDATE, DELETE ON public.permissions TO authenticated;                -- super admin manage permissions
GRANT INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;           -- super_admin manage role_permissions
GRANT INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;  -- super_admin manage overrides
GRANT INSERT, UPDATE, DELETE ON public.vendor_plans TO authenticated;               -- Internal admins manage plan catalogue

-- 5. Reconciliation balances must be written explicitly, never coerced to 0.
ALTER TABLE public.escrow_reconciliation_results
  ALTER COLUMN ledger_balance DROP DEFAULT,
  ALTER COLUMN expected_ledger_balance DROP DEFAULT,
  ALTER COLUMN paystack_collected DROP DEFAULT,
  ALTER COLUMN paystack_paid_out DROP DEFAULT,
  ALTER COLUMN paystack_refunded DROP DEFAULT,
  ALTER COLUMN delta DROP DEFAULT;