-- Revoke every privilege held by an account whose password is in this repo.
--
-- 20260815095357 seeded three disposable audit accounts and wrote their
-- passwords straight into the file, hashed at apply time from a plaintext
-- literal. That is fine for a sandbox and not fine for a database anyone can
-- reach: the admin account holds `super_admin`, and the plaintext was readable
-- by anyone with repo access. It authenticated when this was written.
--
-- The literals are now removed from every committed file so a replay cannot
-- recreate a usable login. This migration handles the database that already
-- has them.
--
-- Deleting the accounts outright is the end state, but it cannot happen in
-- committed SQL alone — the render audit signs in as these users, so they have
-- to be re-provisioned from CI secrets in the same motion, and that needs a
-- service-role key this migration does not have.
--
-- So this migration does the part that needs nothing else, and does it now:
-- it removes the *capability*. The admin loses `super_admin` and its
-- back-office row; all three lose the ability to sign in. Buyer and seller
-- keep their data (the seeded product, media and cart the audit reads) so
-- nothing downstream breaks, but nobody can authenticate as them.
--
-- Re-enabling for an audit run is deliberate and out-of-band:
--   node scripts/provision-e2e-identities.mjs      (needs SUPABASE_SERVICE_ROLE_KEY)
--
-- The companion contract test in src/__tests__/committed-credentials.contract.test.ts
-- fails the build if a privileged role is ever again granted to an account
-- whose password appears in a committed file.

BEGIN;

-- 1. Back-office privilege first — this is the one that matters.
DELETE FROM public.internal_user_roles
 WHERE user_id IN (
   SELECT id FROM auth.users WHERE email LIKE 'claude.e2e.%@safedeal.test'
 );

DELETE FROM public.internal_users
 WHERE email LIKE 'claude.e2e.%@safedeal.test';

-- 2. Make the committed passwords useless. The rows stay so the seeded
--    product, media and cart keep their owners and foreign keys hold; the
--    credentials stop working. `provision-e2e-identities.mjs` sets a fresh
--    password from a secret when an audit actually needs one.
UPDATE auth.users
   SET encrypted_password = NULL,
       banned_until = 'infinity'::timestamptz,
       updated_at = now()
 WHERE email LIKE 'claude.e2e.%@safedeal.test';

COMMIT;
