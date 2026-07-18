-- Auto-release audit columns on system_settings (populated only for
-- setting_key = 'escrow.auto_release_enabled')
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS auto_release_enabled_by uuid,
  ADD COLUMN IF NOT EXISTS auto_release_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_release_previous_value text;

CREATE OR REPLACE FUNCTION public.track_auto_release_toggle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.setting_key <> 'escrow.auto_release_enabled' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.auto_release_enabled_by := NEW.updated_by;
    NEW.auto_release_enabled_at := now();
    NEW.auto_release_previous_value := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: only stamp when the value actually changed
  IF NEW.setting_value IS DISTINCT FROM OLD.setting_value THEN
    NEW.auto_release_enabled_by := NEW.updated_by;
    NEW.auto_release_enabled_at := now();
    NEW.auto_release_previous_value := (OLD.setting_value)::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_auto_release_toggle ON public.system_settings;
CREATE TRIGGER trg_track_auto_release_toggle
  BEFORE INSERT OR UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.track_auto_release_toggle();