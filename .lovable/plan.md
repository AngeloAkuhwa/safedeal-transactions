# Correction 2 — User identity and public IDs (plan only)

## 1. Findings from the read-only inspection

**Root cause is confirmed, and it is not data corruption.** There is no stored public user ID anywhere for end users. Every admin screen derives one on the fly from the first 8 hex characters of the internal UUID:

- `supabase/functions/_shared/users-directory-sql.ts:53` — `USR-${uid.slice(0,8).toUpperCase()}`
- `supabase/functions/_shared/users-directory-engine.ts:293` — same
- `supabase/functions/_shared/flagged-users-sql.ts:177`, `flagged-users-engine.ts:549` — same
- `supabase/functions/admin-flagged-user-detail/index.ts:53` — same
- `src/pages/AdminNotifications.tsx:90` — a *different*, weaker rule (first 5 hex chars)

Live database evidence: 5 profiles, 5 auth users, 0 auth users without a profile, but only **3 distinct 8-character UUID prefixes**. Three seeded users share the prefix `A1B2C3D4`, so all three render as `USR-A1B2C3D4`. This exactly reproduces the reported symptom, and truncation makes collisions inevitable at scale regardless of seed data.

**What is already safe:**
- `public.profiles.id` (uuid, PK) is the authoritative key; `auth.users.id` is 1:1 with it and every related table joins on the UUID.
- Routing is UUID-based: `/admin/users/:id` and the `/admin/users/:id/{profile,hub}` redirects (`src/App.tsx:160-163`). No route, service or edge function resolves a record from `USR-…`, from an email, or from a name.
- Search (`admin_users_directory_page`) matches only `full_name`, `email`, `phone` — it never matches the derived ID server-side; only the legacy in-memory engine filters on the derived string.
- Internal staff already have the correct model: `internal_users.display_id` is a real stored column with a `UNIQUE` constraint, and `employee_id` is generated server-side by `public.generate_employee_id()` (Crockford base32, collision retry, `SD-EMP-YYYY-XXXXXX`). This is the pattern to copy.

**Conclusion:** no relationship is keyed by a public ID, so no referential repair is required. The correction is: stop deriving, start storing a real unique immutable public ID, and read it everywhere.

## 2. What would change

**Database (new migration):**
- `public.profiles`: add `public_user_id text` + `UNIQUE` + format `CHECK` + `NOT NULL` (enforced only after backfill verifies zero nulls/duplicates).
- New `public.generate_public_user_id()` — `SECURITY DEFINER`, `SET search_path = public`, Crockford base32, collision retry, modelled on `generate_employee_id()`.
- New `public.profiles_lock_public_user_id()` BEFORE UPDATE trigger — mirrors the existing `internal_users_lock_employee_id` immutability trigger.
- `public.handle_new_user()` — assign the ID at signup so invited and OAuth users are covered.
- `public.admin_users_directory_page` and `public.admin_flagged_users_page` — select the stored column and add exact-match public-ID search.
- Grants: `EXECUTE` on the generator revoked from `PUBLIC/anon/authenticated`, granted to `service_role` only.

**Edge functions:** `_shared/users-directory-sql.ts`, `_shared/users-directory-engine.ts`, `_shared/flagged-users-sql.ts`, `_shared/flagged-users-engine.ts`, `admin-flagged-user-detail`, `admin-user-detail`, `admin-users-directory-export`, `admin-flagged-users-export`, `admin-export-worker`, `admin-user-detail-export` — read the stored column instead of slicing the UUID.

**Frontend (display only, no redesign):** `src/pages/AdminNotifications.tsx` (drop the 5-char derivation), `AdminUserDetail.tsx`, `UsersTable.tsx`, `UserDetailDrawer.tsx`, `FlaggedUsersTable.tsx`, `FlaggedUserDrawer.tsx`, `FlaggedUserCard.tsx`, plus the `display_id` typings in `admin-users-directory.service.ts` and `admin-flagged-users.service.ts`.

**Types:** `src/integrations/supabase/types.ts` regenerates after the migration.

**Unchanged:** all UUIDs, all foreign keys, all routes, all RLS policies, all roles and permission keys, all component structure and styling.

## 3. Checkpoints

**CP0 — Inventory (complete above).** Gate: nothing below assumes an unverified column. Confirmed: no public-ID-keyed relationship exists.

**CP1 — Canonical contract.** UUID stays the only join/authorization/routing key. One immutable `public_user_id` per profile: server-generated, never client-supplied, never reused after deletion, uppercase-canonical, format `USR-` + 8 Crockford base32 characters (preserves the existing `USR-XXXXXXXX` look, ~1.1e12 space, retry on collision, encodes no UUID/email/name/phone). Assigned at profile creation, so invited, suspended and soft-deleted users all have one. Search resolution order: exact UUID → exact normalized public ID → exact email → name contains, always returning a disambiguated list and never auto-selecting. Gate: contract review only.

**CP2 — Dry run.** A read-only report listing, per affected user: UUID (admin-only), current derived ID, proposed ID, preserved-vs-new, related-record counts per table, and any ambiguous reference. The mapping is persisted to a staging table first so preview and apply are byte-identical. Gate: zero rows where a relationship depends on a public ID (already measured as zero).

**CP3 — Backfill and schema migration.** Add nullable column → backfill from the persisted CP2 mapping (`WHERE public_user_id IS NULL`, resumable, idempotent) → verify zero nulls and zero duplicates → then add UNIQUE, CHECK, NOT NULL, DEFAULT and the immutability trigger. Break-glass repair only through an audited `SECURITY DEFINER` RPC gated on an existing admin permission key. No UUID or foreign key is ever written. Gate: null count = 0 and duplicate count = 0 before constraints are enforced.

**CP4 — Application and route corrections.** Replace every derivation with the stored value; links keep using UUIDs. No legacy `USR-…` route exists, so a compatibility redirect is optional — if added it resolves only an exact unique match and otherwise fails closed. Child lookup failures stay scoped to their card and never blank the parent page. Gate: manual walkthrough of Users, User Detail, Flagged Users, Transactions, Disputes, Escrow, Payouts, Tasks, Agent Performance, Notifications and Audit Logs.

**CP5 — Search, exports and audit integrity.** Exact public-ID search added server-side (never used as a join key); exports emit both `user_id` and `public_user_id`; backfill and break-glass writes create `audit_logs` rows carrying actor/target UUID plus a display snapshot; historical audit rows stay readable. Gate: export column diff and audit row check.

**CP6 — Authorization and privacy.** No policy or permission-key changes. Public-ID search is admin-only and exact-match only (no prefix enumeration, uniform not-found responses); generation is random, not sequential; no auth-provider identifiers, tokens or session data enter client payloads or logs. Gate: RLS and grant diff empty except the new generator grant.

**CP7 — Tests and staged rollout.** Coverage for generator format/collision/normalization/immutability, backfill idempotency, referential preservation, search ambiguity and exact match, routing from every affected module, unauthorized lookup and enumeration resistance, signup/invitation race, rollback-only migration, plus typecheck and production build. Rollout: snapshot → migration → edge-function deploy → frontend, with a verification gate at each step.

**CP8 — Final acceptance evidence.** Live counts proving zero duplicates and zero nulls, an unchanged-FK diff, cross-link spot checks on every module, an unchanged permission listing, clean console, and passing tests, typecheck and build.

## 4. Assumptions, blockers and irreversible risks
- Assumption: no external consumer has persisted a `USR-…` value — nothing stores one today, so this holds.
- Risk: a concurrent signup during backfill — mitigated by adding the DEFAULT before NOT NULL and re-running the idempotent backfill.
- Irreversible: once the immutability trigger is active, an assigned ID can only change through the audited break-glass path; dropping the column later loses all assignments.
- Non-blocker: only 5 profiles exist, so the backfill is trivially fast.

## 5. Downtime assessment
No downtime required. `ADD COLUMN` nullable, backfill, then constraints — all short metadata locks at this table size. The frontend tolerates the field being absent during the deploy window if the services default it.

## 6. Rollback strategy
Step-reversible: drop the trigger, then NOT NULL/UNIQUE/CHECK, then the column; revert `handle_new_user` and the two RPCs to their current definitions; redeploy the previous edge-function build. No UUID, foreign key or row is modified at any point, so rollback is pure additive reversal with zero data loss.