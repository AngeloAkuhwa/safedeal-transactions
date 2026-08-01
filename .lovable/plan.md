# Correction 2 — Final closure (single coordinated run)

## Verified caller map (read-only, done now)

- `admin_users_directory_summary` and `admin_flagged_users_summary`: both `SECURITY DEFINER`, owner `postgres`, `search_path=public`, and their ACL currently includes `anon=X` and `authenticated=X`. That grant came from two historical migrations (`20260719012714`, `20260719013540`) that granted `authenticated, service_role`; `anon` inherited execute via the default `PUBLIC`-era grant path.
- The only callers in the entire repository are two service-role Edge Function helpers:
  - `supabase/functions/_shared/users-directory-sql.ts:113` → `admin.rpc("admin_users_directory_summary")`
  - `supabase/functions/_shared/flagged-users-sql.ts:228` → `admin.rpc("admin_flagged_users_summary")`
  Both use the service-role admin client after `requirePermission(...)`. No frontend service, hook, view, trigger or scheduled job calls either RPC.
- The sibling page RPCs `admin_users_directory_page` / `admin_flagged_users_page` are already `service_role`-only — the summaries are the outliers.
- `public_user_id_mapping` and `public_user_id_registry`: RLS enabled with no permissive policies, but table ACLs grant `arwdDxtm` to both `anon` and `authenticated` (registry additionally exposes DELETE to application roles at the privilege layer).
- Mapping table is referenced only by the CP2B/CP3 migrations; no runtime code path reads it.

**Recommended branch: service_role-only.** No legitimate direct authenticated caller exists, so no internal authz guard is needed and no permission key changes.

## C2-FINAL-0 — Baseline capture (read-only)

Record before any change: both summary function definitions, all identity function ACLs/owners/`proconfig`, table ACLs and RLS state for `profiles`, mapping and registry; profile count, null/duplicate/format-violation counts, public-ID checksum, mapping checksum, UUID and FK checksums; role and permission-key snapshot; current test/typecheck/build state. Re-confirm zero non-service-role callers via a repo-wide scan.

Gate: caller map confirms Edge-Function-only use. If any authenticated direct caller appears, switch that one function to the guard branch (retain `authenticated`, add a fixed-`search_path` internal check against the existing admin permission key, fail closed) instead of revoking.

## C2-FINAL-1 — Least-privilege containment migration

One idempotent migration:

- Summary RPCs: `REVOKE ALL ... FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE ... TO service_role`. Confirm owner `postgres`, `SECURITY DEFINER`, `SET search_path = public`. Function bodies and returned aggregates unchanged.
- `public_user_id_mapping`: `REVOKE ALL FROM PUBLIC, anon, authenticated`; keep `SELECT, INSERT` for `service_role`. RLS stays enabled, default-deny.
- `public_user_id_registry`: `REVOKE ALL FROM PUBLIC, anon, authenticated`; grant `service_role` only `SELECT, INSERT, UPDATE(retired_at)` — no DELETE to any application role. RLS stays enabled, default-deny.
- Sequences in the identity namespace, if any: revoke from `PUBLIC, anon, authenticated`.
- No table, column, trigger, constraint or ID value is touched. Mapping table is NOT dropped here.

Regression check added: a query enumerating identity ACL violations (any `anon`/`authenticated` privilege on identity tables or EXECUTE on identity/summary functions) must return zero rows.

Gate: anon-key and ordinary-authenticated probes against both summary RPCs return permission denied with no aggregate payload; Edge-Function admin flows still return correct summaries; five public IDs and all UUID/FK checksums unchanged.

## C2-FINAL-2 — Security and data regression

Live read-only plus rollback-only transaction tests:

- 5 profiles, 0 nulls, 0 duplicates, 0 format violations; mapping checksum equals profiles.
- Client-supplied `public_user_id` on insert is overwritten; updates to it are blocked; delete retires the ID into the registry; registry rows cannot be deleted by application roles.
- Anon/ordinary-authenticated cannot enumerate other users' public IDs or platform aggregates.
- Repo scan: zero UUID-slice user-ID derivations.
- Routine directory/flagged exports contain `public_user_id` and no raw UUID column; privileged forensic export remains permission- and reason-gated.
- Source/deployed parity for all affected Edge Functions; roles, permission keys and route definitions byte-identical to baseline.

Gate: any ID, checksum, authorization or relationship drift is a hard stop — report containment state and do not proceed.

## C2-FINAL-3 — Authenticated UI smoke test

Uses an existing authenticated preview session only; no credentials requested, read or reported.

Super Admin: directory shows five distinct correctly formatted public IDs; exact public-ID search opens the intended user; duplicate-name search returns a disambiguated list with no auto-match; row → drawer → detail → back never blanks; Flagged Users shows the same stored ID and resolves to the same UUID-backed user; transaction, dispute, escrow, payout, task, notification and audit user links open the intended record where fixtures exist; detail and access-history drawers stay stable; standard exports show public IDs and no raw UUID; refresh and direct UUID deep links still work. Console and network checked for errors and failed identity requests.

Limited existing role (if a session is available): cannot call the summary RPCs or see identity data beyond its permissions; allowed screens unchanged; unauthorized direct URLs fail safely.

If no authenticated preview session exists, UI verification is classified PENDING — this is the only permitted pause in the one-run flow, and the mapping table is not dropped and Correction 2 is not claimed complete.

## C2-FINAL-4 — Mapping-table retirement (only after all gates pass)

Reconfirm no code, function, view, trigger, policy or job depends on `public_user_id_mapping`; record the final mapping checksum plus an immutable migration/audit record proving what was applied, carrying no unnecessary personal data; drop only `public_user_id_mapping` in an idempotent migration. `public_user_id_registry` is retained permanently. Reverify all profiles retain their IDs, generator and trigger paths still work, profile/UUID/FK checksums are unchanged, and search, detail and export flows do not regress.

Rollback is forward-fix only: issued public IDs are never removed or regenerated; a grant revert is re-applied by a new migration if a legitimate caller is discovered later.

## C2-FINAL-5 — Full final verification

Full automated suites with exact passed/failed/skipped counts and skip reasons; generated-types validation, typecheck and production build; re-enumeration of function and table grants showing zero identity ACL violations; deployed/source parity for every function in the closure patch; confirmation of no unrelated UI, route, role, permission, financial or Paystack changes. Evidence-backed final report listing files, migrations, functions, grants, tests and UI paths checked, ending with exactly one of: `PASS — CORRECTION 2 CLOSED`, `PASS WITH AUTHENTICATED UI VERIFICATION PENDING`, or `FAIL`.

## Scope guarantees

Dark SafeDeal design preserved; no new roles or permission keys; no UUID/FK mutation; no ID regeneration; no speculative data repair; no publishing; no Correction 3; Correction 1 financial data untouched; Paystack deferred. Execution stops immediately on any failed gate.
