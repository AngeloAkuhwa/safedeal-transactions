

# Schema Sanity Fixes — Batches 1-4

## Migration

Single migration with:

1. **9 FK changes** from CASCADE to RESTRICT (DROP + ADD for each):
   - payments.transaction_id, escrow_states.transaction_id, escrow_ledger_entries.transaction_id, payouts.transaction_id, refunds.transaction_id
   - payouts.seller_id, refunds.buyer_id
   - delivery_proof_files.transaction_id, transaction_agreement_snapshots.transaction_id

2. **2 unique constraints** (added conditionally):
   - transaction_links.transaction_id
   - transaction_notes.transaction_id

## Verification

Query `pg_constraint` to confirm all 9 FKs have `confdeltype != 'c'` (not cascade) and both unique constraints exist. Will not rely on "RESTRICT" label — will verify the delete action is not CASCADE and not SET NULL.

## Files

- Migration executed via database tool
- SQL copy saved to `src/db/migrations/005_fk_restrict_fixes.sql`

