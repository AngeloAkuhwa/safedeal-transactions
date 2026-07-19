## Next action: Item #7 — tsvector search for Transactions Monitor

With Items #5 (dashboard aggregates), #6a (Users Directory SQL pagination), #6b (Flagged Users MV), and #6c (Escrow Overview SQL pagination) complete, the remaining P1 scalability item is the Transactions Monitor search. Today `admin-transactions-monitor` runs 4 separate capped `ilike` queries (limit 1000/2000) and intersects them in JS — past the caps, matches are silently dropped, and CPU/memory scale linearly with row count.

### What to build

1. **Schema — `transactions.search_tsv`**
   - Add `search_tsv tsvector` column on `public.transactions`.
   - Populate from: transaction `code`, joined `transaction_items.title`, buyer & seller `full_name` + `email` (via `profiles`).
   - Maintain with a `BEFORE INSERT/UPDATE` trigger on `transactions` plus lightweight sync triggers on `transaction_items` and `profiles` (recompute the parent row's tsv).
   - Backfill existing rows in the same migration.
   - Create `GIN (search_tsv)` index.

2. **RPC — `admin_transactions_page(_search, _status, _money_status, _from, _to, _sort, _dir, _limit, _offset)`**
   - When `_search` is present, filter with `search_tsv @@ websearch_to_tsquery('simple', _search)` and rank with `ts_rank_cd`.
   - Apply status / money_status / date filters in SQL.
   - Return `{ rows jsonb, total bigint }` (single round-trip, `count(*) OVER ()`).
   - `SECURITY DEFINER`, `search_path = public`, grants to `service_role` only.

3. **Edge function — `supabase/functions/admin-transactions-monitor/index.ts`**
   - Replace the 4 `ilike` queries + JS intersect with one call to `admin_transactions_page`.
   - Extract SQL wiring into `supabase/functions/_shared/transactions-monitor-sql.ts` for consistency with the users/flagged/escrow refactors.
   - Preserve existing response shape so `AdminTransactions.tsx` needs no UI changes.

4. **Verification**
   - `curl` the function with a search term that previously exceeded the 1000-row cap; confirm the match is returned.
   - Compare KPI/list totals against the current implementation on a known dataset.
   - Confirm search latency is flat as row count grows (single indexed query).

### Out of scope for this batch
- Async export for transactions (already shipped in earlier batch).
- Any UI change to `AdminTransactions.tsx` beyond removing dead client-side filtering if present.
- Items #8–#16 (next batches in the approved plan).

### After this ships
Batch D — Audit integrity: unified `_shared/audit.ts::logAdminAction` with before/after JSONB diff (#10, #11), then Batch E security hardening (#12 scoped realtime, #3 AAL2 enforcement follow-through), with Impersonation (#13) intentionally deferred to the end as a separate feature workstream.
