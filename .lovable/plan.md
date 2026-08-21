# Resolve the three PR merge conflicts

GitHub reports conflicts in exactly three files:

- `supabase/functions/admin-dispute-transition/index.ts`
- `supabase/functions/admin-export-enqueue/index.ts`
- `supabase/functions/admin-transaction-actions/index.ts`

These are the same three functions changed to fix the auth-ordering CI failure (authenticate first, then parse the body, then apply the fine-grained permission gate). The base branch still holds the older ordering (parse body first), so every hunk overlaps.

## Constraint I need you to know

This sandbox's `origin` is Lovable's internal git store, not GitHub. I cannot fetch the PR branch, see the base branch, or write a merge commit to GitHub from here. So the resolution happens one of two ways:

1. **You link the GitHub connector** (or paste the conflicted hunks), and I do the resolution end to end.
2. **You use GitHub's "Resolve conflicts" web editor** and I supply the exact final content for each of the three files — you replace the whole conflicted file with it and mark resolved.

Option 2 needs no new access and is what the steps below assume.

## Resolution rule for all three files

Take **our side** (the auth-first version) in full, and keep any base-branch change that is unrelated to auth ordering. Specifically:

- Keep `requireAdmin(req)` as the first thing after the `OPTIONS` / method check, before any `req.json()`.
- Keep the per-action / per-export-type fine-grained gate (`requireAnyPermission`, `requirePermission`) running after body parsing, passing the already-resolved context so we do not re-authenticate.
- Keep `authErrorResponse` mapping so anonymous callers get 401 and authenticated non-admins get 403 — never a 400 from body validation.
- Do not delete any base-branch business logic (new actions, new export types, extra audit fields). If the base side added one, port it into our ordering rather than discarding it.

Per file:

- **admin-dispute-transition** — `requireAdmin` first; then parse; then `requireAnyPermission` with `disputes.escalate` for escalations and `disputes.update_status` / `disputes.update` otherwise. Transition matrix, optimistic lock on `status`, `dispute_status_history` insert and `logAdminAction` all stay.
- **admin-export-enqueue** — `requireAdmin` first; then parse `export_type`; then `requirePermission(EXPORT_PERMS[type])`; then rate limit, insert the job, fire-and-forget the worker.
- **admin-transaction-actions** — three explicit stages: (a) `requireAdmin`, (b) body parse/validate plus the money-movement refusal, (c) `gateAction(req, action, baseCtx)`. `gateAction` keeps the `AuthContext` typing so lint stays clean.

## Steps

1. I print the full, final content of each of the three files.
2. You paste each into GitHub's conflict web editor (replace everything, including all `<<<<<<<` / `=======` / `>>>>>>>` markers), mark resolved, commit the merge.
3. If the base branch turns out to contain logic not in our version, paste that hunk to me before committing and I will merge it in properly instead of guessing.

## Verification

After the merge commit lands, CI runs the binding gates. Locally I will re-confirm, without any credentials:

- typecheck, build, lint (no new lint errors)
- full vitest suite (credentialed suites skip locally by design)
- admin routes smoke 47/47

The nine `admin-auth.contract.test.ts` role-enforcement cases are CI's job — they need the E2E credentials and I will not run them here.
