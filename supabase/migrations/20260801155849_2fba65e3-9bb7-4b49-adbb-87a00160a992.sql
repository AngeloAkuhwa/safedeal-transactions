CREATE TABLE IF NOT EXISTS public.financial_job_leases (
  job_name text PRIMARY KEY,
  lease_token uuid NOT NULL,
  holder text,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  run_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.financial_job_leases TO authenticated;
GRANT ALL ON public.financial_job_leases TO service_role;

ALTER TABLE public.financial_job_leases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal admins can view job leases" ON public.financial_job_leases;
CREATE POLICY "Internal admins can view job leases"
ON public.financial_job_leases FOR SELECT TO authenticated
USING (public.is_internal_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.financial_lease_ttl_seconds()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT GREATEST(30, LEAST(3600, COALESCE(
    NULLIF(regexp_replace(
      COALESCE((SELECT s.setting_value #>> '{}' FROM public.system_settings s
                 WHERE s.setting_key = 'financial_reconciliation_lease_seconds'
                   AND s.vendor_id IS NULL LIMIT 1), ''),
      '[^0-9]', '', 'g'), '')::integer,
    300)));
$function$;

CREATE OR REPLACE FUNCTION public.acquire_job_lease(
  p_job_name text, p_holder text DEFAULT NULL, p_ttl_seconds integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ttl integer := COALESCE(p_ttl_seconds, public.financial_lease_ttl_seconds());
  v_token uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_row public.financial_job_leases%ROWTYPE;
BEGIN
  IF p_job_name IS NULL OR length(p_job_name) < 3 THEN
    RAISE EXCEPTION 'invalid_job_name';
  END IF;

  INSERT INTO public.financial_job_leases(job_name, lease_token, holder, acquired_at, heartbeat_at, expires_at, run_count)
  VALUES (p_job_name, v_token, p_holder, v_now, v_now, v_now + make_interval(secs => v_ttl), 1)
  ON CONFLICT (job_name) DO UPDATE
    SET lease_token = v_token,
        holder = p_holder,
        acquired_at = v_now,
        heartbeat_at = v_now,
        expires_at = v_now + make_interval(secs => v_ttl),
        run_count = public.financial_job_leases.run_count + 1,
        updated_at = v_now
    WHERE public.financial_job_leases.expires_at <= v_now
  RETURNING * INTO v_row;

  IF v_row.job_name IS NULL THEN
    SELECT * INTO v_row FROM public.financial_job_leases WHERE job_name = p_job_name;
    RETURN jsonb_build_object(
      'acquired', false,
      'held_by', v_row.holder,
      'expires_at', v_row.expires_at,
      'heartbeat_at', v_row.heartbeat_at,
      'ttl_seconds', v_ttl);
  END IF;

  RETURN jsonb_build_object(
    'acquired', true,
    'lease_token', v_row.lease_token,
    'expires_at', v_row.expires_at,
    'ttl_seconds', v_ttl);
END;
$function$;

CREATE OR REPLACE FUNCTION public.heartbeat_job_lease(
  p_job_name text, p_lease_token uuid, p_ttl_seconds integer DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ttl integer := COALESCE(p_ttl_seconds, public.financial_lease_ttl_seconds());
  v_now timestamptz := now();
BEGIN
  UPDATE public.financial_job_leases
     SET heartbeat_at = v_now,
         expires_at = v_now + make_interval(secs => v_ttl),
         updated_at = v_now
   WHERE job_name = p_job_name AND lease_token = p_lease_token;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_job_lease(
  p_job_name text, p_lease_token uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_now timestamptz := now();
BEGIN
  UPDATE public.financial_job_leases
     SET expires_at = v_now, heartbeat_at = v_now, updated_at = v_now
   WHERE job_name = p_job_name AND lease_token = p_lease_token;
  RETURN FOUND;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.acquire_job_lease(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.heartbeat_job_lease(text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_job_lease(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.financial_lease_ttl_seconds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_job_lease(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_job_lease(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_job_lease(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.financial_lease_ttl_seconds() TO authenticated, service_role;

CREATE TRIGGER update_financial_job_leases_updated_at
BEFORE UPDATE ON public.financial_job_leases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();