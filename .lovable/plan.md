
# Admin section — scale, security & cleanup audit

Scope: only the admin surface (`/admin/*` routes, `src/pages/Admin*`, `src/components/admin/`, `supabase/functions/admin-*` + `provision-admin`). Findings are grouped by severity. Nothing below is a UI redesign — every item is a real bug, scalability limit, security hole, or verified-unsafe hardcoding.

---

## P0 — Critical security issues (fix immediately)

### 1. `provision-admin` is a permanent admin backdoor
`supabase/functions/provision-admin/index.ts` ships with:
- Hardcoded gate token `"safedeal-provision-2026-admin-bootstrap"` (constant in source)
- Hardcoded default admin credentials `admin@safedeal.test` / `SafeDealAdmin#2026`
- No JWT check, no rate limit, no IP allowlist

Anyone who reads the deployed function URL + token (both are in source that ships to production) can mint or reset the platform admin. This is the single most serious hole.

**Fix:** delete the function entirely (bootstrap is done). If a bootstrap path must remain, replace token with a Cloud secret `PROVISION_TOKEN`, remove the hardcoded email/password (require them in the POST body), and add a one-shot flag in `system_settings` that disables the endpoint after first successful use.

### 2. Hardcoded Paystack test email in payment initiation
`supabase/functions/initiate-paystack-payment/index.ts:126` — `// Hardcoded test email for Paystack during development`. In prod this will either leak the test address to Paystack or misroute receipts. Remove and always use the authenticated user's real email.

### 3. Admin actions have no 2FA enforcement
`security.two_factor_admin` is exposed via `security-config` but no admin function consumes it. `requireAdmin()` only checks the `admin` role. For a billion-scale platform any admin session compromise = catastrophic. Add an AAL2 check in `_shared/auth.ts::requireAdmin()`: read the `aal` claim from the access token, and when `two_factor_admin=true` reject anything below `aal2`. Expose an "Enroll 2FA" flow in the admin header.

### 4. No rate-limits on high-risk admin endpoints
`admin-reveal-user-field`, `admin-user-detail-export`, `admin-users-directory-export`, `admin-flagged-users-export`, `admin-escrow-export`, `admin-export-transaction-data` — all can be looped to exfiltrate the whole user/tx database. Add a per-admin sliding-window limiter (Postgres table `admin_rate_limits(admin_id, key, window_start, count)` + `check_and_increment_rate_limit()` RPC) with sane caps: reveals ≤ 20/hr, exports ≤ 10/hr.

---

## P1 — Scalability collapse points (will break at ~100k+ rows)

### 5. `admin-dashboard` / `admin-dashboard-trend` scan up to 50k rows into JS
`admin-dashboard/index.ts` uses `.limit(10000)`, `.limit(20000)`, and `admin-dashboard-trend` uses `.limit(50000)` on `transactions`, `disputes`, `payments`, then aggregates in the function. At 1M+ rows this either truncates the answer (silent data loss on the dashboard) or OOMs the function.

**Fix:** move every aggregate to SQL — create materialized views / SQL views (`v_admin_kpis_24h`, `v_admin_trend_daily`, `v_admin_kpis_7d`, `v_admin_kpis_30d`) refreshed by a 1-minute cron, and have the edge function do `select * from v_...` only. Never fetch raw rows to count them.

### 6. `admin-escrow-overview` slices in JavaScript
`admin-escrow-overview/index.ts:373` — builds `candidate` array then `.slice((page-1)*pageSize, page*pageSize)`. Same for the flagged-users engine (`_shared/flagged-users-engine.ts`) and users-directory engine. Pagination that materializes the full set before slicing does not scale.

**Fix:** push filtering, sorting, and `range(from, to)` into SQL. Compute `total` via `select count(*) exact` in the same request. Precompute per-user aggregates (last_activity, tx_count, flag_score) as columns / mv rather than in JS on every request.

### 7. `admin-transactions-monitor` search is capped `ilike` scans merged in JS
Lines 290–345: 4 separate `ilike ... limit(1000/2000)` queries then intersected in JS. Past the caps the search silently drops matches. This is both incorrect and slow.

**Fix:** add a Postgres `tsvector` column on `transactions` (code + item titles + participant names + emails) with a GIN index, and search with `websearch_to_tsquery` in one query.

### 8. Exports are unbounded and synchronous
`admin-*-export` functions build a CSV in-memory and return it in one response. At scale this OOMs the function and blocks the admin for minutes. 

**Fix:** convert to async jobs: insert into `background_jobs`, worker writes to Supabase Storage, admin gets a signed URL when ready. Keep the current synchronous path only when the result set is < 1000 rows.

### 9. `admin-notifications` broadcast has no delivery throttling / batching
Broadcasting to millions of users will overwhelm the delivery worker and Resend. Chunk into batches of e.g. 500 with a queue table + cron, respect a platform rate limit setting (`notifications.email_batch_size`, `notifications.email_batches_per_minute`).

---

## P2 — Correctness / data integrity gaps

### 10. Audit-log coverage is inconsistent
`admin-vendor-status` writes `admin_actions` (good). But: `admin-notifications-action` (retry) writes `audit_logs` only; `admin-notifications` (broadcast create) writes neither; `admin-escrow-alert-settings` writes `admin_actions` only; `admin-transaction-actions` writes both. Result: audit trail is patchy and unqueryable by a single filter.

**Fix:** create `_shared/audit.ts::logAdminAction({actor, action, target_type, target_id, before, after, reason, ip, user_agent})` that always writes one row to `admin_actions` (canonical) with a JSONB `diff` column, and mirror to `audit_logs` only for security events. Refactor every admin mutation function to call it.

### 11. `AdminSettings` save — audit rows never include `before/after` diff
Verified in `admin-system-settings`. Without a diff, "who changed X from Y to Z" is unanswerable. Add before/after JSONB to the audit row and render the diff in the Audit History tab.

### 12. Realtime admin channels have no row-level scoping
`useRealtimeAdminNotifications` subscribes to whole tables. At 1M events/day the browser will drown. Use Postgres broadcast channels filtered by `severity in ('high','critical')` for the admin view, and require an explicit "load older" for the rest.

### 13. Impersonation server-side gate present but no session TTL / audit
Verify: impersonation must (a) require compliance role, (b) auto-expire in ≤ 15 min, (c) write both start and end events to `admin_actions`, (d) show a persistent banner in the impersonated UI. Confirm all four; add the missing ones.

---

## P3 — Hardcoding and design-token debt

### 14. ~477 hardcoded `slate-*/emerald-*/text-white/bg-slate-900` classes across admin pages
Bypasses the semantic-token system, breaks dark/light theming, and makes brand changes a multi-day task. Not a runtime bug but flagged because it will bite in the next redesign. Migrate to `bg-card / text-foreground / border-border / text-primary / bg-muted` etc. as a follow-up sweep (out of scope for this fix pass — call it out and defer).

### 15. Stale `TODO`s
- `AdminDisputeDetail.tsx:402` — "TODO: replace with a dedicated dispute state transition endpoint". Currently mutating disputes directly from the client bypasses server validation and audit. Move behind an `admin-dispute-transition` edge function.
- `admin-dashboard/index.ts:373` — TODO for extended reconciliation rules. Track or delete.

### 16. Client-side role assumption in `useAdminNav.ts`
Menu items are gated by client-side flags. Verify no admin edge function trusts the sidebar's "role" hint — every function must re-derive role from the JWT via `has_role`. (Spot check indicates it does; add an integration test to lock it in.)

---

## What's already fine (verified this pass)

- Every `admin-*` edge function calls `requireAdmin` or an equivalent `has_role` check.
- Routes are wrapped in `<ProtectedRoute requireRole="admin" />` at `src/App.tsx:131`.
- `user_roles` is a separate table with `has_role()` security-definer function (per project rules).
- Admin-notifications retry, vendor-status, and reveal-user-field write proper audit rows.

---

## Suggested execution order

1. **Same-day:** #1 (delete provision-admin), #2 (remove test email), #4 (rate-limit reveal/export).
2. **This sprint:** #3 (2FA on admin), #5 + #6 (SQL views for dashboard + escrow), #7 (tsvector search), #10 (unified audit helper).
3. **Next sprint:** #8 (async exports), #9 (broadcast batching), #11 (diff audits), #12 (scoped realtime), #13 (impersonation TTL), #15 (dispute endpoint).
4. **Backlog:** #14 (design-token sweep), #16 (integration tests).

## Out of scope

- Any AdminSettings UI redesign.
- Non-admin surfaces (buyer/seller/marketplace) — separate audit if needed.
- `fees.refund_policy` semantics (already flagged as needing a product decision).

Approve to proceed with P0 + P1 in build mode, or tell me to trim/expand the scope.
