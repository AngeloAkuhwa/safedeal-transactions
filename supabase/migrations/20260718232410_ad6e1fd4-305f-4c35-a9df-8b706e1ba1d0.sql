
DO $$ BEGIN
  CREATE TYPE public.vendor_status_type AS ENUM ('active', 'disabled', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vendor_status public.vendor_status_type NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS vendor_status_reason TEXT,
  ADD COLUMN IF NOT EXISTS vendor_status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vendor_status_changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_vendor_status ON public.profiles(vendor_status);

DO $$ BEGIN
  ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'set_vendor_status';
EXCEPTION WHEN others THEN NULL; END $$;

INSERT INTO public.system_settings (setting_key, setting_value, scope, is_overridable)
SELECT * FROM (VALUES
  ('commerce.checkout_enabled',    to_jsonb(false),  'platform', true),
  ('commerce.add_to_cart_enabled', to_jsonb(true),   'platform', true),
  ('commerce.disabled_reason',     to_jsonb('Checkout is not yet available. We''re preparing the platform — you can browse and set up your account in the meantime.'::text), 'platform', true)
) AS v(setting_key, setting_value, scope, is_overridable)
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings s
  WHERE s.setting_key = v.setting_key AND s.scope = v.scope AND s.vendor_id IS NULL
);
