## Fix: Audit Logs tab still shows "Coming soon"

**Root cause:** `src/components/admin/useAdminNav.ts` maintains a hardcoded `BUILT_ROUTES` set that gates navigation. `/admin/audit-logs` isn't in it, so the sidebar renders the tooltip and `go()` shows the toast instead of navigating — even though the route and page now exist.

**Change (one line):**
Add `"/admin/audit-logs"` to the `BUILT_ROUTES` set in `src/components/admin/useAdminNav.ts` (next to `/admin/settings`).

That unlocks the sidebar entry, removes the "Coming soon" tooltip/toast, and lets the existing `AuditComplianceSignal` and `RecentActivity` dashboard shortcuts navigate to the page.

No other files need to change.