## Problem

Clicking **Accept Invitation** in the email sends the invitee to `/` (the SafeDeal marketing landing page). The Supabase invite link consumes the token and drops a recovery session at the redirect target, but we never take the user through a "set your password" step, so they either bounce to the landing page or end up half-signed-in with no way to complete setup.

Root cause: in `supabase/functions/admin-invite-internal-user/index.ts`, both the new-invite and resend paths call `inviteUserByEmail(..., { redirectTo: origin })` — i.e. the site root — and no dedicated invite-acceptance route exists. Separately, the invite email is the raw Supabase default template ("no-reply@auth.lovable.cloud", plain black button), which is what the user wants polished.

## Plan

### 1. New route: `/accept-invite`

Create `src/pages/AcceptInvite.tsx` and register it in `src/App.tsx` as a public route.

Behavior:
- On mount, wait for `supabase.auth.onAuthStateChange` / `getSession()` — the invite link hash (`#access_token=...&type=invite`) is auto-consumed by `supabase-js` and produces a session.
- If no session appears within a short window, show an "Invite link expired or invalid" state with a button back to `/auth?mode=login`.
- If a session is present, show a **Set your password** card (same visual language as `ResetPassword.tsx`): SafeDeal logo header, welcome copy ("Welcome to SafeDeal — set a password to activate your team account"), read-only email chip, password + confirm fields with show/hide toggles, same Zod rules as reset (min 8, letters + digits, match).
- On submit call `supabase.auth.updateUser({ password })`. On success:
  - Look up the user's internal role via a lightweight query (`internal_user_roles` for `auth.uid()`); if any internal role is found, navigate to `/admin/dashboard`.
  - Otherwise fall back to `/role-selection` (safe default for non-internal invitees).
- Toast success / error using the existing sonner setup.

### 2. Point the invite email at the new route

In `supabase/functions/admin-invite-internal-user/index.ts`, change every `inviteUserByEmail` call (both the resend branch and the new-invite branch, including the "auth user already exists" re-send) from:

```
redirectTo: origin
```

to:

```
redirectTo: `${origin}/accept-invite`
```

No other logic changes.

### 3. Polish the invitation email (scaffold managed auth templates)

Use the managed auth email flow so we can control the invite HTML end-to-end:

1. Call `email_domain--check_email_domain_status` — if no domain is configured, surface the email-setup dialog first (`<presentation-open-email-setup>`), then continue after the user completes it.
2. Call `email_domain--scaffold_auth_email_templates` to generate `supabase/functions/_shared/email-templates/*.tsx` and the `auth-email-hook` function.
3. Restyle **all six** scaffolded templates against SafeDeal's design tokens read from `src/index.css` — sky-blue primary button, Inter font stack, matching border-radius, muted-foreground body copy, `#ffffff` email background. Keep changes light on the other five (signup/magic-link/recovery/email-change/reauthentication) — mainly brand colors, logo, and tone — since the user only asked about the invite specifically.
4. Rewrite `invite.tsx` with a polished layout:
   - Header band with SafeDeal shield logo (uploaded to a new `email-assets` Storage bucket via `supabase--storage_upload` if a logo file exists in `public/`; skip if not).
   - Headline: "You're invited to join SafeDeal".
   - Sub-copy: "{{inviter/team}} added you to the SafeDeal admin workspace. Click below to set your password and activate your account."
   - Primary CTA button "Accept invitation & set password" in sky-blue (`hsl(var(--primary))`), 12–14px radius, white text.
   - Secondary trust row: three inline chips ("Encrypted link", "Expires in 24h", "Support: help@safedeal…") using neutral text.
   - Footer: small muted-foreground line "If you weren't expecting this invitation, you can safely ignore this email." + copyright.
5. Deploy with `supabase--deploy_edge_functions({ function_names: ["auth-email-hook"] })`.
6. Tell the user the polished template activates automatically once DNS verification finishes (link them to Cloud → Emails); default Supabase invite email keeps sending until then.

### 4. Verification

- Send a fresh invite from `/admin/access-control` → confirm email now shows the branded template preview (via Cloud → Emails preview link).
- Click **Accept invitation** → lands on `/accept-invite`, sets password, is routed into `/admin/dashboard`.
- Re-open the link after use → shows the "invalid/expired" fallback state instead of the landing page.

## Files touched

- **New:** `src/pages/AcceptInvite.tsx`
- **Edit:** `src/App.tsx` (register route)
- **Edit:** `supabase/functions/admin-invite-internal-user/index.ts` (three `redirectTo` values)
- **New/Edit (via scaffold tool):** `supabase/functions/_shared/email-templates/*.tsx`, `supabase/functions/auth-email-hook/**`

No DB migrations. No changes to existing auth pages or the drawer flow.
