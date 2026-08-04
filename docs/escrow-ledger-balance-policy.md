# Escrow ledger — `balance_after` policy

`escrow_ledger_entries` is append-only. `balance_after` is a **derived** column: the
canonical escrow position of the transaction immediately after that entry, using the
same arithmetic as `public.escrow_canonical_balance()`:

```
balance = Σ escrow_hold + Σ adjustment − Σ payout_debit − Σ refund_debit
```

## Entry types that MUST carry a balance

`escrow_hold`, `payout_debit`, `refund_debit`, `adjustment`.

As of the Batch 4 Step 0 migration, a `BEFORE INSERT OR UPDATE` trigger
(`enforce_adjustment_balance_trg`) rejects any `adjustment` written without a
`balance_after`, and `ledger_write_guarded()` computes it automatically
(`escrow_canonical_balance(tx) + amount`) so callers cannot forget it.

## Entry types intentionally left NULL

These are **intent markers**, not cash movements (`is_cash_movement = false`). They
record that a state was reached, hold no position in the cash chain, and are excluded
from the canonical balance. Their `balance_after` is NULL **by design** and must not be
backfilled:

- `freeze_hold`
- `payout_awaiting_release`
- `dispute_release_approved_pending_admin_release`

## Known legacy divergence (not corrected)

Rows written before the canonical chain was formalised stored `balance_after` under
older semantics — notably `payment_credit` / `fee_record` rows recorded a gross-in
then fee-deducted running figure, and the two payouts that were posted **gross of
fees** (`SD-2026-000019`, `SD-2026-000021`) stored `0.00` where a canonical replay
yields `−780.00` and `−535.00`. Those payouts were remediated with compensating
`adjustment` entries in Fix 2. The historical rows are left exactly as written: they
are what the system recorded at the time, and rewriting them would make the ledger
disagree with the money that actually moved.