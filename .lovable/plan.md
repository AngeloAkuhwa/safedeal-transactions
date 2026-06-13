## Two separate bugs, both blocking this payout

I checked the live data for `SD-2026-000024`:

| Field | Value |
|---|---|
| `money_status` | `funds_pending_release` ✓ |
| `dispute_status` | `none` (no dispute exists) |
| `needs_release_review` | `false` |
| `release_review_queue` | 1 row, `queue_type='ready_for_release'`, `status='pending'` |

So nothing in the database actually requires admin action. The two UI elements are wrong for different reasons.

### Bug 1 — drawer still shows "Release review cleared — ACTION NEEDED"

The previous fix patched `supabase/functions/_shared/payout-eligibility.ts`, but the drawer (the right-hand panel) is powered by a **different** edge function — `supabase/functions/admin-payouts-detail/index.ts` — which has its own copy of the queue check at line 88:

```ts
const openQueue = (queue ?? []).find((q: any) =>
  ["pending","claimed","processing"].includes(q.status)
);
```

This catches the `ready_for_release` row and turns the drawer gate red. Fix: filter that queue_type out here too.

### Bug 2 — checkbox is disabled and "1 active dispute" footer is wrong

The row checkbox uses a **client-side** eligibility check in `src/components/admin/payouts/PayoutsTable.tsx` (line 51):

```ts
if (r.transaction.dispute_status && r.transaction.dispute_status !== "resolved")
  return { ok: false, reason: "Active dispute" };
```

The database stores `dispute_status = 'none'` for transactions that never had a dispute (it's the default literal, not `NULL`). The check above treats `"none"` as an active dispute, so:

- The select checkbox is disabled with tooltip "Active dispute"
- The "Release Payout" button in the drawer footer is disabled with the same reason
- The "1 active dispute" subtitle in Payout Records is the same false positive being aggregated

Fix: also accept `none`/`null` as not-disputed.

## The fix (two files, surgical)

**1. `supabase/functions/admin-payouts-detail/index.ts` (line 88)**

Replace:
```ts
const openQueue = (queue ?? []).find((q: any) =>
  ["pending","claimed","processing"].includes(q.status)
);
```
with:
```ts
const openQueue = (queue ?? []).find((q: any) =>
  ["pending","claimed","processing","awaiting_info","held"].includes(q.status)
  && q.queue_type !== "ready_for_release"
);
```

(Same logic and same status set as the shared evaluator — they should agree.)

**2. `src/components/admin/payouts/PayoutsTable.tsx` (line 51)**

Replace:
```ts
if (r.transaction.dispute_status && r.transaction.dispute_status !== "resolved")
  return { ok: false, reason: "Active dispute" };
```
with:
```ts
const ds = r.transaction.dispute_status;
if (ds && ds !== "resolved" && ds !== "none")
  return { ok: false, reason: "Active dispute" };
```

## After the fix

- Drawer checklist for `SD-2026-000024` flips to 9/9, "Release Payout" button enables.
- The row checkbox enables, "1 active dispute" footer text disappears, batch release works.
- No DB migration, no other endpoint changes.

## Out of scope (worth noting, not blocking you)

The fact that `payout-eligibility.ts` and `admin-payouts-detail/index.ts` have **two independent implementations** of the same gates is the root cause. Long-term they should share one evaluator, but consolidating them is a bigger refactor than what you need right now.
