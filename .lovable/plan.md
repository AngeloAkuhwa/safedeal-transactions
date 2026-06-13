## What's actually happening

The red "Release review cleared — ACTION NEEDED" check is firing on a queue row that is **not** a real review/hold — it's the *work item itself*. Here's the trail:

1. When both buyer & seller confirm completion, `seller-confirm-completion` inserts a row into `release_review_queue` with `queue_type = 'ready_for_release'`, `status = 'pending'`. This row's only purpose is to give admins a work item that says "this payout is ready, go release it."
2. The payout eligibility gate (`supabase/functions/_shared/payout-eligibility.ts`, gate `no_release_review`) blocks release whenever **any** queue row exists in `('pending','in_progress')` regardless of `queue_type`.
3. So the very row that means "ready to release" is the row that blocks the release. Catch-22. There is no admin UI that resolves it either — the `resolve-release-review` edge function is unwired from the UI.

The actual review-style queue types that *should* block release are the ones produced by `flag_for_release_review` (`stuck`, `payout_account_missing`, `pricing_missing`, `silent_dispute`, `failed_payout`, `refund_request`, `transfer_reversed`, `manual_hold`, `delivery_proof_missing`, `suspicious_activity`) and the dispute-resolved variants. `ready_for_release` is a workqueue marker, not a blocker.

Also note the gate query filters on `status in ('pending','in_progress')`, but the real in-flight statuses used elsewhere in the codebase are `claimed`, `processing`, `awaiting_info`, `held` — `in_progress` doesn't exist as a status value. Worth tightening at the same time.

## The fix (one file)

**`supabase/functions/_shared/payout-eligibility.ts`**

Change the `release_review_queue` query and the `no_release_review` gate so that:

- It ignores rows with `queue_type = 'ready_for_release'` (these are the "go do it" rows, not blockers).
- It uses the correct open-status set: `pending`, `claimed`, `processing`, `awaiting_info`, `held`. (Matches the partial unique index used by `flag_for_release_review` and the values written by `resolve-release-review`.)
- The gate still passes only when there are no truly-blocking review rows.

Concretely, replace the `reviewRes` query with:

```ts
admin
  .from("release_review_queue")
  .select("id, status, queue_type")
  .eq("transaction_id", transaction_id)
  .in("status", ["pending", "claimed", "processing", "awaiting_info", "held"])
  .neq("queue_type", "ready_for_release"),
```

The `no_release_review` gate's `pass: reviews.length === 0` then becomes correct on its own.

When the admin clicks Release, `release_payout_atomic` already transitions any matching queue row to `processing` (and the `ready_for_release` row gets carried along), so nothing downstream needs to change.

## After the fix

For this specific payout (SD-2026-000024): the checklist will recompute to all-PASS and the Release button in the Payout Details drawer becomes clickable. No manual SQL needed.

## Out of scope (call out only)

- Building an admin "Resolve release review" UI that wires up the existing `resolve-release-review` edge function. That's still useful for legitimately stuck/held cases (`manual_hold`, `stuck`, etc.) where an admin needs to dismiss/hold/refund. Today those cases are also un-actionable from the UI — but that's a separate feature, not what's blocking you right now.
