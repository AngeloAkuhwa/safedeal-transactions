-- No table in public has a policy granting anon INSERT/UPDATE/DELETE (verified
-- against pg_policy), yet 70 tables still carried the grants as inherited
-- default-privilege residue. Revoke schema-wide so the class is closed, not
-- just the 32 tables on the security list.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass::text AS rel
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %s FROM anon, PUBLIC', r.rel);
  END LOOP;
END $$;