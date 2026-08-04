# Fix 5 of 5 — Internal Admin UAT / Regression Pass (verify-only)

A read-only verification pass over the internal admin surface. No production
data is written, no source file is changed, no route is renamed. The only files
created are throwaway verification scripts and temporary test files, all removed
at the end of the pass (or kept only if you ask for them to be permanent).

Deliverable: one structured findings report grouped **PASSED / FAILED (with
minimal proposed fix) / NEEDS MANUAL CHECK**, plus the raw numbers behind every
data-truth check. Fixes for anything that fails are proposed only — implemented
after separate approval.

## Execution order and estimated time

Total: roughly 25–40 minutes of tool time, run in this order so cheap static
checks fail fast before the expensive ones.

### Stage 1 — Static route & permission integrity (~5 min)

A temporary Node script parses the router and the nav/permission sources and
cross-checks them as sets:

- Every `path` in the admin block of `src/App.tsx` — plus `/legal/privacy`,
  `/legal/terms`, `/admin/support` — is collected as the router truth set.
- `BUILT_ROUTES` (useAdminNav.ts) vs router: report both directions
  (declared-but-not-routed, routed-but-not-declared).
- Every entry in `admin-route-permissions.ts` maps to a real router path
  (after stripping `:params`).
- Every sidebar item href (AdminSidebar buildGroups), every AdminFooter link,
  and every dashboard `action_href` in `supabase/functions/admin-dashboard/index.ts`
  resolves to a built route once query/hash is stripped.
- Every permission key referenced by a route guard exists in
  `permission-catalog.ts`.

### Stage 2 — Route render smoke test (~8 min)

A temporary vitest file mounts each admin route component behind mocked
`supabase` client, mocked `AdminPermissionsContext` (super admin), and a
MemoryRouter. Assertion per route: renders without throwing, and the render
produces no `console.error` / `console.warn`. Console output is captured with a
spy so React key warnings, uncontrolled-input warnings, and `act()` warnings are
recorded per route rather than lost in the noise. Any route that cannot be
mounted in jsdom (heavy chart/virtualised screens) is reported as
NEEDS MANUAL CHECK rather than silently skipped.

### Stage 3 — Permission consistency matrix (~6 min)

For each internal role in `INTERNAL_ROLES`, compute effective permissions from
the DB (`internal_effective_permissions` read via SQL for a synthetic role set,
plus `role_permissions` rows) and assert three views agree:

1. Sidebar visibility — which items `AdminSidebar` would show for that permission set.
2. Route guard — what `permissionForPath` + `PermissionRoute` would allow.
3. Server gate — the `requirePermission` key each corresponding edge function uses
   (extracted by grep over `supabase/functions/**`).

Any route visible in the sidebar but blocked by the guard, or allowed by the
guard but gated on a different key server-side, is a FAILED finding.
Suspended-user case: verify by SQL + code read that `admin-me` and the shared
auth helper reject non-`active` internal users, and that the client context
treats that as no permissions.

### Stage 4 — Data-truth checks, SQL only (~5 min)

Each dashboard number is re-derived with the exact query its destination page
uses, and the pair is reported side by side:

| Dashboard card | Compared against |
|---|---|
| disputes_needing_decision | Disputes page list query |
| failed_payouts | Payouts "failed" tab query |
| webhook_recon_issues | Escrow reconciliation mismatch query (expected 0) |
| awaiting_release | Escrow `pending_release` state query |
| stuck_transactions | Transactions `quick=overdue` query |
| identity_reviews_pending | `identity_submissions` pending query |

Plus: notification summary counts vs visible delivery states; count of
unresolved drift alerts (expected 0); latest `escrow_reconciliation_results`
run is all-ok.

### Stage 5 — Regression on Fixes 1–4 (~5 min)

- Dedupe idempotency: record `notifications` row count, trigger
  `reconcile-escrow`, re-count — expect no new rows, only `occurrence_count` /
  `last_seen_at` movement.
- Remediation idempotency: re-invoke the remediation path for the three
  remediated transactions — expect `already_applied`, no new ledger entries.
- Footer links, sidebar Offers + Reconciliation, six action-card hrefs: covered
  by Stage 1's set checks.
- `admin-me` returns `full_name`: verified against the deployed function
  response shape.

### Stage 6 — Runtime health (~4 min)

- `tsgo --noEmit` typecheck.
- Full `vitest run` including the Stage 2 temporary smoke tests.
- Console warning inventory from Stage 2, grouped by warning type and route.
- Network inventory: from the mount tests, list every distinct edge function /
  table the mount triggers, and flag any target that does not exist in
  `supabase/functions/` or the schema.

### Stage 7 — Scalability spot-checks, read-only (~5 min)

`EXPLAIN (ANALYZE, BUFFERS)` on: `admin_escrow_kpis`, the notifications list
query, the escrow reconciliation query, and `admin_users_directory_page` with
filters applied. Report any sequential scan on `transactions`, `notifications`,
`escrow_ledger_entries`, or `audit_logs`, with a recommended index per finding
(finding only, no migration). Also measure `escrow_reconciliation_results` row
growth per run and per day; if unbounded, that is a finding with a proposed
retention or upsert-per-transaction approach.

### Stage 8 — Limits and manual checklist (~2 min)

Everything that genuinely needs a signed-in browser is listed as a short
click-through checklist rather than claimed as verified. Expected items:

- Sidebar footer identity (real name, initials, role label) desktop + mobile.
- Sidebar collapsed/expanded and mobile drawer layout, no shift on load.
- Offers and Reconciliation items visible and navigating correctly.
- Drawer focus trap and Escape behaviour on the heavier admin screens.
- Dashboard action cards navigating to correctly pre-filtered destinations.

## Technical notes

- All DB work is `SELECT` / `EXPLAIN` through the read-only query tool; the only
  write-adjacent actions are the two idempotency re-runs in Stage 5, which are
  by design no-ops and are asserted as such before and after.
- Temporary artefacts live under `/tmp/uat/` except the Stage 2 vitest file,
  which must live under `src/` for the existing vitest `include` globs; it is
  deleted at the end of the pass unless you want it kept as a permanent
  route smoke suite.
- Contract tests that require live admin/buyer credentials
  (`admin-auth.contract.test.ts`, 105 cases) stay skipped unless
  `VITE_TEST_ADMIN_*` / `VITE_TEST_BUYER_*` are present. If you want that layer
  covered in this pass, add those secrets and I will include it.

## Risks

- Stage 2 mount tests may surface pre-existing console warnings unrelated to
  Fixes 1–4. They will be reported as findings, not fixed in this pass.
- Some admin screens may not mount cleanly in jsdom; those degrade to
  NEEDS MANUAL CHECK instead of being reported as failures.
- Stage 5 triggers a real reconciliation run. It is idempotent by design, and
  the before/after counts prove that, but it does execute against live data.