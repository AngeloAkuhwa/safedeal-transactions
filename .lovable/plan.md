# Fix: "Flagged" quick filter returns no rows

## Root cause

The Flags column in the UI surfaces many signals: `frozen`, `overdue`, `payment_failed`, `payout_failed`, `escalated` (active dispute), `risk_flagged`, `admin_frozen`, `high_risk`, `fraud_watch`.

But in `supabase/functions/admin-transactions-monitor/index.ts` the **"flagged" quick filter** is much narrower — it only matches:

- `transactions.needs_release_review = true`, OR
- transactions referenced by `admin_actions` of type `freeze_funds` / `escalate_case`, OR
- recent `audit_logs` whose `action` contains `risk|fraud|suspicious|flag`.

In current data none of those conditions are satisfied, so the query returns 0 rows even though the UI shows orange/red pills like "Frozen", "Overdue", "Payment Failed", "In Dispute" on many rows. That mismatch is the bug.

There is also a secondary bug at line 189:
```ts
q = q.or(`needs_release_review.eq.true,id.in.(${ids})`);
```
The commas inside `id.in.(uuid,uuid,...)` collide with the comma that separates OR clauses in PostgREST — the filter has to be wrapped so the parser doesn't split it.

## Fix (edge function only)

**File: `supabase/functions/admin-transactions-monitor/index.ts`**

1. **Broaden the `flagged` quick filter** so it matches every signal the Flags column can render:
   - `needs_release_review = true`
   - `money_status = 'funds_frozen'`
   - `dispute_status` in active dispute statuses
   - any tx id present in `admin_actions` with `action_type` in `('freeze_funds','escalate_case','flag_for_review')`
   - any tx id with a recent (<=30 days) `audit_logs.action` matching `risk|fraud|suspicious|flag`
   - any tx id with a `payments.status = 'failed'` row
   - any tx id with a `payouts.status = 'failed'` row
   - any tx id that is currently overdue (`status='awaiting_payment'` and `created_at < now()-24h`)

2. **Implementation pattern**: in `buildPayload`, when `params.quickFilter === 'flagged'`, run the existing pre-compute block plus extra lookups (`payments.failed`, `payouts.failed`) and build a single `flaggedTxIds: Set<string>`. Then in `buildBaseQuery` switch case `flagged`, restrict by that set:
   ```ts
   case "flagged": {
     const ids = Array.from(flaggedTxIds);
     // Two paths so we still cover money_status=funds_frozen, active disputes, and overdue
     // even if those rows weren't pre-collected.
     const orParts = [
       "needs_release_review.eq.true",
       "money_status.eq.funds_frozen",
       `dispute_status.in.(${ACTIVE_DISPUTE_STATUSES.join(",")})`,
     ];
     if (ids.length) orParts.push(`id.in.(${ids.join(",")})`);
     q = q.or(orParts.join(","));
     break;
   }
   ```
   PostgREST tolerates commas inside `in.(...)` within `.or()` because the parens balance; the existing single-`or` form is the right shape, just expanded.

3. **Keep the summary `flaggedCount` consistent**: extend the existing `flaggedSet` block (lines ~602–624) to also add tx ids from `payments.failed`, `payouts.failed`, `money_status=funds_frozen`, active dispute, and overdue awaiting_payment, so the "Flagged" tile and the "Flagged" filter agree on the same population.

4. No UI changes required — the chip already calls `quickFilter=flagged`; once the backend honors the broader definition, results will appear.

## Acceptance

- Clicking the **Flagged** chip on `/admin/transactions` returns every row that displays any non-neutral pill in the Flags column (Frozen, Overdue, Payment Failed, Payout Failed, In Dispute, High Risk, Fraud Watch, Risk Flagged, Admin Frozen, Needs Review).
- The "Flagged" KPI card count equals the number of rows returned by the Flagged filter (when no other filters are active).
- All other quick filters (Awaiting Payment, Funds Held, In Dispute, Overdue, Refunded, Failed, Frozen) continue to behave as today.
