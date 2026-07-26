
-- =========================================================================
-- Permission Matrix v5 — environment scoping + Senior Admin SoD cleanup
-- =========================================================================
-- Adds an `environment` column ('production' | 'staging' | 'development') to
-- every permission-config table so admins can experiment in Staging/Dev
-- without affecting Production truth. All existing rows default to
-- 'production' via the column default. Also strips the escrow.approve
-- permission from senior_admin (approved SoD resolution) so escrow approval
-- stays with escrow_manager / super_admin only.

-- ---------- 1. role_permissions ---------------------------------------------
ALTER TABLE public.role_permissions
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';

ALTER TABLE public.role_permissions
  DROP CONSTRAINT IF EXISTS role_permissions_environment_check;
ALTER TABLE public.role_permissions
  ADD CONSTRAINT role_permissions_environment_check
  CHECK (environment IN ('production','staging','development'));

ALTER TABLE public.role_permissions
  DROP CONSTRAINT IF EXISTS role_permissions_pkey;
ALTER TABLE public.role_permissions
  ADD CONSTRAINT role_permissions_pkey
  PRIMARY KEY (role_key, permission_key, environment);

-- ---------- 2. user_permission_overrides ------------------------------------
ALTER TABLE public.user_permission_overrides
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';

ALTER TABLE public.user_permission_overrides
  DROP CONSTRAINT IF EXISTS user_permission_overrides_environment_check;
ALTER TABLE public.user_permission_overrides
  ADD CONSTRAINT user_permission_overrides_environment_check
  CHECK (environment IN ('production','staging','development'));

ALTER TABLE public.user_permission_overrides
  DROP CONSTRAINT IF EXISTS user_permission_overrides_pkey;
ALTER TABLE public.user_permission_overrides
  ADD CONSTRAINT user_permission_overrides_pkey
  PRIMARY KEY (user_id, permission_key, environment);

-- ---------- 3. permission_templates -----------------------------------------
ALTER TABLE public.permission_templates
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';

ALTER TABLE public.permission_templates
  DROP CONSTRAINT IF EXISTS permission_templates_environment_check;
ALTER TABLE public.permission_templates
  ADD CONSTRAINT permission_templates_environment_check
  CHECK (environment IN ('production','staging','development'));

-- ---------- 4. permission_change_sets ---------------------------------------
ALTER TABLE public.permission_change_sets
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';

ALTER TABLE public.permission_change_sets
  DROP CONSTRAINT IF EXISTS permission_change_sets_environment_check;
ALTER TABLE public.permission_change_sets
  ADD CONSTRAINT permission_change_sets_environment_check
  CHECK (environment IN ('production','staging','development'));

CREATE INDEX IF NOT EXISTS idx_permission_change_sets_env
  ON public.permission_change_sets (environment, status, created_at DESC);

-- ---------- 5. permission_conflict_acknowledgements -------------------------
ALTER TABLE public.permission_conflict_acknowledgements
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';

ALTER TABLE public.permission_conflict_acknowledgements
  DROP CONSTRAINT IF EXISTS permission_conflict_acknowledgements_env_check;
ALTER TABLE public.permission_conflict_acknowledgements
  ADD CONSTRAINT permission_conflict_acknowledgements_env_check
  CHECK (environment IN ('production','staging','development'));

-- =========================================================================
-- 6. RPCs — env-aware apply / reject
-- =========================================================================

CREATE OR REPLACE FUNCTION public.apply_permission_change_set(
  _id uuid,
  _reason text DEFAULT NULL::text,
  _environment text DEFAULT 'production'
)
RETURNS permission_change_sets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cs public.permission_change_sets;
  add_keys text[];
  rem_keys text[];
  after_json jsonb;
  before_json jsonb;
  ov jsonb;
BEGIN
  IF NOT public.has_internal_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;

  IF _environment NOT IN ('production','staging','development') THEN
    RAISE EXCEPTION 'invalid environment: %', _environment;
  END IF;

  SELECT * INTO cs FROM public.permission_change_sets
   WHERE id = _id AND environment = _environment
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'change set not found for environment %', _environment;
  END IF;
  IF cs.status <> 'pending' THEN
    RAISE EXCEPTION 'change set is not pending (status=%)', cs.status;
  END IF;

  before_json := cs.before;
  after_json  := cs.after;

  IF cs.target_scope = 'role' THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(
      COALESCE(after_json->'permissions', after_json)
    )) INTO add_keys;
    SELECT ARRAY(SELECT jsonb_array_elements_text(
      COALESCE(before_json->'permissions', before_json)
    )) INTO rem_keys;

    DELETE FROM public.role_permissions
     WHERE role_key = cs.target_key
       AND environment = _environment
       AND permission_key = ANY(rem_keys)
       AND NOT (permission_key = ANY(add_keys));

    INSERT INTO public.role_permissions(role_key, permission_key, environment)
      SELECT cs.target_key, k, _environment FROM unnest(add_keys) k
     ON CONFLICT DO NOTHING;

  ELSIF cs.target_scope = 'user' THEN
    FOR ov IN SELECT * FROM jsonb_array_elements(COALESCE(before_json->'overrides', '[]'::jsonb)) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(after_json->'overrides', '[]'::jsonb)) a
         WHERE a->>'permission_key' = ov->>'permission_key'
      ) THEN
        DELETE FROM public.user_permission_overrides
         WHERE user_id = cs.target_key::uuid
           AND permission_key = ov->>'permission_key'
           AND environment = _environment;
      END IF;
    END LOOP;

    FOR ov IN SELECT * FROM jsonb_array_elements(COALESCE(after_json->'overrides', '[]'::jsonb)) LOOP
      INSERT INTO public.user_permission_overrides(user_id, permission_key, mode, reason, granted_by, expires_at, environment)
      VALUES (
        cs.target_key::uuid,
        ov->>'permission_key',
        COALESCE(ov->>'mode', 'grant'),
        COALESCE(ov->>'reason', COALESCE(_reason, 'change set apply')),
        auth.uid(),
        NULLIF(ov->>'expires_at','')::timestamptz,
        _environment
      )
      ON CONFLICT (user_id, permission_key, environment)
      DO UPDATE SET
        mode = EXCLUDED.mode,
        reason = EXCLUDED.reason,
        granted_by = EXCLUDED.granted_by,
        granted_at = now(),
        expires_at = EXCLUDED.expires_at;
    END LOOP;

  ELSIF cs.target_scope = 'template' THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(
      COALESCE(after_json->'permissions', after_json)
    )) INTO add_keys;

    DELETE FROM public.permission_template_items WHERE template_id = cs.target_key::uuid;
    INSERT INTO public.permission_template_items(template_id, permission_key)
      SELECT cs.target_key::uuid, k FROM unnest(add_keys) k
     ON CONFLICT DO NOTHING;
    UPDATE public.permission_templates SET updated_at = now() WHERE id = cs.target_key::uuid;
  ELSE
    RAISE EXCEPTION 'unknown target_scope: %', cs.target_scope;
  END IF;

  UPDATE public.permission_change_sets
     SET status = 'applied',
         applied_at = now(),
         applied_by = auth.uid(),
         reason = COALESCE(_reason, reason)
   WHERE id = cs.id
   RETURNING * INTO cs;

  RETURN cs;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_permission_change_set(
  _id uuid,
  _reason text DEFAULT NULL::text,
  _environment text DEFAULT 'production'
)
RETURNS permission_change_sets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cs public.permission_change_sets;
BEGIN
  IF NOT public.has_internal_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;

  UPDATE public.permission_change_sets
     SET status = 'rejected',
         applied_at = now(),
         applied_by = auth.uid(),
         reason = COALESCE(_reason, reason)
   WHERE id = _id
     AND environment = _environment
     AND status = 'pending'
   RETURNING * INTO cs;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'change set not pending or wrong environment';
  END IF;

  RETURN cs;
END;
$function$;

-- =========================================================================
-- 7. Senior Admin SoD cleanup — remove escrow.approve
-- =========================================================================
DELETE FROM public.role_permissions
 WHERE role_key = 'senior_admin'
   AND permission_key = 'escrow.approve';
