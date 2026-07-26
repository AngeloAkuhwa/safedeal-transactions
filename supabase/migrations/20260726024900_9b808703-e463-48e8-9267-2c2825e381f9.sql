
ALTER TABLE public.permission_change_sets
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

ALTER TABLE public.permission_change_sets
  DROP CONSTRAINT IF EXISTS permission_change_sets_status_check;
ALTER TABLE public.permission_change_sets
  ADD CONSTRAINT permission_change_sets_status_check
  CHECK (status = ANY (ARRAY[
    'draft','pending','pending_approval','approved','rejected',
    'applied','cancelled','failed','requested_changes'
  ]));

ALTER TABLE public.permission_change_sets
  DROP CONSTRAINT IF EXISTS permission_change_sets_target_scope_check;
ALTER TABLE public.permission_change_sets
  ADD CONSTRAINT permission_change_sets_target_scope_check
  CHECK (target_scope = ANY (ARRAY['role','user','template','permission']));

CREATE OR REPLACE FUNCTION public.prevent_delete_permission_change_sets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('applied','rejected','cancelled','failed') THEN
    RAISE EXCEPTION 'Historical permission change sets cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_permission_change_sets ON public.permission_change_sets;
CREATE TRIGGER trg_prevent_delete_permission_change_sets
  BEFORE DELETE ON public.permission_change_sets
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_permission_change_sets();

INSERT INTO public.system_settings (setting_key, setting_value, scope)
VALUES ('permission.approval_ttl_days', '7'::jsonb, 'platform')
ON CONFLICT (setting_key, scope, COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
