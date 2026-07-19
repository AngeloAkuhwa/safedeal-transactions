## Next action item: Item #15 — Stale TODOs & dispute state transition endpoint

With Batch D (#10, #11) and Item #12 (scoped realtime) complete, and Item #13 (impersonation) deferred per your instruction until the dedicated screen is ready, the next unfinished item in the audit list is **#15 — Stale TODOs**.

### Current state (verified this turn)

- `src/pages/AdminDisputeDetail.tsx` — the earlier TODO ("replace with a dedicated dispute state transition endpoint") is already gone; the page routes through the `admin-dispute-transition` edge function created during the P0/P1 pass. Nothing left to do here beyond a spot-check.
- `supabase/functions/admin-dashboard/index.ts:309` — one TODO still ships in production: `// TODO: extend reconciliation rules — duplicate webhook ledger entries, ...`. This is the only remaining stale TODO from the audit.

### What to build

1. **Confirm dispute transitions are fully server-gated**
   - Grep `AdminDisputeDetail.tsx` and any sibling admin dispute components for direct `supabase.from('disputes').update(...)` / `.insert(...)` calls that bypass `admin-dispute-transition`.
   - If any remain, route them through the edge function so state changes always pass through the audited state machine.

2. **Resolve the `admin-dashboard` reconciliation TODO**
   - Decide: implement or delete. Recommend **implement two lightweight rules** since the surrounding block already surfaces reconciliation findings on the dashboard:
     - Duplicate webhook ledger entries: group `escrow_ledger_entries` by `(transaction_id, source_reference)` where `source = 'paystack_webhook'` and flag `count > 1`.
     - Orphan payouts: `payouts` in `completed` state with no matching `escrow_ledger_entries` debit row for the same transaction.
   - Add both as additional entries in the existing `reconciliation.findings[]` array returned by `admin-dashboard`, each shaped like the current findings (`{ code, severity, count, sample_ids }`) so the dashboard renders them without UI changes.
   - Remove the TODO comment.

3. **Sweep for any other `TODO`/`FIXME` inside `supabase/functions/admin-*` and `src/pages/Admin*` / `src/components/admin/`**
   - Anything stale gets either implemented in this pass or deleted with a one-line justification.

### After this item

Remaining audit items after #15:
- **#13 Impersonation** — deferred, waiting on the new impersonation screen.
- **#14 Design-token sweep** — P3, out of scope for this fix pass per the original audit.
- **#16 Integration tests** — P3 backlog.

So once #15 lands, the P0 + P1 + P2 scope you approved is fully closed and only the explicitly-deferred / explicitly-backlog items remain.
