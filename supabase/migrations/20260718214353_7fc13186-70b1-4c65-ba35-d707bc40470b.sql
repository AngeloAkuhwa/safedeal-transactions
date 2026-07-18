
-- ============================================================
-- Multi-tenant scoped system settings
-- Adds scope + vendor_id to system_settings and timeout_rules,
-- resolver functions, and RLS updates.
-- ============================================================

-- 1) system_settings scoping
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_overridable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_settings_scope_check'
  ) THEN
    ALTER TABLE public.system_settings
      ADD CONSTRAINT system_settings_scope_check
      CHECK (scope IN ('platform','vendor'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_settings_scope_vendor_check'
  ) THEN
    ALTER TABLE public.system_settings
      ADD CONSTRAINT system_settings_scope_vendor_check
      CHECK (
        (scope = 'platform' AND vendor_id IS NULL) OR
        (scope = 'vendor'   AND vendor_id IS NOT NULL)
      );
  END IF;
END $$;

-- Replace old UNIQUE(setting_key) with scoped uniqueness
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'system_settings_setting_key_key') THEN
    ALTER TABLE public.system_settings DROP CONSTRAINT IF EXISTS system_settings_setting_key_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS system_settings_scope_key_vendor
  ON public.system_settings (
    setting_key,
    scope,
    COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_system_settings_vendor ON public.system_settings (vendor_id) WHERE vendor_id IS NOT NULL;

-- 2) timeout_rules scoping
ALTER TABLE public.timeout_rules
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timeout_rules_scope_check') THEN
    ALTER TABLE public.timeout_rules
      ADD CONSTRAINT timeout_rules_scope_check
      CHECK (scope IN ('platform','vendor'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timeout_rules_scope_vendor_check') THEN
    ALTER TABLE public.timeout_rules
      ADD CONSTRAINT timeout_rules_scope_vendor_check
      CHECK (
        (scope='platform' AND vendor_id IS NULL) OR
        (scope='vendor'   AND vendor_id IS NOT NULL)
      );
  END IF;
END $$;

-- Drop old UNIQUE(rule_type) and re-create scoped
ALTER TABLE public.timeout_rules DROP CONSTRAINT IF EXISTS timeout_rules_rule_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS timeout_rules_scope_type_vendor
  ON public.timeout_rules (
    rule_type,
    scope,
    COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- 3) Resolver functions
CREATE OR REPLACE FUNCTION public.get_effective_setting(_vendor_id UUID, _key TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT setting_value
    FROM public.system_settings
   WHERE setting_key = _key
     AND (
       (scope = 'vendor' AND vendor_id = _vendor_id)
       OR scope = 'platform'
     )
   ORDER BY (scope = 'vendor') DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_effective_timeout(_vendor_id UUID, _rule public.timeout_rule_type)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hours_until_trigger
    FROM public.timeout_rules
   WHERE rule_type = _rule
     AND is_active = true
     AND (
       (scope = 'vendor' AND vendor_id = _vendor_id)
       OR scope = 'platform'
     )
   ORDER BY (scope = 'vendor') DESC
   LIMIT 1;
$$;

-- Batch resolver for edge functions
CREATE OR REPLACE FUNCTION public.get_effective_settings(_vendor_id UUID, _keys TEXT[])
RETURNS TABLE(setting_key TEXT, setting_value JSONB, resolved_scope TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (s.setting_key)
    s.setting_key,
    s.setting_value,
    s.scope AS resolved_scope
  FROM public.system_settings s
  WHERE s.setting_key = ANY(_keys)
    AND (
      (s.scope = 'vendor' AND s.vendor_id = _vendor_id)
      OR s.scope = 'platform'
    )
  ORDER BY s.setting_key, (s.scope = 'vendor') DESC;
$$;

REVOKE ALL ON FUNCTION public.get_effective_setting(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_effective_timeout(UUID, public.timeout_rule_type) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_effective_settings(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_effective_setting(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_timeout(UUID, public.timeout_rule_type) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_settings(UUID, TEXT[]) TO authenticated, service_role;

-- 4) RLS: allow vendors to read their own vendor-scoped rows; admin writes anything
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_settings' AND policyname='vendors read own scoped settings'
  ) THEN
    CREATE POLICY "vendors read own scoped settings"
      ON public.system_settings FOR SELECT
      TO authenticated
      USING (scope = 'vendor' AND vendor_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='timeout_rules' AND policyname='vendors read own scoped timeouts'
  ) THEN
    CREATE POLICY "vendors read own scoped timeouts"
      ON public.timeout_rules FOR SELECT
      TO authenticated
      USING (scope = 'vendor' AND vendor_id = auth.uid());
  END IF;
END $$;

-- 5) Seed platform defaults for pricing/fee catalog (idempotent)
INSERT INTO public.system_settings (setting_key, setting_value, scope, is_overridable)
VALUES
  ('pricing.min_platform_fee_ngn',    to_jsonb(250),      'platform', false),
  ('pricing.max_total_service_fee_ngn', to_jsonb(2500),   'platform', false),
  ('pricing.tier_rates',
     '[{"upto":100000,"rate":0.039},{"upto":500000,"rate":0.035},{"upto":2000000,"rate":0.029},{"upto":null,"rate":0.025}]'::jsonb,
     'platform', true),
  ('security.kyc_required_over_ngn',  to_jsonb(5000),     'platform', true),
  ('security.two_factor_required',    to_jsonb(true),     'platform', true),
  ('security.session_timeout_minutes',to_jsonb(30),       'platform', true),
  ('platform.auto_release_enabled',   to_jsonb(true),     'platform', true),
  ('platform.email_notifications',    to_jsonb(true),     'platform', true),
  ('platform.sms_notifications',      to_jsonb(false),    'platform', true),
  ('risk.high_value_alert_ngn',       to_jsonb(1000000),  'platform', true),
  ('risk.fraud_score_threshold',      to_jsonb(75),       'platform', true),
  ('fees.refund_policy',              to_jsonb('non_refundable'::text), 'platform', false)
ON CONFLICT DO NOTHING;

-- Seed timeout rules platform defaults (using existing enum values)
INSERT INTO public.timeout_rules (rule_type, hours_until_trigger, is_active, scope)
VALUES
  ('seller_fulfillment_timeout', 168, true, 'platform'),
  ('buyer_verification_timeout', 72,  true, 'platform')
ON CONFLICT DO NOTHING;
