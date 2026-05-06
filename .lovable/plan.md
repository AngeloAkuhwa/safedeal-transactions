# Fix: "Failed to fetch" on Admin Transaction Detail

## Root cause

Edge function `admin-transaction-detail` crashes with:
```
ReferenceError: Cannot access 'escrow' before initialization
  at index.ts:370 (compiled, source line 325)
```

In `supabase/functions/admin-transaction-detail/index.ts`:
- Line 325: `const escrowStateLabel = escrow ? mapEscrowState(escrow.state) : null;`
- Line 326: `const payoutStatusLabel = payout ? mapPayoutStatus(payout.status) : null;`

But `escrow` is declared on line 344 and `payout` on line 364. The labels reference variables that don't exist yet (TypeScript `const` temporal dead zone), so every call to the function 500s, and the browser surfaces it as "Failed to fetch" / "Failed to send a request to the Edge Function".

This was likely introduced when label helpers were added.

## Fix

Move the two label computations to **after** the `escrow` and `payout` constant declarations (just after line 379). No other logic changes — both variables are read later (lines 494, 626, 627, 683 for `escrow`; line 326 was the only premature use of `payout`).

Resulting order:
```ts
const payment = paymentRes.data ? { ... } : null;
const escrow  = escrowRes.data  ? { ... } : null;
const payout  = payoutRes.data  ? { ... } : null;
const escrowStateLabel = escrow ? mapEscrowState(escrow.state) : null;
const payoutStatusLabel = payout ? mapPayoutStatus(payout.status) : null;
```

Then deploy the function.

## Verification

1. `curl` POST `admin-transaction-detail` with the failing tx id `b1000001-0003-4000-8000-000000000003` → expect 200.
2. Reload `/admin/transactions/b1000001-0003-4000-8000-000000000003` in preview → detail page renders.
3. Check edge function logs → no more `Cannot access 'escrow' before initialization`.

## Out of scope

No DB, RLS, UI, or business-logic changes.
