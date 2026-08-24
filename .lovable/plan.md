# Platform-side items: auth stability and supabase_admin default privileges

No project code changes. Both items sit under the managed backend, outside what this project's database role can touch.

## What I verified just now

- Backend health check: the hosted backend reports healthy right now. Nothing from this side shows the 06:38-17:58 UTC degradation persisting.
- `pg_default_acl` still contains the rows you described, unchanged, for schema `public` with grantor `supabase_admin`:
  - tables (`r`): `anon=arwdDxtm`, `authenticated=arwdDxtm`, plus `postgres` and `service_role`
  - sequences (`S`): `anon=rwU`, `authenticated=rwU`
  - functions (`f`): `anon=X`, `authenticated=X`
- The same pattern also exists for `graphql_public` and `graphql` (same grantor, same client roles). Worth including in the escalation since they are exposed schemas too.
- The `postgres`-grantor rows for `public` are clean: only `postgres`, `service_role` and the sandbox role. That matches your statement that everything reachable from `postgres` is already remediated.

## Item 1: GoTrue degradation, 2026-08-24

Not actionable from the project side. There is no exposed control for auth-service sizing, restart posture, or health-check thresholds; the only lever available here is a full backend restart, which is a blunt instrument and does nothing preventative.

What to send to the platform team, with the evidence already collected:

- Window: 2026-08-24, 06:38 to ~17:58 UTC, project ref on file.
- Symptom A: `/auth/v1/token` password grant flapping between 200 and 504 on identical credentials, for hours.
- Symptom B: edge functions performing JWT verification returned 500 on authenticated calls in the same window, taking the admin back office down.
- Control: Postgres healthy throughout, including direct reads of `auth.users`, so the fault is isolated to GoTrue, not the database.
- Questions: was the auth container resource-starved on this instance class; why did the liveness/restart policy not cycle GoTrue during an 11.5 hour degradation; can auth be given headroom or a tighter health check so it self-heals rather than flapping.

Client-side retry already exists in CI and is not proposed as a fix; real user sign-ins still failed.

## Item 2: supabase_admin default privileges

The three statements requested must run as `supabase_admin`. From the project role, both `SET ROLE supabase_admin` and `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` are denied by design, so this cannot be applied through a migration here.

Statements to be run by the platform, verbatim:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLES FROM authenticated;
```

Accompanying question for them: does any platform process periodically re-apply these default grants (migrations, extension installs, version upgrades)? That determines whether this is a one-time fix or needs a recurring drift check on our side.

Optional addition, your call: ask for the same treatment on `graphql_public` and `graphql`, which carry identical `anon=arwdDxtm` default ACLs.

## Follow-up on our side, once applied

- Re-read `pg_default_acl` to confirm the `supabase_admin`/`public` rows no longer grant `anon` anything and leave `authenticated` with `SELECT` only.
- Update the live test baseline that currently records these rows verbatim as a known platform-owned exception, so it asserts the revoked shape instead of the current one.
- Keep the drift check permanently, whatever the answer to the re-application question, since a silent re-grant is exactly the failure mode the baseline exists to catch.

Nothing in this plan touches application code, RLS policies, or grants on existing tables.
