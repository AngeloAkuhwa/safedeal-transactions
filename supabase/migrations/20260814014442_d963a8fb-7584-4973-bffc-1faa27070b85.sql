-- New G3 fee shape: 2% + ₦100, platform fee capped at ₦5,000.
INSERT INTO public.system_settings (setting_key, setting_value, scope)
VALUES
  ('pricing.platform_fee_rate', '0.02'::jsonb, 'platform'),
  ('pricing.platform_fee_flat_ngn', '100'::jsonb, 'platform'),
  ('pricing.max_platform_fee_ngn', '5000'::jsonb, 'platform')
ON CONFLICT DO NOTHING;

UPDATE public.system_settings
SET setting_value = '0'::jsonb
WHERE setting_key = 'pricing.min_platform_fee_ngn' AND scope = 'platform';

UPDATE public.system_settings
SET setting_value = '7000'::jsonb
WHERE setting_key = 'pricing.max_total_service_fee_ngn' AND scope = 'platform';

-- The flat model ignores tier rates; keep the row but empty so no legacy
-- tiered branch is triggered by a resolved platform config.
UPDATE public.system_settings
SET setting_value = '[]'::jsonb
WHERE setting_key = 'pricing.tier_rates' AND scope = 'platform';

-- Lock down the new helper functions to signed-in / backend callers.
REVOKE EXECUTE ON FUNCTION public.effective_vendor_plan_code(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.vendor_photo_slot_limit(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.vendor_photo_slot_usage(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.activate_vendor_purchase(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.activate_vendor_purchase(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_vendor_plans() FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_vendor_plans() FROM authenticated;