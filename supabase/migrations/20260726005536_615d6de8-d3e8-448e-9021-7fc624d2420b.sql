
-- Atomic apply of an approved permission change set.
-- Callable only by super_admin. Applies role-grant / user-override / template-item diffs.
CREATE OR REPLACE FUNCTION public.apply_permission_change_set(_id uuid, _reason text DEFAULT NULL)
RETURNS public.permission_change_sets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT * INTO cs FROM public.permission_change_sets WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'change set not found';
  END IF;
  IF cs.status <> 'pending' THEN
    RAISE EXCEPTION 'change set is not pending (status=%)', cs.status;
  END IF;

  before_json := cs.before;
  after_json  := cs.after;

  IF cs.target_scope = 'role' THEN
    -- before/after: { "permissions": ["module.action", ...] } OR raw array
    SELECT ARRAY(SELECT jsonb_array_elements_text(
      COALESCE(after_json->'permissions', after_json)
    )) INTO add_keys;
    SELECT ARRAY(SELECT jsonb_array_elements_text(
      COALESCE(before_json->'permissions', before_json)
    )) INTO rem_keys;

    DELETE FROM public.role_permissions
     WHERE role_key = cs.target_key
       AND permission_key = ANY(rem_keys)
       AND NOT (permission_key = ANY(add_keys));

    INSERT INTO public.role_permissions(role_key, permission_key)
      SELECT cs.target_key, k FROM unnest(add_keys) k
     ON CONFLICT DO NOTHING;

  ELSIF cs.target_scope = 'user' THEN
    -- after: { "overrides": [{permission_key, mode, reason, expires_at}, ...] }
    -- before: same shape (used to know which to remove)
    -- Strategy: delete overrides listed in `before` and not in `after`; upsert everything in `after`.
    FOR ov IN SELECT * FROM jsonb_array_elements(COALESCE(before_json->'overrides', '[]'::jsonb)) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(after_json->'overrides', '[]'::jsonb)) a
         WHERE a->>'permission_key' = ov->>'permission_key'
      ) THEN
        DELETE FROM public.user_permission_overrides
         WHERE user_id = cs.target_key::uuid
           AND permission_key = ov->>'permission_key';
      END IF;
    END LOOP;

    FOR ov IN SELECT * FROM jsonb_array_elements(COALESCE(after_json->'overrides', '[]'::jsonb)) LOOP
      INSERT INTO public.user_permission_overrides(user_id, permission_key, mode, reason, granted_by, expires_at)
      VALUES (
        cs.target_key::uuid,
        ov->>'permission_key',
        COALESCE(ov->>'mode', 'grant'),
        COALESCE(ov->>'reason', COALESCE(_reason, 'change set apply')),
        auth.uid(),
        NULLIF(ov->>'expires_at','')::timestamptz
      )
      ON CONFLICT (user_id, permission_key)
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
$$;

REVOKE ALL ON FUNCTION public.apply_permission_change_set(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_permission_change_set(uuid, text) TO authenticated, service_role;


-- Reject a pending change set (super_admin only).
CREATE OR REPLACE FUNCTION public.reject_permission_change_set(_id uuid, _reason text DEFAULT NULL)
RETURNS public.permission_change_sets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
   WHERE id = _id AND status = 'pending'
   RETURNING * INTO cs;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'change set not pending or not found';
  END IF;

  RETURN cs;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_permission_change_set(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_permission_change_set(uuid, text) TO authenticated, service_role;


-- Atomic replace of a template's permission items.
CREATE OR REPLACE FUNCTION public.set_permission_template_items(_template_id uuid, _keys text[])
RETURNS SETOF public.permission_template_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_internal_role(auth.uid(), 'super_admin')
       OR public.has_internal_role(auth.uid(), 'senior_admin')) THEN
    RAISE EXCEPTION 'forbidden: manage_permissions required';
  END IF;

  DELETE FROM public.permission_template_items WHERE template_id = _template_id;

  INSERT INTO public.permission_template_items(template_id, permission_key)
    SELECT _template_id, k FROM unnest(COALESCE(_keys, ARRAY[]::text[])) k
   ON CONFLICT DO NOTHING;

  UPDATE public.permission_templates SET updated_at = now() WHERE id = _template_id;

  RETURN QUERY SELECT * FROM public.permission_template_items WHERE template_id = _template_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_permission_template_items(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_permission_template_items(uuid, text[]) TO authenticated, service_role;
