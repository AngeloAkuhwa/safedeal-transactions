# Admin audit — completion status

Not 100%. Only P0 is fully shipped. P1, P2, and P3 are largely untouched.

## Verified against the code

### P0 — Critical security (COMPLETE)
- #1 `provision-admin` — deleted (no directory in `supabase/functions/`).
- #2 Hardcoded Paystack test email — removed (no `angeloakuhwa` / "Hardcoded test email" match in `initiate-paystack-payment/index.ts`).
- #3 AAL2 / 2FA enforcement — wired in `_shared/auth.ts` (`aal` claim decoded, `security.two_factor_admin` gate at lines 50–63).
- #4 Rate limits — `enforceAdminRateLimit` + `check_admin_rate_limit` RPC live and consumed by all six sensitive endpoints: `admin-reveal-user-field`, `admin-user-detail-export`, `admin-users-directory-export`, `admin-flagged-users-export`, `admin-escrow-export`, `admin-export-transaction-data`.

### P1 — Scalability (NOT DONE)
- #5 `admin-dashboard` still runs `.limit(10000)` / `.limit(20000)` / `.limit(50000)` and aggregates in JS. `admin-dashboard-trend` same. No `v_admin_kpis_*` / `v_admin_trend_*` views exist.
- #6 `admin-escrow-overview/index.ts:373` still does `candidate.slice((page-1)*pageSize, …)` in JS. `flagged-users-engine.ts` still builds full arrays in memory.
- #7 `admin-transactions-monitor` — no `tsvector` column, no `websearch_to_tsquery`. Still capped `ilike` scans merged in JS.
- #8 Exports — still synchronous, in-memory CSV. No `background_jobs` handoff in any `admin-*-export` function.
- #9 `admin-notifications` broadcast — no batch-size / batches-per-minute throttling settings, no chunked queue drain.

### P2 — Correctness (NOT DONE)
- #10 No `_shared/audit.ts` helper exists. Audit writes remain inconsistent across `admin-notifications`, `admin-notifications-action`, `admin-escrow-alert-settings`, `admin-transaction-actions`.
- #11 `admin-system-settings` audit rows still store the raw payload only — no `before` / `after` / `diff` JSONB, and the Audit History tab has no diff renderer.
- #12 `useRealtimeAdminNotifications` still subscribes without severity filter or "load older" gate.
- #13 Impersonation TTL / start+end audit / persistent banner — unverified this pass; treat as open until confirmed.

### P3 — Cleanup (NOT DONE)
- #14 Hardcoded `slate-*` / `emerald-*` / `text-white` sweep — untouched.
- #15 `AdminDisputeDetail.tsx:402` still mutates disputes directly; no `admin-dispute-transition` edge function. `admin-dashboard/index.ts:373` TODO still present.
- #16 No integration test locking in server-side role re-derivation.

## What "100% end to end" would require

Ship, in order:

1. **P1 sprint (largest impact):**
   - Migration creating `v_admin_kpis_24h`, `v_admin_kpis_7d`, `v_admin_kpis_30d`, `v_admin_trend_daily` (materialized, `REFRESH` on 1-min pg_cron). Rewrite `admin-dashboard` + `admin-dashboard-trend` to `select * from v_...` only — delete every `.limit(10000+)`.
   - Push escrow-overview + flagged-users pagination into SQL with `range()` + `count: 'exact'`. Precompute per-user aggregates as a nightly mv.
   - Add `transactions.search_tsv tsvector` GIN column + trigger; refactor `admin-transactions-monitor` search to one `websearch_to_tsquery` query.
   - Async exports: `background_jobs` row + worker function that streams CSV into Supabase Storage, returns signed URL. Keep sync path only for < 1000 rows.
   - Broadcast throttling: `notifications.email_batch_size` + `notifications.email_batches_per_minute` settings, chunked queue drain in `process-notification-deliveries`.

2. **P2 sprint:**
   - Create `supabase/functions/_shared/audit.ts::logAdminAction({...})` writing canonical `admin_actions` with `diff` JSONB; refactor every admin mutation to call it.
   - Extend `admin-system-settings` PUT to compute before/after per key, store on the audit row, render diff in `AdminSettings.tsx` Audit History tab.
   - Add severity filter + explicit "load older" pagination to `useRealtimeAdminNotifications`.
   - Verify impersonation flow: enforce ≤15-min TTL via server-set claim, write start + end rows to `admin_actions`, ensure persistent banner mounts in the impersonated shell.

3. **P3 backlog:**
   - Design-token sweep for admin pages (`slate-*` → `bg-card` / `text-foreground` / `border-border`).
   - Create `admin-dispute-transition` edge function, replace client mutation at `AdminDisputeDetail.tsx:402`. Resolve or delete `admin-dashboard/index.ts:373` TODO.
   - Integration test that hits an admin edge function with a non-admin JWT and asserts 403 — locks in server-side role re-derivation.

## Recommendation

Approve the **P1 sprint** as the next build batch — it removes the silent-data-loss risk in the dashboard and the OOM risk in exports, which are the two remaining items that would actually break at billion-scale. P2 + P3 follow after.
