-- Canonical internal-role rank. Mirrors
-- supabase/functions/_shared/internal-role-rank.ts — keep the two in sync.
CREATE OR REPLACE FUNCTION public.internal_role_rank(_role_key text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _role_key
    WHEN 'super_admin' THEN 100
    WHEN 'senior_admin' THEN 80
    WHEN 'dispute_manager' THEN 60
    WHEN 'finance_approver' THEN 60
    WHEN 'compliance_officer' THEN 60
    WHEN 'dispute_agent' THEN 40
    WHEN 'finance_operator' THEN 40
    WHEN 'identity_officer' THEN 40
    WHEN 'support_agent' THEN 40
    WHEN 'auditor' THEN 40
    ELSE 0
  END
$$;

REVOKE ALL ON FUNCTION public.internal_role_rank(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_role_rank(text) TO authenticated, service_role;

-- Highest rank currently held by a user (0 when they hold no internal role).
CREATE OR REPLACE FUNCTION public.internal_actor_rank(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(public.internal_role_rank(role_key)), 0)
  FROM public.internal_user_roles
  WHERE user_id = _user_id
$$;

REVOKE ALL ON FUNCTION public.internal_actor_rank(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_actor_rank(uuid) TO authenticated, service_role;

-- Extend the existing guardrail trigger with an escalation guard.
CREATE OR REPLACE FUNCTION public.enforce_internal_role_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  other_roles text[];
  actor_id uuid := auth.uid();
  actor_rank integer;
  target_rank integer;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    -- 1) Privilege-escalation guard.
    --    Service-role writers (edge functions) are exempt here: they enforce
    --    the same rule in application code via _shared/internal-role-rank.ts,
    --    where the acting user's identity is known.
    IF actor_id IS NOT NULL THEN
      IF public.internal_role_rank(NEW.role_key) = 0 THEN
        RAISE EXCEPTION 'invalid_role: % is not a known internal role', NEW.role_key
          USING ERRCODE = '22023';
      END IF;

      actor_rank := public.internal_actor_rank(actor_id);
      target_rank := public.internal_role_rank(NEW.role_key);

      IF actor_rank < 100 THEN
        -- Only a super_admin may grant super_admin or senior_admin.
        IF NEW.role_key IN ('super_admin','senior_admin') THEN
          RAISE EXCEPTION 'insufficient_rank: only a super_admin may assign %', NEW.role_key
            USING ERRCODE = '42501';
        END IF;
        -- Otherwise the writer must strictly outrank the role being written.
        IF actor_rank <= target_rank THEN
          RAISE EXCEPTION 'insufficient_rank: you may only assign roles below your own level'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;

    SELECT COALESCE(array_agg(role_key), ARRAY[]::text[])
      INTO other_roles
      FROM public.internal_user_roles
      WHERE user_id = NEW.user_id AND role_key <> NEW.role_key;

    -- super_admin must be exclusive
    IF NEW.role_key = 'super_admin' AND array_length(other_roles,1) > 0 THEN
      RAISE EXCEPTION 'super_admin cannot be combined with other roles';
    END IF;
    IF 'super_admin' = ANY(other_roles) THEN
      RAISE EXCEPTION 'user already has super_admin, cannot add another role';
    END IF;

    -- segregation of duties: finance_operator + finance_approver
    IF NEW.role_key = 'finance_operator' AND 'finance_approver' = ANY(other_roles) THEN
      RAISE EXCEPTION 'finance_operator cannot be combined with finance_approver';
    END IF;
    IF NEW.role_key = 'finance_approver' AND 'finance_operator' = ANY(other_roles) THEN
      RAISE EXCEPTION 'finance_approver cannot be combined with finance_operator';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
