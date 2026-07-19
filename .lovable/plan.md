## Next action item: Item #16 — Lock in server-side role enforcement with integration tests

Everything above #16 is now either shipped or explicitly deferred:

- **#13 Impersonation** — deferred at your request (new dedicated screen coming).
- **#14 Design-token sweep** — the audit itself marks this out of scope for the fix pass.

That leaves **Item #16** as the only remaining actionable item from the audit.

### Why it matters

`useAdminNav.ts` gates sidebar visibility client-side. The spot check said edge functions re-derive role from the JWT via `has_role`, but nothing prevents a future function from accidentally trusting a client-supplied `role` field. An integration test locks that guarantee in.

### What to build

1. **Shared server-role assertion audit**
   - Grep every `supabase/functions/admin-*` handler and confirm it goes through `requireAdmin()` (or an equivalent `has_role(auth.uid(), 'admin')` check) before any DB work.
   - Any function missing the guard gets it added in the same pass.

2. **Vitest integration suite: `src/__tests__/admin-auth.contract.test.ts`**
   Runs against the deployed edge functions using `supabase.functions.invoke`. Covers every admin endpoint enumerated from `supabase/functions/admin-*/`:
   - **Anonymous call** (no Authorization header) → expect `401`.
   - **Authenticated non-admin call** (fresh test user, buyer role only) → expect `403`.
   - **Spoofed role in body/headers** (e.g. `{ role: 'admin' }` in payload, `x-role: admin` header) while authed as buyer → still expect `403`. Proves no function trusts client-supplied role hints.
   - **Admin call** with a seeded admin user → expect `200` (or method-appropriate success) for read-only endpoints; skip mutation endpoints in this suite.

3. **Test harness**
   - `src/__tests__/helpers/adminAuth.ts` with `signInAsBuyer()` and `signInAsAdmin()` using dedicated test accounts (emails + passwords sourced from `VITE_TEST_ADMIN_EMAIL`, `VITE_TEST_ADMIN_PASSWORD`, `VITE_TEST_BUYER_EMAIL`, `VITE_TEST_BUYER_PASSWORD` env vars so no credentials are committed).
   - Endpoint list generated at test time by reading `supabase/functions/` directory names matching `admin-*`, so newly added admin functions are automatically covered — failing the suite until they have the guard.

4. **CI wiring note**
   - Add an `npm run test:admin-auth` script and document that it requires the four env vars above. Do not add it to the default `test` script (needs a live backend), but leave it available for pre-release runs.

### Out of scope for this item

- Testing mutation semantics (that's a separate suite).
- Rate-limit / 2FA behavioral tests (covered by #3 and #4 already shipped; not part of #16).
- Any UI or design-token changes.

### After this item

The full audit — P0 through P3 minus the explicitly deferred #13 and the explicitly out-of-scope #14 — is 100% closed.
