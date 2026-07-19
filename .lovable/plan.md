# Admin audit — status: NOT 100%

Only **P0 (security-critical)** is fully done. P1 is ~20% (dashboard-trend + partial search RPC), P2/P3 are untouched.

## Verified against the code (this pass)

### ✅ P0 — Critical security (COMPLETE)
- `provision-admin` — deleted (no directory).
- Hardcoded Paystack test email — removed from `initiate-paystack-payment/index.ts`.
- AAL2 / 2FA gate — wired in `_shared/auth.ts::requireAdmin`.
- Per-admin rate limits — `enforceAdminRateLimit` + `check_admin_rate_limit` RPC live on all 6 sensitive endpoints (reveal, user-detail-export, users-directory-export, flagged-users-export, escrow-export, transaction-data-export).

### 🟡 P1 — Scalability (PARTIAL)
- `admin-dashboard-trend/index.ts` — refactored to SQL bucketing (previous `.limit(50000)` gone). ✅
- `admin-dashboard/index.ts` — **still has `.limit(10000)` (line 70) and `.limit(20000)` (line 409)**. Not migrated to KPI views. ❌
- `admin-escrow-overview/index.ts:373` — **still slices in JS** (`candidate.slice((page-1)*pageSize, …)`). ❌
- `admin-transactions-monitor` — `admin_search_transaction_ids` RPC added, but **no `tsvector` column / `websearch_to_tsquery`**; still capped `ilike` scans. ❌
- Exports — **still synchronous CSV**; no `background_jobs` handoff in any `admin-*-export`. ❌
- `admin-notifications` broadcast — **no batch-size / batches-per-minute throttling**. ❌

### ❌ P2 — Correctness (NOT DONE)
- No `_shared/audit.ts` helper — audit writes remain inconsistent across notifications, notifications-action, escrow-alert-settings, transaction-actions.
- `admin-system-settings` audit rows — no `before`/`after`/`diff` JSONB; Audit History tab has no diff renderer.
- `useRealtimeAdminNotifications` — no severity filter, no "load older" gate.
- Impersonation ≤15-min TTL + start/end audit + persistent banner — unverified this pass; treat as open.

### ❌ P3 — Cleanup (NOT DONE)
- ~477 hardcoded `slate-*/emerald-*/text-white` classes on admin pages — untouched.
- `AdminDisputeDetail.tsx:402` — TODO still present; still mutates disputes directly from client.
- `admin-dashboard/index.ts:373` — TODO still present.
- No integration test locking in server-side role re-derivation.

## Recommended next build batch — "P1 sprint (scale)"

Highest ROI remaining. Ship these together:

1. **Dashboard KPI views.** Migration creates `v_admin_kpis_24h`, `v_admin_kpis_7d`, `v_admin_kpis_30d` (mv, `REFRESH` on 1-min pg_cron). Rewrite `admin-dashboard` to `select * from v_...` only — delete both remaining `.limit(10000/20000)` scans.
2. **Escrow overview pagination in SQL.** Replace JS `candidate.slice(...)` with `.range(from, to)` + `count: 'exact'`. Precompute per-user aggregates as an mv refreshed nightly. Apply the same pattern to `flagged-users-engine` and `users-directory` engines.
3. **Transactions search via `tsvector`.** Migration adds `transactions.search_tsv tsvector` GIN column + trigger populating from code + item titles + participant names/emails. Refactor `admin-transactions-monitor` search branch to one `websearch_to_tsquery` query; retire the 4-way `ilike` merge.
4. **Async exports.** New `background_jobs` row + worker function that streams CSV to Supabase Storage and returns a signed URL. Keep the sync path only for result sets < 1000 rows. Applies to all 6 `admin-*-export` functions.
5. **Broadcast throttling.** Add `notifications.email_batch_size` + `notifications.email_batches_per_minute` platform settings; chunk the queue drain in `process-notification-deliveries`.

## P2 sprint (next)

6. `supabase/functions/_shared/audit.ts::logAdminAction({...})` writing canonical `admin_actions` with `diff` JSONB. Refactor every admin mutation function to call it.
7. Extend `admin-system-settings` PUT to compute before/after per key and store on the audit row; render diff in `AdminSettings.tsx` Audit History.
8. Severity filter + explicit "load older" pagination in `useRealtimeAdminNotifications`.
9. Impersonation: enforce ≤15-min TTL via server-set claim, write start + end rows to `admin_actions`, mount persistent banner in the impersonated shell.

## P3 backlog

10. Design-token sweep for admin pages (`slate-*` → `bg-card` / `text-foreground` / `border-border`).
11. Create `admin-dispute-transition` edge function; replace client mutation at `AdminDisputeDetail.tsx:402`. Resolve/delete `admin-dashboard/index.ts:373` TODO.
12. Integration test hitting an admin edge function with a non-admin JWT and asserting 403.

## Recommendation

Approve the **P1 sprint (items 1–5)** as the next batch — it removes the silent-data-loss risk on the dashboard, the OOM risk on exports, and the incorrect capped-search behaviour, which are the remaining items that would actually break at billion-scale. P2 + P3 follow after.
