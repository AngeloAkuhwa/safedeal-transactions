## Goal
Lock the email worker to Resend's accepted test sender `onboarding@resend.dev` so sends don't depend on a verified domain.

## Change
Set the runtime secret `RESEND_FROM_EMAIL` to:
```
SafeDeal <onboarding@resend.dev>
```
via `set_secret`. The worker (`supabase/functions/process-notification-deliveries/index.ts`) already reads this env var and falls back to the same value, so no code change is required — setting the secret just makes it explicit and silences the "using onboarding@resend.dev" warning being ambiguous about intent.

## Important caveat (Resend rule, not ours)
`onboarding@resend.dev` will only deliver to the **email address of the Resend account owner**. Any send to a different recipient returns `403 You can only send testing emails to your own email address`, which the worker will record as a failed delivery in `notification_deliveries.provider_response`.

That means:
- Broadcasts to real users will show as **Failed** in the admin Notification Center until a verified domain is configured.
- To test end-to-end, send to the Resend account owner's address only.

## When you're ready for real delivery
Verify a domain in Resend, then update `RESEND_FROM_EMAIL` to something like `SafeDeal <notifications@yourdomain.com>` — no code change needed.

## Not touched
Worker logic, gateway wiring, cron schedule, in-app notifications, admin UI.
