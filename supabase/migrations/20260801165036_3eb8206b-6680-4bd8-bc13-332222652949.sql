-- =========================================================
-- Correction 1 — Phase 1: containment
-- =========================================================

-- 1. Cron secret in the encrypted vault (never in source or logs)
DO $$
DECLARE v_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'reconcile_escrow_cron_secret') INTO v_exists;
  IF NOT v_exists THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(48), 'hex'),
      'reconcile_escrow_cron_secret',
      'Shared secret authorizing the reconcile-escrow scheduler invocation'
    );
  END IF;
END$$;

-- 2. Constant-time-ish comparison helper, service_role only.
CREATE OR REPLACE FUNCTION public.verify_reconcile_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE v_secret text;
BEGIN
  IF p_secret IS NULL OR length(p_secret) < 32 THEN
    RETURN false;
  END IF;
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'reconcile_escrow_cron_secret'
  LIMIT 1;
  IF v_secret IS NULL THEN
    RETURN false;
  END IF;
  RETURN encode(digest(p_secret, 'sha256'), 'hex') = encode(digest(v_secret, 'sha256'), 'hex');
END;
$$;

REVOKE ALL ON FUNCTION public.verify_reconcile_cron_secret(text) FROM PUBLIC, anon, authenticated, sandbox_exec;
GRANT EXECUTE ON FUNCTION public.verify_reconcile_cron_secret(text) TO service_role;

-- 3. Scheduler wrapper: reads the secret at run time so the cron command text
--    contains no credential.
CREATE OR REPLACE FUNCTION public.trigger_reconcile_escrow()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'reconcile_escrow_cron_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'reconcile_escrow_cron_secret is not configured';
  END IF;

  SELECT net.http_post(
    url := 'https://cfkdasmhlqswpunugbkf.supabase.co/functions/v1/reconcile-escrow',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := jsonb_build_object('source', 'pg_cron', 'triggered_at', now())
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_reconcile_escrow() FROM PUBLIC, anon, authenticated, sandbox_exec;

-- 4. Exactly one schedule, now credential-free in the job command.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-escrow-hourly') THEN
    PERFORM cron.unschedule('reconcile-escrow-hourly');
  END IF;
END$$;

SELECT cron.schedule(
  'reconcile-escrow-hourly',
  '7 * * * *',
  $cron$ SELECT public.trigger_reconcile_escrow(); $cron$
);

-- =========================================================
-- 5. Privilege gaps
-- =========================================================
REVOKE ALL ON FUNCTION public.admin_correct_pricing(uuid, numeric, numeric, numeric, text)
  FROM PUBLIC, anon, authenticated, sandbox_exec;
GRANT EXECUTE ON FUNCTION public.admin_correct_pricing(uuid, numeric, numeric, numeric, text) TO service_role;

REVOKE ALL ON FUNCTION public.validate_money_transition(money_status, money_status) FROM PUBLIC, anon, authenticated, sandbox_exec;
GRANT EXECUTE ON FUNCTION public.validate_money_transition(money_status, money_status) TO service_role;
REVOKE ALL ON FUNCTION public.prevent_pricing_update_after_lock() FROM PUBLIC, anon, authenticated, sandbox_exec;

-- sandbox_exec: NOLOGIN-equivalent tooling role, not inherited by anon /
-- authenticated. Strip every financial write + routine execute; SELECT stays
-- for read-only inspection.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.escrow_ledger_entries FROM sandbox_exec;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname ~ 'payout|refund|escrow|ledger|financial|pricing|freeze|money|lease|reconcil'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM sandbox_exec, PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END$$;

-- =========================================================
-- 6. Immutable ledger: block every UPDATE, including service_role.
-- =========================================================
CREATE OR REPLACE FUNCTION public.prevent_escrow_ledger_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'escrow_ledger_entries is append-only: UPDATE is not permitted (use a compensating entry)';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_escrow_ledger_update ON public.escrow_ledger_entries;
CREATE TRIGGER trg_prevent_escrow_ledger_update
BEFORE UPDATE ON public.escrow_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.prevent_escrow_ledger_update();

-- =========================================================
-- 7. ACL regression check surface
-- =========================================================
CREATE OR REPLACE FUNCTION public.financial_acl_violations()
RETURNS TABLE (routine text, issue text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.oid::regprocedure::text,
         CASE
           WHEN p.proacl IS NULL THEN 'default PUBLIC execute'
           ELSE 'anon/authenticated/PUBLIC execute granted'
         END
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname ~ 'payout|refund|escrow|ledger|financial|pricing|freeze|money|lease|reconcil'
    AND (
      p.proacl IS NULL
      OR EXISTS (
        SELECT 1 FROM aclexplode(p.proacl) a
        WHERE a.privilege_type = 'EXECUTE'
          AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon','authenticated'))
      )
    )
  UNION ALL
  SELECT p.oid::regprocedure::text, 'missing fixed search_path'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND p.proname ~ 'payout|refund|escrow|ledger|financial|pricing|freeze|money|lease|reconcil'
    AND (p.proconfig IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
    ));
$$;

REVOKE ALL ON FUNCTION public.financial_acl_violations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.financial_acl_violations() TO service_role, sandbox_exec;