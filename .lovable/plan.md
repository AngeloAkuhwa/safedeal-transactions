## Next batch — Flagged Users paginated SQL RPC

With the Users Directory now on SQL-backed pagination, the next item in the queue is the Flagged Users engine (`_shared/flagged-users-engine.ts` + `admin-flagged-users`), which today still materializes the candidate set in JS and slices it in memory. This is item #6 from the audit.

### Goal
Replace JS-side filter/sort/slice with a SQL view + RPC so the endpoint returns page N without loading the full flagged population.

### Scope (this batch only)
- Flagged Users list + summary
- Keep existing response shape so `AdminFlaggedUsers.tsx` and the async export builder keep working unchanged
- Do NOT touch Escrow Overview, Audit helper, tsvector search — those are the following batches

### Deliverables

1. **DB migration**
   - `admin_flagged_users_view` (security_invoker = on) exposing per-user flag signals:
     - `user_id`, `full_name`, `email`, `role`, `created_at`
     - `identity_status`, `identity_submitted_at`
     - `open_disputes_count`, `total_disputes_count`
     - `chargebacks_count`, `refunds_count`
     - `failed_payments_count_30d`
     - `tx_count_30d`, `tx_volume_30d`
     - `last_activity_at`
     - `flag_score` (weighted sum matching current JS formula)
     - `flag_reasons` (text[]) — same tokens the UI currently renders
   - `admin_flagged_users_page(p_search, p_severity, p_reason, p_sort, p_limit, p_offset)` RPC returning rows + `total_count`
   - `admin_flagged_users_summary()` RPC returning counts by severity bucket (matches current summary cards)
   - GRANT EXECUTE to `authenticated` (function itself re-checks `has_role(admin)` via caller context on the edge side)

2. **Edge function refactor**
   - New `supabase/functions/_shared/flagged-users-sql.ts` with `getFlaggedPage()` and `getFlaggedSummary()` calling the RPCs
   - `admin-flagged-users/index.ts` switches to the new helpers; response JSON shape preserved
   - `flagged-users-engine.ts` kept only for the async export path until the next batch converts it too (avoids breaking exports mid-flight)

3. **Verification**
   - `supabase--linter` clean
   - `curl` the deployed function for page 1 + a search term + a severity filter and confirm totals + row shape
   - Load `/admin/flagged-users` in preview and confirm list, filters, pagination, and summary cards render identically

### Out of scope for this batch
- Escrow Overview SQL pagination (next batch)
- Unified `logAdminAction` helper (batch after)
- `transactions.search_tsv` (already handled in earlier batch)
- Any UI changes beyond what's required to keep the page working

Approve and I'll ship the migration + edge function refactor in build mode.