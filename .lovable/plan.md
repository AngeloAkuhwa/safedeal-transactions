# Rotate passwords for the three E2E test accounts

Goal: set one shared new password on the three disposable audit accounts so sign-in works again (auth logs currently show `400 invalid_credentials` for these accounts) and CI's preflight (`scripts/verify-e2e-credentials.mjs`) can authenticate.

Accounts (by id):
- `0e2e0001-...-0001` — claude.e2e.buyer@safedeal.test
- `0e2e0001-...-0002` — claude.e2e.seller@safedeal.test
- `0e2e0001-...-0003` — claude.e2e.admin@safedeal.test

Password: the single shared value you sent in chat (21 characters, meets the 16-char minimum used by `scripts/provision-e2e-identities.mjs`). It will not be written into any tracked file.

## What I'll do

1. Run one migration that updates only those three rows in `auth.users`:
   - `encrypted_password = crypt('<shared password>', gen_salt('bf'))`
   - `email_confirmed_at = COALESCE(email_confirmed_at, now())`
   - `banned_until = NULL`, `updated_at = now()`
   - Matched strictly by the three ids — no other rows touched, no schema change.
2. Verify by calling the auth token endpoint (`/auth/v1/token?grant_type=password`) with the public anon key once per account, and report OK / failure per account.

## After it lands (your side)

Update the GitHub repository secrets to the same value, or CI will keep failing with 400:
- `E2E_BUYER_PASSWORD`, `E2E_SELLER_PASSWORD`, `E2E_ADMIN_PASSWORD`
- `VITE_TEST_ADMIN_PASSWORD`, `VITE_TEST_BUYER_PASSWORD`

## Notes

- No application code changes — data-only.
- Since the value was pasted in chat, treat it as disposable and never reuse it for a real account.
