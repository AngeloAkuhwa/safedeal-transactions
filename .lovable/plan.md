## Next action: Escrow Overview SQL pagination (Item #6, Batch C)

### Why this is next
- Users Directory ✅ SQL-backed via `admin_users_directory_page` RPC
- Flagged Users ✅ SQL-backed via `admin_flagged_users_mv` + RPCs
- **Escrow Overview** ❌ still builds full candidate array in JS, then `.slice()` — last remaining OOM risk in the P1 list-pagination batch

After this, the P1 scalability workstream is complete except for tsvector search (#7, already partially in place for flagged users) and async exports (#8, already shipped for Users/Flagged/Transactions).

### Scope
Refactor `supabase/functions/admin-escrow-overview/index.ts` to be SQL-first, mirroring the pattern used for flagged users.

### Deliverables

**1. Database migration**
- Create view `admin_escrow_overview_view` combining `transactions` + `escrow_states` + `payments` + `disputes` with pre-computed:
  - `escrow_status` (funded / released / refunded / held / disputed)
  - `held_amount`, `released_amount`, `refunded_amount`
  - `days_in_escrow`, `auto_release_at`
  - `search_haystack` (tsvector: tx code, buyer/seller name+email)
- Create RPC `admin_escrow_overview_page(p_status, p_search, p_sort, p_from, p_to)` — returns paginated rows + `total_count`
- Create RPC `admin_escrow_overview_summary(p_status, p_search)` — returns KPI aggregates (total held, total released, avg days in escrow, at-risk count) computed in SQL, not JS
- Add GIN index on `search_haystack`, btree indexes on filter/sort columns
- Grant `service_role` execute; enforce admin check inside RPC via `has_role(auth.uid(), 'admin')` with service-role bypass

**2. Edge function refactor**
- New shared helper `supabase/functions/_shared/escrow-overview-sql.ts` with `getEscrowPage()` and `getEscrowSummary()`
- Rewrite `admin-escrow-overview/index.ts` to call the helpers — remove the in-memory `candidate` array and `.slice()`
- Preserve the exact response JSON shape so `AdminEscrow.tsx` and the existing async export worker keep working unchanged

**3. Verification**
- `curl` the endpoint with several filter/sort/search combinations, confirm 200s and correct totals
- Load `/admin/escrow` in the preview, verify list, KPIs, filters, and pagination all render
- Confirm the async CSV export still works (it reads from the same source)

### Out of scope for this batch
- UI changes to `AdminEscrow.tsx` (response shape unchanged)
- Async export refactor (already done)
- Remaining P1 items — tsvector on `transactions` (#7 for transactions monitor) and the unified `logAdminAction` helper (#10) come in the next batches per the "Next actions" order.
