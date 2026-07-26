-- 1. permissions governance columns
ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_role text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'permissions_status_check'
  ) THEN
    ALTER TABLE public.permissions
      ADD CONSTRAINT permissions_status_check
      CHECK (status IN ('active','suspended','deprecated'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.permissions_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_permissions_touch_updated_at ON public.permissions;
CREATE TRIGGER trg_permissions_touch_updated_at
BEFORE UPDATE ON public.permissions
FOR EACH ROW EXECUTE FUNCTION public.permissions_touch_updated_at();

-- 2. permission_environments join table
CREATE TABLE IF NOT EXISTS public.permission_environments (
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('production','staging','development')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (permission_key, environment)
);

GRANT SELECT ON public.permission_environments TO authenticated;
GRANT ALL ON public.permission_environments TO service_role;
ALTER TABLE public.permission_environments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read permission envs" ON public.permission_environments;
CREATE POLICY "auth read permission envs" ON public.permission_environments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "super admin manage permission envs" ON public.permission_environments;
CREATE POLICY "super admin manage permission envs" ON public.permission_environments
  FOR ALL TO authenticated
  USING (public.has_internal_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_internal_role(auth.uid(), 'super_admin'));

-- Backfill: every existing permission enabled in all three environments
INSERT INTO public.permission_environments (permission_key, environment)
SELECT p.key, e.env
FROM public.permissions p
CROSS JOIN (VALUES ('production'),('staging'),('development')) AS e(env)
ON CONFLICT DO NOTHING;

-- 3. RLS: writes to permissions restricted to super_admin
DROP POLICY IF EXISTS "super admin manage permissions" ON public.permissions;
CREATE POLICY "super admin manage permissions" ON public.permissions
  FOR ALL TO authenticated
  USING (public.has_internal_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_internal_role(auth.uid(), 'super_admin'));

-- 4. Prevent hard-delete of permissions referenced anywhere
CREATE OR REPLACE FUNCTION public.permissions_prevent_delete_if_referenced()
RETURNS TRIGGER AS $$
DECLARE
  ref_count int;
BEGIN
  SELECT
    (SELECT count(*) FROM public.role_permissions WHERE permission_key = OLD.key) +
    (SELECT count(*) FROM public.user_permission_overrides WHERE permission_key = OLD.key) +
    (SELECT count(*) FROM public.permission_template_items WHERE permission_key = OLD.key)
  INTO ref_count;

  IF ref_count > 0 THEN
    RAISE EXCEPTION 'Permission % is assigned or referenced; mark it as deprecated instead of deleting.', OLD.key
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_permissions_prevent_delete ON public.permissions;
CREATE TRIGGER trg_permissions_prevent_delete
BEFORE DELETE ON public.permissions
FOR EACH ROW EXECUTE FUNCTION public.permissions_prevent_delete_if_referenced();

-- 5. New admin_action_type enum values
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'permission_registered' AND enumtypid = 'public.admin_action_type'::regtype) THEN
    ALTER TYPE public.admin_action_type ADD VALUE 'permission_registered';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'permission_updated' AND enumtypid = 'public.admin_action_type'::regtype) THEN
    ALTER TYPE public.admin_action_type ADD VALUE 'permission_updated';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'permission_status_changed' AND enumtypid = 'public.admin_action_type'::regtype) THEN
    ALTER TYPE public.admin_action_type ADD VALUE 'permission_status_changed';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'permission_deprecated' AND enumtypid = 'public.admin_action_type'::regtype) THEN
    ALTER TYPE public.admin_action_type ADD VALUE 'permission_deprecated';
  END IF;
END $$;