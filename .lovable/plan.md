## Problem

The admin sidebar's "Notifications" item shows a "Coming soon" toast even though the route `/admin/notifications` is registered in `src/App.tsx` and the `AdminNotifications` page is built.

Root cause: `src/components/admin/useAdminNav.ts` maintains an allowlist (`BUILT_ROUTES`) of admin routes that are considered implemented. Any sidebar click whose `href` isn't in that set falls through to a "Coming soon" toast and never navigates. `/admin/notifications` was never added to that allowlist when the Notification Center page was built.

## Fix

Single-line change in `src/components/admin/useAdminNav.ts`:

- Add `"/admin/notifications"` to the `BUILT_ROUTES` set.

That's it — the sidebar entry already points to `/admin/notifications`, and the route + page already exist, so allowlisting it makes the click navigate to the Notification Center instead of showing the toast.

## Verify

- Click Notifications in the admin sidebar → lands on `/admin/notifications` with the Notification Center rendered, no "Coming soon" toast.
- Other roadmap items (e.g., Audit Logs, Platform Settings) still show "Coming soon" as before.
