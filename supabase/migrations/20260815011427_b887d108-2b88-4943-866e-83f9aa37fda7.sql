-- net.http_* is latent SSRF. The functions are owned by supabase_admin so the
-- EXECUTE grant is not ours, but schema USAGE is the gate that actually makes
-- them callable — revoke it from every client role.
DO $$
BEGIN
  EXECUTE 'REVOKE USAGE ON SCHEMA net FROM anon, authenticated, PUBLIC';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'cannot revoke usage on schema net: %', SQLERRM;
END $$;