# Fix: Resend invitation never arrives

## Root cause (confirmed from edge logs)

`admin-invite-internal-user` log shows:

```
[invite] generateLink failed, falling back: A user with this email address has already been registered
```

Flow today in `issueInviteEmail`:
1. Calls `admin.auth.admin.generateLink({ type: "invite", email })`.
2. Supabase rejects `type: "invite"` when the auth user already exists → no `action_link` returned.
3. Fallback calls `admin.auth.admin.inviteUserByEmail(...)` which **also** rejects existing users.
4. Result: `channel: "failed"`, no email sent, but the UI still shows "Invite resent" because the row update succeeds.

So every resend to a user that was already created (which is every resend, by definition) silently fails.

## Fix

Make `issueInviteEmail` generate a link that works for existing auth users, then send via Resend as today.

Change in `supabase/functions/admin-invite-internal-user/index.ts`:

1. Add a new arg `isExistingUser: boolean` (true for the resend path, and for the new-invite path when we detect the "already registered" case).
2. When `isExistingUser` is true, skip `type: "invite"` and call:
   ```ts
   admin.auth.admin.generateLink({
     type: "recovery",
     email,
     options: { redirectTo }, // /accept-invite
   })
   ```
   Recovery links work for existing users and drop them into the same `AcceptInvite` page where they set a password — same UX as an invite.
3. If `type: "invite"` fails in the new-user path with "already registered", retry once with `type: "recovery"` before giving up, so first-time invites for users left over from prior failed attempts also succeed.
4. Keep the branded Resend HTML (subject stays "You're invited to the SafeDeal admin console"; wording already reads naturally for both first-time and repeat sends).
5. On the resend path, only mark `invitation_status: "sent"` when the email actually went out — if `emailRes.channel === "failed"`, set `invitation_status: "failed"` so the UI shows the true state and the toast in `AdminAccessControl.tsx` (which already branches on `email_channel`) surfaces the failure.

## Verification

- Deploy `admin-invite-internal-user`.
- From Users & Access, click Resend Invitation on Angelo's row.
- Expect a branded SafeDeal email in the inbox, and the row menu toast to say "Invite resent".
- Check `admin-invite-internal-user` logs — no more "generateLink failed" error; a successful Resend send.

## Out of scope

- No UI changes.
- No DB migrations.
- No changes to `AcceptInvite.tsx` (recovery links already land there via `redirectTo`).
