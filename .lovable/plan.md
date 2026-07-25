## Goal

Skip the email-domain setup. Send the internal-user invite as a polished, branded HTML email via the existing **Resend** integration (`RESEND_API_KEY` + `RESEND_FROM_EMAIL` are already in secrets). If Resend fails for any reason, fall back to Supabase's default `inviteUserByEmail` so the user still gets an invite link.

## Flow in `admin-invite-internal-user`

1. Generate the invite link ourselves using the Supabase Admin API:
   - Call `supabase.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo: `${origin}/accept-invite`, data: { invited_by, invited_as_role, org_name: 'SafeDeal' } } })`.
   - This returns `action_link` without sending an email.
2. Try Resend first:
   - `POST https://api.resend.com/emails` with `Authorization: Bearer ${RESEND_API_KEY}`.
   - `from`: `RESEND_FROM_EMAIL` (fallback `SafeDeal <onboarding@resend.dev>` only if unset).
   - `to`: invitee email. `subject`: `You're invited to the SafeDeal admin console`.
   - `html`: branded template (see below). `text`: plain fallback.
   - `reply_to`: `RESEND_FROM_EMAIL`. Tag with `{ name: 'category', value: 'internal-invite' }`.
3. If Resend responds non-2xx or throws:
   - Log the status + body (no secrets).
   - Fall back to `supabase.auth.admin.inviteUserByEmail(email, { redirectTo, data })` so the built-in email still fires.
   - Include `email_channel: 'resend' | 'supabase_default' | 'failed'` in the function response so the UI can surface a subtle notice.
4. Resend path on the **resend-invite** branch works the same way (regenerate link, re-send via Resend, fallback if needed) and updates `invitation_status` + `invited_at` as today.

## Branded email template

Inline-styled HTML string built in the edge function (no new files, no React Email). Palette pulled from the app's sky-blue primary; white background; Inter/system font stack; 600px centered container; rounded 12px card; subtle border `#E2E8F0`.

Structure:
- Preheader (hidden): "Your SafeDeal admin invitation — accept to set your password."
- Header row: SafeDeal wordmark (text logo, sky-blue) + small "Admin Console" chip.
- H1: "You've been invited to SafeDeal".
- Sub: "{inviter_name or 'A SafeDeal admin'} invited you to join the **{role_label}** team on the SafeDeal admin console."
- Primary CTA button: "Accept invitation & set password" → `action_link`. Sky-blue bg, white text, 12px radius, 44px height.
- Trust chips row (inline table): 🔒 Secure link · ⏱ Expires in 24h · 🛡 SafeDeal Trust Layer.
- Fallback link block: "Button not working? Paste this URL: {action_link}" in a monospaced, wrapped `<code>` block.
- Divider + footer: "You're receiving this because your email was added to the SafeDeal admin console. If this wasn't expected, you can ignore this email." + copyright line.

Escape all interpolated values (email, inviter name, role label) to prevent HTML injection.

## Response + UI

- Extend the function response with `email_channel` and `email_error` (string, only when fallback happened).
- `AddUserDrawer` toast: on success, show "Invite sent via email." When `email_channel === 'supabase_default'`, append "(using default provider)". When `'failed'`, show a warning toast and keep the row in `pending` with the "Resend" action.

## Not doing

- Not calling `email_domain--*` tools or scaffolding auth email templates.
- Not touching the other five auth email templates.
- Not changing `AcceptInvite.tsx` or the redirect target.

## Technical notes

- Read `RESEND_API_KEY` and `RESEND_FROM_EMAIL` via `Deno.env.get`. If `RESEND_API_KEY` is missing, skip straight to the Supabase fallback (don't error).
- `generateLink` requires the service-role client we already use in this function.
- Keep the existing "auth user already exists → look up and reuse id" and `generate_employee_id` logic intact.
- Deploy `admin-invite-internal-user` after the edit.
