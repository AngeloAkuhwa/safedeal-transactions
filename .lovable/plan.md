# Rotate passwords for the three E2E test accounts

Goal: set new passwords on the three disposable audit accounts so CI's preflight (`scripts/verify-e2e-credentials.mjs`) and the mobile render audit can authenticate again.

Accounts (by id):
- `0e2e0001-...-0001` — claude.e2e.buyer@safedeal.test
- `0e2e0001-...-0002` — claude.e2e.seller@safedeal.test
- `0e2e0001-...-0003` — claude.e2e.admin@safedeal.test

## What I need from you

Send the three passwords in your next message (one per account, or one shared value). Since these are throwaway test accounts, pasting them in chat is acceptable — but note they'll live in this conversation, so don't reuse them anywhere real. Each must be at least 16 characters to match the guard in `scripts/provision-e2e-identities.mjs`.

## What I'll do

1. Run a migration that updates each account's password hash directly:
   - `encrypted_password = crypt('<new password>', gen_salt('bf'))`
   - `email_confirmed_at = COALESCE(email_confirmed_at, now())`, `banned_until = NULL`, `updated_at = now()`
   - Matched by the three ids above only — no other rows touched.
2. Verify each account can actually sign in by calling the auth token endpoint with the anon key, and report pass/fail per account.

## Notes

- No application code changes. This is a data-only change to the three seeded auth rows.
- After this lands, update the GitHub repository secrets `E2E_BUYER_PASSWORD`, `E2E_SELLER_PASSWORD`, `E2E_ADMIN_PASSWORD` (and the `VITE_TEST_*` equivalents) to the same values, otherwise CI will still fail with 400.
- The passwords will not be written into any tracked file; only the migration statement carries them, and that isn't committed to the app source.
