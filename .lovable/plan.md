## Root cause

`admin-user-detail` returns two data blocks:

- `user.transactions.count` — comes from `buildDirectory()` in `supabase/functions/_shared/users-directory-engine.ts`.
- `recent_transactions` — comes from a separate query in `admin-user-detail/index.ts` using `.or(buyer_id|seller_id)` with **no status filter**.

The second works (5 rows for Tunde). The first returns 0 because the engine still has:

1. A bogus status whitelist `["completed","released","funded","in_escrow","in_transit","delivered"]` — only `completed` is a real enum value; `payment_secured`, `awaiting_payment`, `disputed`, `resolved`, `refunded`, `delivered_awaiting_verification` are silently excluded.
2. A PostgREST embed `transaction_pricing(buyer_total_amount)` combined with `.in("status", […])` and `.limit(20000)` — if the embed is rejected for any reason, the entire `txs` becomes `null` and every user gets `count = 0`.

## Fix — one file: `supabase/functions/_shared/users-directory-engine.ts`

Replace the transactions aggregation block with two simple queries merged in JS:

```ts
const FUNDED = new Set([
  "payment_secured","seller_preparing_delivery","seller_dispatched",
  "delivered_awaiting_verification","disputed","resolved","completed","refunded"
]);
const RESOLVED_STATES = new Set(["completed","resolved","refunded"]);

const { data: txs } = await admin
  .from("transactions")
  .select("id, buyer_id, seller_id, status")
  .not("status", "in", "(draft,cancelled,timed_out)")
  .limit(20000);

const txIds = (txs ?? []).map(t => t.id as string);
const amtByTx = new Map<string, number>();
if (txIds.length) {
  const { data: pricing } = await admin
    .from("transaction_pricing")
    .select("transaction_id, buyer_total_amount")
    .in("transaction_id", txIds);
  for (const p of pricing ?? []) {
    amtByTx.set(p.transaction_id as string, Number(p.buyer_total_amount ?? 0));
  }
}

const txByUser = new Map<string, { count: number; resolved: number; volume: number }>();
for (const t of txs ?? []) {
  const status = (t.status as string) ?? "";
  const amt = FUNDED.has(status) ? (amtByTx.get(t.id as string) ?? 0) : 0;
  for (const uid of [t.buyer_id, t.seller_id].filter(Boolean) as string[]) {
    if (!ids.includes(uid)) continue;
    const cur = txByUser.get(uid) ?? { count: 0, resolved: 0, volume: 0 };
    cur.count++;
    cur.volume += amt;
    if (RESOLVED_STATES.has(status)) cur.resolved++;
    txByUser.set(uid, cur);
  }
}
```

No UI, no other-file, no schema changes.

## Verification

Re-open Tunde's drawer → Activity shows `5 Transactions` and a real ₦ volume; Angelo's shows `2 / ₦33,660`; Chioma's seller numbers populate; disputes `1/3` unchanged.
