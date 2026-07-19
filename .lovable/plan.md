
# Admin audit — verification results & finish plan

I re-read the code against every numbered item. Not everything is done. Below is the honest status, then the plan to close the gaps.

## Status matrix

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Delete `provision-admin` | Done | `supabase/functions/provision-admin` no longer exists |
| 2 | Hardcoded Paystack test email | Done | No matches in `initiate-paystack-payment/index.ts` |
| 3 | AAL2 enforcement for admins | Done | `_shared/auth.ts` reads `aal` claim, gates on `security.two_factor_admin` |
| 4 | Rate-limit reveal/export | Done | `enforceAdminRateLimit` wired into all 6 target functions |
| 5 | Dashboard SQL views | **Partial** | `admin-dashboard/index.ts` still has 8x `.limit(2000/5000)` scans; only trend + daily-activity migrated to RPCs |
| 6 | SQL pagination for lists | **Not done** | `users-directory-engine`, `flagged-users-engine`, `admin-escrow-overview` still materialize + JS-slice; no `.range()` calls |
| 7 | tsvector search on transactions | **Not done** | No `tsvector` / `websearch_to_tsquery` anywhere; monitor still runs 4 ilike queries merged in JS |
| 8 | Async exports | Done | Enqueue/status/worker deployed; 3 builders live; 3 UIs wired |
| 9 | Notification broadcast batching | Done | `process-notification-deliveries` reads `notifications.email_batch_size`, caps 1–500 |
| 10 | Unified `logAdminAction` | **Partial** | Helper exists; only `admin-system-settings` + `admin-dispute-transition` adopted. 8+ other mutation functions still hand-roll audit rows |
| 11 | Before/after diff on settings | Done | `beforeSnapshot` + `afterSettings` captured |
| 12 | Scoped realtime channels | **Not done** | `useRealtimeAdminNotifications` subscribes to whole table, no severity filter |
| 13 | Impersonation TTL + audit | **Deferred — separate feature** | User has a dedicated screen coming; will be handled last as its own workstream |
| 14 | Design-token sweep | Deferred (as agreed) | — |
| 15 | Dispute transition endpoint | Done | `admin-dispute-transition/index.ts` exists |
| 16 | Client role integration test | **Not done** | No test file locks in server-side role re-derivation |

Net: **7 done, 2 deferred, 5 open, 2 partial.**

## Finish plan (grouped by dependency)

### Batch A — SQL scalability (items 5, 6, 7)
1. **Dashboard aggregates.** New RPCs `admin_kpis_window(_hours)` + `admin_recent_activity(_limit)` replace every `.limit(2000/5000)` scan in `admin-dashboard/index.ts`.
2. **Users directory + flagged users pagination.** `admin_users_directory_page(_filters jsonb, _sort, _from, _to)` and `admin_flagged_users_page(...)` returning rows + `count(*) over () AS total`. Engines shrink to filter serialization + RPC call.
3. **Escrow overview pagination.** `admin_escrow_overview_page(...)` RPC on `escrow_states` + `transaction_pricing`; drop JS slicing.
4. **Transaction search tsvector.** Migration adds `transactions.search_tsv` (generated from code + participant names/emails + item titles) with a GIN index; monitor search branch switches to `websearch_to_tsquery`.

### Batch B — Audit uniformity (item 10)
Refactor these 8 functions to call `logAdminAction` with `before`/`after`/`diff`:
`admin-vendor-status`, `admin-notifications`, `admin-notifications-action`, `admin-escrow-alert-settings`, `admin-transaction-actions`, `admin-reveal-user-field`, `admin-flagged-users-action`, `admin-flagged-users-bulk`, `admin-review-identity`.

Rows land in `admin_actions` with a JSONB `diff`; only auth/impersonation events mirror to `audit_logs`.

### Batch C — Realtime scoping (item 12)
Change `useRealtimeAdminNotifications` to a filtered channel (`filter: "severity=in.(high,critical)"`) and add an explicit "Load older" button for the rest.

### Batch D — Regression lock (item 16)
Add `supabase/functions/__tests__/admin-role-derivation.test.ts` covering: missing admin role → 403; admin without `aal2` while MFA required → 403; valid admin+aal2 → 200.

### Batch E — Impersonation (item 13) — LAST, separate feature
Handled as a standalone workstream once the user's dedicated screen design is ready. Not touched in this pass. Full spec (15-min TTL, compliance-only, mandatory reason, session table, start/end audit, red banner, `pg_cron` sweeper) will be drafted separately.

## Next actions I will implement (in this order)

Once you approve, I will start work in this exact sequence — each step is a self-contained deliverable I can ship and you can verify before I move on:

1. **Add `transactions.search_tsv` migration + GIN index + refresh trigger**, then rewrite the search branch of `admin-transactions-monitor` to a single `websearch_to_tsquery` call. Verify by searching a known transaction code and a participant email in `/admin/transactions`.
2. **Create `admin_kpis_window` + `admin_recent_activity` RPCs** and rewrite `admin-dashboard/index.ts` to call them; delete the 8 `.limit(2000/5000)` scans. Verify KPI tiles + recent activity still populate on `/admin/dashboard`.
3. **Create `admin_users_directory_page` RPC** and collapse `users-directory-engine` to a single query. Verify `/admin/users` list + filters + pagination + total count.
4. **Create `admin_flagged_users_page` RPC** and collapse `flagged-users-engine`. Verify `/admin/flagged-users`.
5. **Create `admin_escrow_overview_page` RPC** and remove JS slicing in `admin-escrow-overview`. Verify `/admin/escrow`.
6. **Batch B — audit refactor**, one function per commit, starting with the highest-traffic: `admin-transaction-actions` → `admin-vendor-status` → `admin-notifications*` → `admin-flagged-users-action/bulk` → `admin-review-identity` → `admin-escrow-alert-settings` → normalize `admin-reveal-user-field`. Verify `admin_actions` rows now carry `before`/`after`/`diff` for each surface.
7. **Batch C — realtime filter** on `useRealtimeAdminNotifications`.
8. **Batch D — integration test** for role/AAL2 derivation.
9. **Batch E — impersonation** (separate feature, done last, once the dedicated screen is ready).

At each step I will report back with: what changed, the file(s) touched, and the exact click-path to verify in the preview.

## Out of scope this pass

- Item 13 (impersonation) — will be its own feature workstream, handled last.
- Item 14 (design-token sweep) — deferred per the original plan.
- Any UI restyling.
- Non-admin surfaces.
