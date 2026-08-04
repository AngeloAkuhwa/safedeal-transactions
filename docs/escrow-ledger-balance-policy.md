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

## Release posting rule (current code path)

A release books **`payout_debit` at NET** — `transaction_pricing.seller_payout_amount` —
never the buyer's gross total. Fees are booked as `fee_record` entries earlier in the
lifecycle, at capture, by `record_payment_capture_atomic`. Together this makes the chain
reconcile with no compensating entry:

```
payment_credit = escrow_hold + fee_record
payment_credit = payout_debit + fee_record      (payout_debit is NET)
```

Enforcement, all prospective:

- `releasePayoutCore` refuses when there is no pricing snapshot (`pricing_missing`) —
  previously a missing snapshot let an unverified, possibly gross, figure through.
- The transfer amount is taken from the snapshot, not from the payout row.
- A fee-chain guard refuses release (queued as `manual_hold`, notes prefixed
  `fee_record_mismatch`) when booked `fee_record` totals disagree with the snapshot fees.
- `paystack-webhook` books `payout_debit` at the snapshot net, logging loudly if the
  payout row disagrees.
- Covered by `supabase/functions/_shared/__tests__/release-ledger-invariant.test.ts`.

`SD-2026-000005` predates `record_payment_capture_atomic`, which is why it has no
`fee_record`; the current capture path would have produced one, so that gap is closed
going forward.

## Known legacy divergence (not corrected)

Rows written before the canonical chain was formalised stored `balance_after` under
older semantics — notably `payment_credit` / `fee_record` rows recorded a gross-in
then fee-deducted running figure, and the two payouts that were posted **gross of
fees** (`SD-2026-000019`, `SD-2026-000021`) stored `0.00` where a canonical replay
yields `−780.00` and `−535.00`. Those payouts were remediated with compensating
`adjustment` entries in Fix 2. The historical rows are left exactly as written: they
are what the system recorded at the time, and rewriting them would make the ledger
disagree with the money that actually moved.

This is deliberate: history keeps the legacy **gross** posting plus its Fix 2
remediation `adjustment`, and reconciliation reports `ok` with delta 0 for those
transactions. The code change above is forward-only — no historical row was written,
backfilled or adjusted for `SD-2026-000005`, `SD-2026-000019` or `SD-2026-000021`.