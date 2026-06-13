## Root cause

The `release-payout` 500 with `tx_fetch_failed` is a SQL error in `supabase/functions/_shared/release-core.ts`. Line 26 selects a column that doesn't exist:

```ts
.select("id, money_status, seller_id, buyer_id, currency_code, transaction_code")
```

`transactions.currency_code` was removed long ago — currency lives on `transaction_pricing` and `payouts`. The query errors out, the function returns `tx_fetch_failed`, and every Release/Batch attempt fails (this is also why "Batch release complete — 0 released, 1 failed" appears).

I verified against the live schema: `SELECT column_name FROM information_schema.columns WHERE table_name='transactions' AND column_name='currency_code'` returns 0 rows.

## Fix (one file)

`supabase/functions/_shared/release-core.ts`:

1. Drop `currency_code` from the `transactions` select on line 26:
```ts
.select("id, money_status, seller_id, buyer_id, transaction_code")
```

2. The two downstream usages (lines 178 and 193) use `(tx as any).currency_code` to format the seller-payout amount. Replace both with `(payout as any).currency_code` (already in the payout select on line 36, and is the authoritative currency for the payout amount anyway). Fall back to `"NGN"` if null.

## Deploy

Redeploy `release-payout` (and `resolve-release-review` since it also imports `release-core.ts`).

## After the fix

- Confirm Release on PAY-2026-1E5167 succeeds → Paystack transfer initiated, payout transitions to `processing`, money_status to `funds_releasing`.
- Batch release also works for this row.

## Out of scope

The same file has a `refundBuyerCore` path that already avoids `currency_code` on the tx select — no change needed there. A broader audit for other places still referencing `transactions.currency_code` can be done separately.
