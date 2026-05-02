## Provision Admin Test Account

Create a fully-provisioned admin account that you can use to sign in immediately at `/auth` — no email confirmation step, no manual role grant.

### Credentials you'll use

- **Email:** `admin@safedeal.test`
- **Password:** `SafeDealAdmin#2026`
- **Sign-in URL:** `/auth?mode=login&redirect=%2Fadmin%2Fdashboard`

### What gets provisioned

A one-shot temporary edge function (`provision-admin`) runs with the service role key and:

1. **Creates the auth user** via `supabase.auth.admin.createUser({ email, password, email_confirm: true })` so you can sign in immediately without email verification.
2. **Seeds `profiles`** with display name "SafeDeal Admin" and the user's id.
3. **Grants the `admin` role** by inserting into `user_roles` (`role = 'admin'`). This is what the `requireRole="admin"` guard on `/admin/*` checks via `has_role()`.
4. **Marks `account_verifications`** as fully verified (email + phone + identity) so the admin profile looks clean in the UI.
5. **Idempotent:** if `admin@safedeal.test` already exists, it just (re)applies the role + profile rows and resets the password to the one above. Safe to re-run.

The function is invoked once from a deploy step, then can be left in place (it's gated by a hard-coded one-time `PROVISION_TOKEN` check so it can't be abused). I'll show you the invocation result so you can confirm success before signing in.

### Files

- `supabase/functions/provision-admin/index.ts` — service-role provisioning logic (createUser, upsert profile, upsert user_roles, upsert account_verifications)
- Deploy + invoke the function once, surface the JSON result (`{ user_id, email, role: "admin" }`)

### After it runs

1. Go to `/auth?mode=login&redirect=%2Fadmin%2Fdashboard`
2. Sign in with the credentials above
3. You'll land directly on the Central Admin Dashboard

### Security note

These are throwaway test credentials for a non-production environment. **Rotate the password** (or delete the user) before going live. I can also delete the `provision-admin` function once you confirm access — just say the word.
