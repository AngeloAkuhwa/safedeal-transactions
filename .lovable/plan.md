# Admin section — remaining gaps

The admin section is structurally sound: all 22 admin pages are routed behind `ProtectedRoute(admin)` → `PermissionRoute`, every admin service enforces auth, all 44 `admin-*` edge functions have CORS plus an auth/permission gate, no admin page queries the database directly, and no orphaned or missing edge functions were found.

What is left are unfinished features and a few governance risks.

## A. Unbuilt / stubbed screens

1. **Agent Performance** (`/admin/agent-performance`) is a "Coming soon" panel only — no scorecards, SLA hit-rate or throughput, even though orchestration already tracks per-agent capacity and task history.
2. **13 sidebar concepts have no page at all** and are filtered out of the nav: Analytics, Reports, Identity Review, Investigation, Payments, Money Tracing, Refunds, Impersonation, Fraud Detection, Compliance, Support Center, Debug Tools, Exports Center. Several already have backend support (identity submissions, refunds, exports), so they are the cheapest to build next.

## B. Non-functional buttons inside built screens

3. **Users table** — "Start Impersonation" and per-user "Generate Export" both fire a "coming soon" toast, despite `admin-user-detail-export` already existing.
4. **Escrow records table** — "Investigate" and "Add Internal Note" are permanently disabled, although `admin_investigations` and `admin_transaction_notes` tables exist.
5. **Dispute detail sidebar** — "Open Investigation", "View Payment Record", "View Escrow Record", "View Payout Record" are disabled; those records exist and are reachable elsewhere in the admin app.
6. **Admin transactions mobile nav** — the "Profile" bottom-nav item is a "coming soon" toast.

## C. Governance and correctness risks

7. **Permission map drift**: route permissions (`src/services/admin-route-permissions.ts`), the client catalog (`permission-catalog.ts`), the DB `role_permissions` seed, and each edge function's `requirePermission` call are kept in sync by hand, with no test asserting they agree. A role can gain UI access without server access, or the reverse.
8. **`admin-export-worker` trust boundary** relies on a service-role bearer token; the enqueue path has not been verified to never forward an end-user token into it.
9. **`admin-me` and `admin-log-access-action`** only check `requireAdmin` (any internal user), not a fine-grained permission. Defensible for self-service endpoints, but worth an explicit decision.
10. **No automated coverage** of admin routes/permissions — everything above is verified by code reading only.

## Suggested order

1. Close the dead buttons (items 3–6): all have backing tables/functions, so this is wiring, not new architecture.
2. Add a permission-parity check (item 7) that diffs the three client-side sources against the DB seed.
3. Build Agent Performance on top of existing orchestration data (item 1).
4. Then pick from the unbuilt nav concepts (item 2) in priority order: Identity Review, Refunds, Exports Center.