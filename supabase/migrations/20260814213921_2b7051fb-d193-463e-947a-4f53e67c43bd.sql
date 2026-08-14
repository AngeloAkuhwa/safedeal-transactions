-- The refund-rail proof must be runnable from the test harness. It writes
-- nothing (every path self-rolls back), so exposing it to the sandbox tooling
-- role is safe and is what makes the check reproducible in CI.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.selftest_refund_rail(text) TO sandbox_exec';
  END IF;
END
$$;