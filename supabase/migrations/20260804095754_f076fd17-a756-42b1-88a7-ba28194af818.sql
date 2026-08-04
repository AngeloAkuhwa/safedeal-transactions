CREATE OR REPLACE FUNCTION public.track_pricing_setting_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF NEW.setting_key NOT IN (
    'pricing.tier_rates',
    'pricing.min_platform_fee_ngn',
    'pricing.max_total_service_fee_ngn'
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.setting_value IS NOT DISTINCT FROM OLD.setting_value THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
  FROM public.system_settings_history
  WHERE setting_key = NEW.setting_key
    AND scope = NEW.scope
    AND COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(NEW.vendor_id, '00000000-0000-0000-0000-000000000000'::uuid);

  INSERT INTO public.system_settings_history (
    setting_id, setting_key, scope, vendor_id, version,
    old_value, new_value, changed_by, changed_at, effective_from
  ) VALUES (
    NEW.id, NEW.setting_key, NEW.scope, NEW.vendor_id, v_next,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.setting_value ELSE NULL END,
    NEW.setting_value, NEW.updated_by, clock_timestamp(), clock_timestamp()
  );

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pricing_settings_at(uuid, timestamptz) TO postgres;