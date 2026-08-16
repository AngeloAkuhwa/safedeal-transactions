# Fix: "supabaseUrl is required" in the built app

## What is happening

The preview/published bundle crashes at startup with `Uncaught Error: supabaseUrl is required`.

Confirmed by inspection:
- `src/integrations/supabase/client.ts` reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` from build-time env, with no fallback.
- `.env` exists locally with all three values set.
- `.gitignore` now contains a `.env` rule (under a "Secrets — never commit" block), and `git ls-files` returns **no** `.env` entry — the file is untracked.

Because Vite inlines these values at build time, and the build source no longer contains `.env`, both variables compile to `undefined` and the Supabase client throws before the app renders. This started after `.env.example` was renamed to `.env` in the last change, which left the repo with a single, ignored env file.

Important: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are **publishable** values (the anon key is designed to ship in the browser bundle and is already protected by row-level security). They are not secrets, and on this platform `.env` is an auto-generated, tracked file.

## The fix

1. Remove the `.env` ignore rules from `.gitignore` so the platform-generated `.env` is part of the build again. Keep `.env.local` and `.env.*.local` ignored — those are the right place for genuinely private local overrides.
2. Restore `.env.example` as a values-free shape reference (variable names only, empty values), so the "what does this app need" documentation the rename removed comes back without duplicating real config.
3. Rebuild and verify the preview loads with no console error, and that a data-backed screen (a signed-out public route plus one authenticated admin route) actually fetches.

## Notes

- `src/integrations/supabase/client.ts` is auto-generated and will not be edited.
- No application code, schema, or backend configuration changes are involved.
- If after restoring the file the error persists, the next step is to check the hosting build environment rather than the repo, and I will report that rather than patching around it.
