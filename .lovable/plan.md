# Correction 2 — User identity and public IDs (revised plan, approval pending)

## 1. Verified findings (read-only)

**Root cause confirmed — not data corruption.** No public user ID is stored for end users. Every admin surface derives one from the first 8 hex characters of the internal UUID:

- `supabase/functions/_shared/users-directory-sql.ts:53` — `USR-${uid.slice(0,8).toUpperCase()}`
- `supabase/functions/_shared/users-directory-engine.ts:293`
- `supabase/functions/_shared/flagged-users-sql.ts:177`, `_shared/flagged-users-engine.ts:549`
- `supabase/functions/admin-flagged-user-detail/index.ts:53`
- `src/pages/AdminNotifications.tsx:90` — a *different*, weaker 5-hex-character rule

Live counts: 5 profiles, 5 auth users, 0 auth users without a profile, but only **3 distinct 8-character UUID prefixes** — three seeded users share `A1B2C3D4` and all render as `USR-A1B2C3D4`. Truncation makes this inevitable at scale.

**Relationship model is safe.** `public.profiles.id` (uuid PK, 1:1 with `auth.users.id`) is the authoritative key; all 30+ inbound foreign keys reference it. Routes are UUID-only (`/admin/users/:id` plus the `/profile` and `/hub` redirects, `src/App.tsx:160-163`). No route, service, RPC or edge function resolves a record from a public ID, email or name. `admin_users_directory_page` searches `full_name`, `email`, `phone` only.

**Newly verified for this revision:**
- **Profile creation has exactly one path.** Repository search finds no `insert` into `profiles` anywhere in `src/` or `supabase/functions/`. The only writer is `public.handle_new_user()` (`SECURITY DEFINER`, `SET search_path = public`) on the `auth.users` AFTER INSERT trigger, covering email signup, invitation and OAuth alike.
- **`profiles` UPDATE is client-reachable.** Grant `authenticated=arwdDxtm` plus policy `users_update_own_profile` (`auth.uid() = id`, all columns) means any signed-in user could write a new column unless a trigger blocks it. This makes trigger-enforced immutability mandatory, not optional.
- **`profiles` SELECT exposure.** Policies: `users_select_own_profile` (self), `admins_select_all_profiles` (`has_role(auth.uid(),'admin')`), and `anon_select_public_profile_info` (`store_slug IS NOT NULL`). The anon policy is currently inert because the `anon` grant is `awdDxtm` — no `SELECT` privilege — but it is a latent exposure: restoring the grant would publish every profile column of every seller, including a new ID column. Ordinary authenticated users can already `select(*)` their own row.
- **Hard deletion is possible.** `profiles` has no `prevent_delete` trigger. `authenticated` has the DELETE privilege but no DELETE policy, so clients are blocked; `service_role` can hard-delete, and several child FKs are `ON DELETE CASCADE`/`SET NULL` (only payouts, refunds and dispute tables `RESTRICT`). "Never reused" therefore needs a tombstone registry, not an assumption.
- **Reference implementation exists.** `internal_users.display_id` is a stored `UNIQUE NOT NULL` column and `public.generate_employee_id()` already implements Crockford base32 with bounded collision retry.

**Conclusion:** no relationship is keyed by a public ID, so no referential repair is needed. The work is: store a real unique immutable public ID, generate it server-side on the single creation path, and read it everywhere.

## 2. Surfaces that would change

**Database:** `public.profiles` (+`public_user_id text`, UNIQUE, format CHECK, later NOT NULL); new `public.generate_public_user_id()`; new `public.profiles_assign_public_user_id()` BEFORE INSERT trigger; new `public.profiles_lock_public_user_id()` BEFORE UPDATE trigger; new `public.public_user_id_registry` (tombstone); new `public.public_user_id_mapping` (CP2B, service-role only, dropped after CP8); `public.handle_new_user()`; `public.admin_users_directory_page`; `public.admin_flagged_users_page`.

**Edge functions:** `_shared/users-directory-sql.ts`, `_shared/users-directory-engine.ts`, `_shared/flagged-users-sql.ts`, `_shared/flagged-users-engine.ts`, `admin-flagged-user-detail`, `admin-user-detail`, `admin-users-directory-export`, `admin-flagged-users-export`, `admin-export-worker`, `admin-user-detail-export`.

**Frontend (display only):** `AdminNotifications.tsx`, `AdminUserDetail.tsx`, `UsersTable.tsx`, `UserDetailDrawer.tsx`, `FlaggedUsersTable.tsx`, `FlaggedUserDrawer.tsx`, `FlaggedUserCard.tsx`, and the `display_id`/`short_id` typings in `admin-users-directory.service.ts` and `admin-flagged-users.service.ts`.

**Types:** `src/integrations/supabase/types.ts` regenerates after the migration.

**Unchanged:** all UUIDs, all foreign keys, all routes, all roles and permission keys, all component structure and styling.

## 3. Checkpoints

### CP0 — Read-only identity inventory (complete, section 1)
Gate: no later step assumes an unverified column, policy or grant. Confirmed: zero public-ID-keyed relationships.

### CP1 — Canonical identity contract
- Internal UUID remains the sole join, authorization and routing key. The public ID is display and exact-search metadata only.
- Format: `USR-` + **10** Crockford base32 characters (excludes I, L, O, U). Ten characters gives ~1.13e15 values instead of ~1.1e12; no compatibility constraint requires exactly 8 because no `USR-…` value is persisted anywhere today, no route accepts one, and no external consumer holds one. Visual style (`USR-` + uppercase mono) is preserved. UNIQUE constraint plus bounded collision retry regardless of length.
- Canonical form is uppercase; the format CHECK rejects anything else, and search normalizes input by trimming and upper-casing.
- Encodes no UUID, email, phone or name. Random, non-sequential.
- Never reused after deletion, enforced by the tombstone registry (CP3), not by convention.
- Coverage: assigned at profile insert, so invited, OAuth, service-created, suspended, soft-deleted and future imported users all receive one on the same path.
- Search resolution order: exact UUID → exact normalized public ID → exact email → name contains. Name matches always return a disambiguated list; nothing auto-selects.

**Generation ownership (defect 2 resolved).** No column DEFAULT. Assignment happens in `public.profiles_assign_public_user_id()`, a BEFORE INSERT trigger on `public.profiles`, owner `postgres`, `SECURITY DEFINER`, `SET search_path = public`, which unconditionally overwrites `NEW.public_user_id` with `public.generate_public_user_id()` and therefore silently ignores any client-supplied value. Trigger functions execute as the trigger function's own security context, so this does not depend on the caller having EXECUTE on the generator. `public.generate_public_user_id()` is owner `postgres`, `SECURITY DEFINER`, `SET search_path = public`, with `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE TO service_role`. `handle_new_user()` is left unchanged and simply stops needing to know about the column. Because the trigger fires on every insert path, invited, OAuth, service-role and any future permitted direct insert cannot fail and cannot choose an ID.

**Immutability.** `public.profiles_lock_public_user_id()` BEFORE UPDATE (owner `postgres`, `SET search_path = public`) raises when `NEW.public_user_id IS DISTINCT FROM OLD.public_user_id`, mirroring `internal_users_lock_employee_id`. This is required because `authenticated` holds UPDATE on `profiles` under `users_update_own_profile`.

**No break-glass RPC (defect 3 resolved).** No general admin repair path is deployed. No current business requirement for changing an assigned ID was found. Any future exceptional correction must be a separately reviewed service migration writing append-only audit evidence.

Gate: contract review only — no client-selected IDs, no collisions, no post-assignment mutation, no ambiguous resolution.

### CP2A — Genuinely read-only dry run
Read-only queries only; writes nothing. Produces, per affected user: internal UUID (admin-only context), current derived display value, related-record counts by table, and any orphaned or ambiguous reference. Plus totals: profiles, colliding groups, affected users, nulls, and a checksum over the sorted UUID list. No proposed IDs are generated here, because generating without persisting would not be reproducible.
Gate: report reviewed; confirmed zero relationships keyed by public ID, email or name. If any appeared, stop and design a separate verified repair before any backfill.

### CP2B — Frozen mapping (first write, after implementation approval)
Create `public.public_user_id_mapping (user_id uuid PK REFERENCES profiles(id), public_user_id text UNIQUE NOT NULL, generated_at timestamptz, frozen boolean)`. No grants to `anon` or `authenticated`; `GRANT ALL TO service_role` only; RLS enabled with no permissive policy. Populate it by calling the generator once per profile. `profiles` is not modified in this checkpoint.
Gate: mapping row count equals profile count, mapping uniqueness holds, no mapping value collides with the tombstone registry, and a published checksum over the sorted `(user_id, public_user_id)` pairs is recorded. CP3 backfill reads only this frozen table; it never generates inline.

### CP3 — Additive schema, tombstone registry, backfill (expand phase)
Order, each step idempotent and resumable:
1. `ALTER TABLE public.profiles ADD COLUMN public_user_id text` (nullable). Column privileges: no `anon` access; explicit column-safe handling per CP6.
2. Create `public.public_user_id_registry (public_user_id text PK, first_assigned_at timestamptz, retired_at timestamptz)` — append-only, no DELETE grant to any role, `service_role` insert only. `generate_public_user_id()` checks both `profiles` and this registry before returning, so an ID is never reused after a hard delete. An AFTER DELETE trigger on `profiles` marks `retired_at` rather than removing the row.
3. Backfill `UPDATE profiles p SET public_user_id = m.public_user_id FROM public_user_id_mapping m WHERE m.user_id = p.id AND p.public_user_id IS NULL`. Re-runnable; touches no UUID and no foreign key.
4. Verify: null count = 0, duplicate count = 0, and the post-backfill checksum equals the CP2B checksum.
5. Only then add `UNIQUE`, the format `CHECK`, `NOT NULL`, the BEFORE INSERT assignment trigger and the BEFORE UPDATE immutability trigger.

Concurrency: the assignment trigger is installed before `NOT NULL`, so a signup racing the backfill still gets a valid ID; the backfill's `IS NULL` predicate makes a re-run safe. Each step is a single short transaction; at 5 rows the metadata locks are momentary.
Gate: zero nulls, zero duplicates, zero ambiguous references, checksum match — before any constraint is enforced.

### CP4 — Services and routes (migrate phase, no temporary fallback)
All ten edge-function surfaces and the frontend read `profiles.public_user_id`. **Every UUID-slice derivation is deleted outright** — no fallback recreates a truncated ID, and a repository search for `slice(0, 8)`/`slice(0, 5)` on a user id must return zero hits. The wire field name `display_id` (and `short_id` on flagged users) is retained so old clients keep working, but after cutover its value comes only from stored `public_user_id`.
Links and fetches stay UUID-based. No legacy `USR-…` route exists; if one is later added it must resolve only an exact unique match and otherwise fail closed. A child lookup failure stays scoped to its card and never blanks the parent page. No redesign — drawers, tables, badges, filters, loading, empty, error and access-denied states are untouched.
Gate: walkthrough of Users, User Detail, Flagged Users, Transactions, Disputes, Escrow, Payouts, Tasks, Agent Performance, Notifications, Audit Logs and Access Control; every cross-link opens the intended record.

### CP5 — Search, exports, audit integrity
- Server-side exact public-ID match added to `admin_users_directory_page` and `admin_flagged_users_page` (equality on the normalized value, never a prefix or `ILIKE '%…%'`, never a join key).
- **Exports (defect 6 resolved):** standard admin exports (`admin-users-directory-export`, `admin-flagged-users-export`, the users and flagged builders in `admin-export-worker`, and the non-compliance `admin-user-detail-export` report types) emit `public_user_id` and **drop the raw `user_id` UUID column**. The internal UUID appears only in the existing privileged `compliance` forensic export, which already requires a reason and an audit record, and remains permission-controlled.
- Backfill and any future exceptional correction write append-only `audit_logs` rows carrying actor/target UUID plus a display snapshot, with no secrets and no unnecessary personal data. Existing historical audit rows stay readable because nothing about their keys changes.
Gate: export column diff reviewed; audit rows present; UUID absent from every non-privileged export.

### CP6 — Authorization, privacy, enumeration
- No policy, role or permission-key changes to existing objects. The claim is scoped: the *new column's* exposure is explicitly designed, not assumed.
- The new column inherits the four existing `profiles` policies. Two consequences are handled: a user can read their own value via `select(*)` (acceptable — it is their own ID and is not a credential), and `anon_select_public_profile_info` would expose it for every storefront seller if the missing `anon` SELECT grant were ever restored. Mitigation: keep `anon` without SELECT on `profiles`, and additionally serve public storefront data through explicit column lists (or a `security_invoker` view) that omit `public_user_id`, so restoring a grant cannot leak it. Public storefront service code is reviewed for `select("*")` on `profiles` as part of this checkpoint.
- Admin-only surfaces are unchanged in scope: correcting the ID broadens nobody's visibility.
- Enumeration resistance: exact-match search only, uniform not-found responses, random non-sequential generation, no prefix search endpoint.
- No auth-provider identifiers, tokens or session data enter client payloads or logs.
Gate: grant and policy diff empty except the new generator/registry/mapping grants; no `select("*")` on `profiles` remains on any anon-reachable path.

### CP7 — Tests and staged rollout
Automated coverage: generator format and charset; bounded collision retry; normalization; immutability trigger rejects updates; client-supplied value on insert is ignored; backfill idempotency and resumability; referential-integrity preservation; tombstone prevents reuse after hard delete; search exact-match and name-ambiguity disambiguation; routing from every affected admin module; unauthorized lookup and enumeration resistance; signup/invitation concurrency during backfill; rollback-only migration test; regenerated types compile; `tsgo` typecheck; production build.
Rollout order (expand → migrate → contract): snapshot → CP3 migration → verification gate → edge-function deploy → frontend deploy → verification gate → drop `public_user_id_mapping` after CP8 sign-off.

### CP8 — Final acceptance evidence
Explicit gates, all must pass:
1. Zero duplicate and zero null `public_user_id`.
2. Zero client-controlled assignment (insert-with-supplied-ID test proves the value is overwritten).
3. Zero anon or ordinary-authenticated enumeration of other users' IDs.
4. Zero remaining UUID-slice derivations found by repository search.
5. UUID and foreign-key relationship checksums identical to the CP0 baseline.
6. Signup/invitation concurrency test passes.
7. Exact public-ID search returns one record; ambiguous name search returns a disambiguated list.
8. Every cross-link from every admin module opens the intended record; no blank pages, dead routes, console errors or failed identity queries.
9. Roles and permission keys byte-identical to baseline.
10. Regenerated types, full test suite, typecheck and production build all pass.

## 4. Assumptions, blockers, irreversible risks
- Verified, not assumed: single profile-insert path; UUID-only joins and routes; no persisted `USR-…` value anywhere.
- Risk: signup during backfill — mitigated by installing the assignment trigger before `NOT NULL` and by the `IS NULL` backfill predicate.
- Risk: a future migration restoring `anon` SELECT on `profiles` — mitigated by CP6 column-safe reads.
- Irreversible: once IDs are displayed in screens, exports or support workflows, they are issued identifiers and must be preserved (see rollback).
- Non-blocker: 5 profiles, so backfill and constraint addition are effectively instant.

## 5. Downtime
None required. Additive nullable column, backfill, then constraints — all short metadata locks at this table size. Between the migration and the service deploy, responses still carry `display_id`; only its source changes.

## 6. Rollback and point of no return
**Backup:** a database snapshot is taken immediately before CP3 and retained through CP8.

**Before application cutover (CP3 complete, CP4 not deployed)** — fully reversible: drop the two triggers, then `NOT NULL`/`UNIQUE`/`CHECK`, then the column, the mapping table and the registry. No UUID, foreign key or row was modified, so this is pure additive reversal with zero data loss.

**Point of no return: the moment CP4 is deployed and stored IDs appear in a screen, an export or a support conversation.** After that, never drop the column or mapping and never revert to truncated derived IDs — issued identifiers must be preserved. Rollback becomes forward-fix only: revert readers and writers (edge functions, frontend) to the previous build while leaving the column, registry, constraints and triggers in place, then correct forward. Rollback criteria: any duplicate or null detected, any cross-link resolving to the wrong record, or any enumeration finding.

**Post-deploy monitoring:** scheduled duplicate/null count check, failed-identity-query rate, and export column audit for accidental UUID reintroduction.