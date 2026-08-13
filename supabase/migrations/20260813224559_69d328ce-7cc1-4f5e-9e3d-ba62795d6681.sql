CREATE OR REPLACE FUNCTION public.apply_permission_change_set(_id uuid, _reason text DEFAULT NULL::text, _environment text DEFAULT 'production'::text)
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
  rule_row public.assignment_rules;
  next_ver integer;
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

  -- Accept every status the application actually writes on submit:
  --   'pending_approval' (review workflow), 'draft' (auto-apply path),
  --   'pending' (legacy), 'requested_changes' (re-submitted after edits).
  IF cs.status NOT IN ('pending', 'pending_approval', 'draft', 'requested_changes') THEN
    RAISE EXCEPTION 'change set is not applicable (status=%)', cs.status;
  END IF;

  -- Self-approval guard: when a change set explicitly requires approval, the
  -- requester may not approve their own change.
  IF COALESCE(cs.requires_approval, false)
     AND cs.requested_by IS NOT NULL
     AND cs.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'self_approval_forbidden';
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

  ELSIF cs.target_scope = 'orchestration_rules' THEN
    INSERT INTO public.assignment_rules(scope, mode, config, updated_by)
    VALUES (
      cs.target_key,
      COALESCE(after_json->>'mode', 'round_robin'),
      after_json,
      auth.uid()
    )
    ON CONFLICT (scope) DO UPDATE
      SET mode = EXCLUDED.mode,
          config = EXCLUDED.config,
          updated_by = EXCLUDED.updated_by
    RETURNING * INTO rule_row;

    SELECT COALESCE(MAX(version), 0) + 1 INTO next_ver
      FROM public.assignment_rule_versions WHERE rule_id = rule_row.id;

    INSERT INTO public.assignment_rule_versions(rule_id, version, config, actor_id, note, approved_by, approved_at, change_set_id)
    VALUES (rule_row.id, next_ver, after_json,
            COALESCE(cs.requested_by, auth.uid()),
            COALESCE(_reason, cs.reason, 'approved change set'),
            auth.uid(), now(), cs.id);

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