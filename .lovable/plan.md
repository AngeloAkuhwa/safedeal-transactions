# Fixes 6 & 7 — Remove admin Offers module, then verify tab & cross-link connectivity

Standing preservation rules apply: no redesigns, no changes to buyer `/dashboard/*` or seller `/seller/*` screens, reuse existing patterns, keep `App.tsx`, `BUILT_ROUTES` (`src/components/admin/useAdminNav.ts`) and `src/services/admin-route-permissions.ts` in lockstep.

---

## FIX 6 — Remove the Offers module from the internal admin

### 1. Discovery results (complete inbound reference list)

Every reference to `/admin/offers`, `/admin/offers/:offerId`, the admin pages or the admin-only service/function:

| # | Reference | Kind |
|---|---|---|
| 1 | `src/App.tsx:54` `import AdminOffers` | route wiring |
| 2 | `src/App.tsx:55` `import AdminOfferDetail` | route wiring |
| 3 | `src/App.tsx:159` `<Route path="/admin/offers" …>` | route |
| 4 | `src/App.tsx:160` `<Route path="/admin/offers/:offerId" …>` | route |
| 5 | `src/components/admin/AdminSidebar.tsx:84` `{ label: "Offers", href: "/admin/offers", icon: Tag }` | sidebar nav (added in Fix 4c) |
| 6 | `src/components/admin/useAdminNav.ts:9` `"/admin/offers"` in `BUILT_ROUTES` | route registry |
| 7 | `src/services/admin-route-permissions.ts:41` `{ path: "/admin/offers", permission: "transactions.view" }` | route guard map |
| 8 | `src/__tests__/admin-routes.smoke.test.tsx:117` `/admin/offers` case | test |
| 9 | `src/__tests__/admin-routes.smoke.test.tsx:118` `/admin/offers/:offerId` case | test |
| 10 | `src/pages/AdminOffers.tsx` (whole file) | admin page |
| 11 | `src/pages/AdminOfferDetail.tsx` (whole file) | admin page |
| 12 | `src/pages/AdminOffers.tsx:97` `Link to={/admin/offers/${o.id}}` | internal link (dies with the file) |
| 13 | `src/pages/AdminOfferDetail.tsx:30` `Link to="/admin/offers"` | internal link (dies with the file) |
| 14 | `src/services/admin-offers.service.ts` (whole file, admin-only) | service |
| 15 | `src/__tests__/helpers/adminAuth.ts:67` `"admin-offers"` in the contract-test function list | test fixture |
| 16 | `supabase/functions/admin-offers/index.ts` | edge function |

Confirmed **absent** (checked, no hits): no dashboard card, dashboard alert, notification deep link, transaction-detail link, dispute-detail link, breadcrumb, export column or edge function anywhere emits an `/admin/offers` href. Grep over `src/pages/AdminDashboard.tsx`, `src/pages/AdminNotifications.tsx`, `src/services/admin-dashboard.service.ts`, `src/components/admin/**` and `supabase/functions/**` returned zero `/admin/offers` strings besides the rows above.

### 2. Removal set (file-by-file change list)

| File | Change |
|---|---|
| `src/App.tsx` | delete the two imports (54–55) and the two `<Route>` lines (159–160) |
| `src/components/admin/AdminSidebar.tsx` | delete the "Offers" nav item (line 84); drop the `Tag` lucide import if it becomes unused |
| `src/components/admin/useAdminNav.ts` | delete `"/admin/offers"` from `BUILT_ROUTES` |
| `src/services/admin-route-permissions.ts` | delete the `/admin/offers` entry |
| `src/pages/AdminOffers.tsx` | delete file |
| `src/pages/AdminOfferDetail.tsx` | delete file |
| `src/services/admin-offers.service.ts` | delete file (admin-only; not imported by buyer/seller code) |
| `src/__tests__/admin-routes.smoke.test.tsx` | delete the two offer route cases (24 → 22 cases) |
| `src/__tests__/helpers/adminAuth.ts` | remove `"admin-offers"` from the function list |
| `supabase/functions/admin-offers/` | delete function directory + deregister via the delete-function tool |

No component lives only under an admin-offers folder — both pages are self-contained and use shared shadcn primitives only, so no component deletions.

### 3. Replacement for each inbound reference

All 16 references are either the module itself or pure navigation into it. **No admin workflow currently consumes offer context through these routes** — transaction and dispute detail already resolve offer-sourced transactions server-side (`supabase/functions/transaction-detail/index.ts:227–236` expands `source_offer_id` into offer items inline, no link out). Therefore: **plain removal for all 16**, no inline replacement section is needed and none will be added (adding one would be scope creep beyond the removal request).

If, during Fix 7's cross-link audit, any admin screen turns out to render an offer identifier that previously invited a click-through, it will be reported as a finding rather than silently re-linked.

### 4. Buyer / seller isolation

Untouched, verified by import graph:
- `src/pages/BuyerPrivateOffers.tsx`, `src/pages/SellerPrivateOffers.tsx`, `src/pages/SellerOfferDetail.tsx`, `src/pages/OfferClaimLanding.tsx`
- `src/services/buyer-offers.service.ts`, `src/services/seller-offers.service.ts`
- edge functions `buyer-offers`, `seller-offers`, `claim-offer`, `create-offer` and all offer logic in `transaction-detail`, `transaction-agreement`, `resolve-share-token`, `paystack-webhook`

`admin-offers.service.ts` is **not shared** — it is imported only by the two admin pages, so full deletion is safe. No shared service is partially edited.

### 5. DB impact

**NONE.** `buyer_specific_product_offers`, `buyer_specific_offer_items`, `offer_events`, `transactions.source_offer_id` and all RLS/grants stay exactly as-is. No migration in this fix.

Edge functions:
- `admin-offers` — **remove.** Admin-only reader with no other caller; keeping it leaves an unreferenced privileged surface.
- `buyer-offers`, `seller-offers`, `claim-offer`, `create-offer` — **leave.** Buyer/seller feature paths.
- `expire_stale_offers` RPC (called by `admin-offers`) — **leave.** Also called from the buyer/seller offer paths.

### 6. Tests & verification for Fix 6

- Smoke suite drops to 22 route cases; must stay green with zero console errors.
- `src/services/__tests__/admin-route-permissions.test.ts` re-run (asserts the map); update expectations only if it counts entries.
- `rg "admin/offers|AdminOffers|AdminOfferDetail|admin-offers" src supabase` must return **zero** hits afterwards.
- Full suite + `tsgo --noEmit` clean.

---

## FIX 7 — Tab-level and cross-link connectivity verification

Read-only verification pass plus permanent tab-switch test cases. No feature changes; any defect found is reported with a minimal proposed fix and implemented only after approval.

### 1. Enumerated tab / sub-view inventory (coverage list)

| Screen | Tabs / sub-views |
|---|---|
| `/admin/dashboard` | none (action cards only — covered by cross-link audit) |
| `/admin/transactions` | quick-filter tablist (`role="tab"`, `AdminTransactions.tsx:169–177`): All, Awaiting Payment, Funds Held, In Dispute, Overdue, Refunded, Failed, Flagged |
| `/admin/transactions/:id` | detail sections + drawers (sub-view enumeration during the pass) |
| `/admin/disputes` | queue filters + row → detail with `tab=dispute` / `tab=resolution` (`AdminDisputes.tsx:302`) |
| `/admin/disputes/:id` | shadcn `Tabs` in `AdminDisputeDetail.tsx` (dispute / resolution / evidence set — enumerated at execution) |
| `/admin/payouts` | `VALID_TABS` (`AdminPayouts.tsx:24`): all, pending_release, blocked, processing, completed, failed, reversed, on_hold (URL `?tab=`) |
| `/admin/escrow` | single view + filter query (`EscrowQuery`); no tabs |
| `/admin/reconciliation` | Remediation, Escrow drift, Pricing coverage (`AdminReconciliation.tsx:122–126`) |
| `/admin/agent-performance` | Workload, Performance, SLA Compliance, Rankings (`AgentPerformanceTabs.tsx:6–9`) + `AgentDetailsDrawer` 6-tab interface |
| `/admin/task-orchestration` | assignment / escalation drawers, `TaskDetailsDrawer`, `AgentDetailsDrawer`, `TestConfigurationDialog` tabs |
| `/admin/permission-matrix` | `TAB_DEFS` (`PermissionWorkspaceTabs.tsx:13–19`): Role Matrix, Role Detail, Feature Registry, User Overrides, Permission Templates, Pending Approvals, Change History (URL `?tab=`) + Environment switcher |
| `/admin/access-control` | directory views + `AddUserDrawer`, `UserDetailsDrawer` tabs |
| `/admin/access-approvals` | Pending, Approved, Rejected, Cancelled (`AdminAccessApprovals.tsx:29–34`) |
| `/admin/users` | directory; `/admin/users/:id/profile` investigation hub sections |
| `/admin/flagged-users` | filter views |
| `/admin/notifications` | filter-driven views: Recent / Failed-only, channel, status, type (`AdminNotifications.tsx:720`) + broadcast composer |
| `/admin/audit-logs` | filter-as-view set (actor / module / date range) + JSON drawer |
| `/admin/settings` | settings section navigation (platform vs vendor scope) |
| `/admin/support` | single view |

### 2. Per-tab render + data-target verification

For each tab above:
- **Static**: resolve the query it fires (`queryKey`/`queryFn` → service → RPC / edge function / table) and confirm that RPC, function directory or table actually exists (`supabase/functions/*`, migrations, `src/integrations/supabase/types.ts`).
- **Dynamic**: extend `src/__tests__/admin-routes.smoke.test.tsx` with a tab-switch block — mount the screen, click each tab trigger by accessible role/name, assert no console error/warning and that the tab panel renders. URL-driven tabs (`?tab=`, payouts, permission matrix) are mounted directly at each tab URL, which is cheaper than click-driving.
- Anything not exercisable in jsdom (drawers requiring live data, realtime channels, file exports, focus traps) goes on an explicit **NEEDS MANUAL CHECK** list — never silently skipped.

### 3. Cross-link audit

Static extraction of every `Link to=`, `navigate(`, `href=` inside `src/pages/Admin*` and `src/components/admin/**`, including template-literal hrefs, then for each:
- template resolves to a path present in `BUILT_ROUTES` / `App.tsx`;
- required params are non-null at emit time (report any link that can emit `/admin/x/undefined`);
- query params used as tab/filter values are in that screen's valid set (e.g. `?tab=failed` ∈ payouts `VALID_TABS`).

Explicit targets: drawer "View transaction", escrow record → payout/dispute/audit, dispute detail → payment/escrow/payout/user, audit-log target links, notification deep links, dashboard action cards, permission-matrix deep links into access-control and audit-logs.

### 4. Deliverable

Structured report in the established format — **PASSED / FAILED (+ minimal fix) / NEEDS MANUAL CHECK** — plus the raw enumerated tab table with each tab's resolved data target, and the tab-switch cases committed permanently in the smoke suite.

---

## Scalability note

Fix 6 only removes surface: 2 routes, 2 pages, 1 service, 1 edge function, −2 smoke cases. Fix 7 adds roughly 30–40 tab assertions. To keep the suite fast, URL-driven tabs are mounted directly (no re-render storms) and each screen mounts once per tab group with mocked network. Current suite ≈141 tests; expected after Fix 7: ≈175–185 tests, runtime target **under 3 minutes** total (currently ~2 min). If a screen's tab block exceeds ~10s it is moved to NEEDS MANUAL CHECK instead of slowing the suite.

## Risks

- **Sidebar import cleanup**: removing the Offers entry may orphan the `Tag` icon import — typecheck catches it.
- **Contract-test fixture**: `adminAuth.ts` counts functions; removing `admin-offers` must be reflected or the count assertion fails.
- **Edge function deletion is irreversible** for the deployed instance; the source is removed from the repo too. Table data is untouched, so a future re-introduction is a UI rebuild only.
- **Tab tests and flakiness**: click-driven tabs can be timing-sensitive in jsdom; mitigated by `findBy*` queries and by preferring URL-mounted tabs.
- **False negatives in static link extraction**: dynamically composed hrefs may escape the regex; mitigated by manually reviewing every template-literal href found in admin files.
