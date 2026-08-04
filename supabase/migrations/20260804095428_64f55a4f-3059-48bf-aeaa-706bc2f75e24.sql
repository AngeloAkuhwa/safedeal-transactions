-- ── Item 1: effective-dated versioning for PRICING settings ──────────────
CREATE TABLE IF NOT EXISTS public.system_settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_id uuid,
  setting_key text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('platform','vendor')),
  vendor_id uuid,
  version integer NOT NULL,
  old_value jsonb,
  new_value jsonb NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  effective_from timestamptz NOT NULL DEFAULT now(),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.system_settings_history TO authenticated;
GRANT ALL ON public.system_settings_history TO service_role;

ALTER TABLE public.system_settings_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_read_settings_history"
ON public.system_settings_history
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::user_role_type));

CREATE UNIQUE INDEX IF NOT EXISTS system_settings_history_key_scope_version
  ON public.system_settings_history (
    setting_key, scope, COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid), version
  );

CREATE INDEX IF NOT EXISTS system_settings_history_key_effective
  ON public.system_settings_history (setting_key, effective_from DESC);

-- Append-only: block deletes and any update other than filling a null reason.
CREATE OR REPLACE FUNCTION public.system_settings_history_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'system_settings_history is append-only';
  END IF;
  IF OLD.reason IS NOT NULL OR NEW.reason IS NULL THEN
    RAISE EXCEPTION 'system_settings_history is append-only';
  END IF;
  IF (to_jsonb(NEW) - 'reason') IS DISTINCT FROM (to_jsonb(OLD) - 'reason') THEN
    RAISE EXCEPTION 'system_settings_history is append-only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_system_settings_history_append_only
BEFORE UPDATE OR DELETE ON public.system_settings_history
FOR EACH ROW EXECUTE FUNCTION public.system_settings_history_append_only();

-- Versioning trigger: pricing keys only.
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
    NEW.setting_value, NEW.updated_by, now(), now()
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_track_pricing_setting_version
AFTER INSERT OR UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.track_pricing_setting_version();

-- Backfill current pricing rows as version 1 with their existing updated_at.
INSERT INTO public.system_settings_history (
  setting_id, setting_key, scope, vendor_id, version,
  old_value, new_value, changed_by, changed_at, effective_from, reason
)
SELECT s.id, s.setting_key, s.scope, s.vendor_id, 1,
       NULL, s.setting_value, s.updated_by, s.updated_at, s.updated_at,
       'Backfill: initial seeded value recorded as version 1'
FROM public.system_settings s
WHERE s.setting_key IN (
  'pricing.tier_rates','pricing.min_platform_fee_ngn','pricing.max_total_service_fee_ngn'
)
AND NOT EXISTS (
  SELECT 1 FROM public.system_settings_history h
  WHERE h.setting_key = s.setting_key AND h.scope = s.scope
    AND COALESCE(h.vendor_id,'00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(s.vendor_id,'00000000-0000-0000-0000-000000000000'::uuid)
);

-- Fill a missing reason on the newest version of a pricing key (used by the
-- admin settings endpoint right after a write).
CREATE OR REPLACE FUNCTION public.annotate_setting_version_reason(
  _setting_key text,
  _scope text,
  _vendor_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.system_settings_history
  WHERE setting_key = _setting_key
    AND scope = _scope
    AND COALESCE(vendor_id,'00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(_vendor_id,'00000000-0000-0000-0000-000000000000'::uuid)
    AND reason IS NULL
  ORDER BY version DESC
  LIMIT 1;

  IF v_id IS NOT NULL AND _reason IS NOT NULL AND length(btrim(_reason)) > 0 THEN
    UPDATE public.system_settings_history SET reason = _reason WHERE id = v_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.annotate_setting_version_reason(text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.annotate_setting_version_reason(text, text, uuid, text) TO service_role;

-- Point-in-time read: effective pricing settings at timestamp T for vendor V.
CREATE OR REPLACE FUNCTION public.get_pricing_settings_at(
  _vendor_id uuid,
  _at timestamptz
)
RETURNS TABLE (
  setting_key text,
  setting_value jsonb,
  scope text,
  version integer,
  effective_from timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::user_role_type) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  WITH latest_per_scope AS (
    SELECT DISTINCT ON (h.setting_key, h.scope, COALESCE(h.vendor_id,'00000000-0000-0000-0000-000000000000'::uuid))
      h.setting_key, h.new_value, h.scope, h.version, h.effective_from
    FROM public.system_settings_history h
    WHERE h.effective_from <= _at
      AND h.setting_key IN (
        'pricing.tier_rates','pricing.min_platform_fee_ngn','pricing.max_total_service_fee_ngn'
      )
      AND (h.scope = 'platform' OR (h.scope = 'vendor' AND h.vendor_id = _vendor_id))
    ORDER BY h.setting_key, h.scope,
             COALESCE(h.vendor_id,'00000000-0000-0000-0000-000000000000'::uuid),
             h.effective_from DESC, h.version DESC
  )
  SELECT DISTINCT ON (l.setting_key)
    l.setting_key, l.new_value, l.scope, l.version, l.effective_from
  FROM latest_per_scope l
  ORDER BY l.setting_key, (l.scope = 'vendor') DESC, l.effective_from DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_pricing_settings_at(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pricing_settings_at(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pricing_settings_at(uuid, timestamptz) TO service_role;