
-- ============================================================
-- SafeDeal Batch 1-4 Sanity Fixes
-- FK CASCADE → RESTRICT on financial & trust tables
-- + Unique constraints on 1:1 support tables
-- ============================================================

-- 1. Financial tables: transaction_id -> RESTRICT
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_transaction_id_fkey,
  ADD CONSTRAINT payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE RESTRICT;

ALTER TABLE public.escrow_states DROP CONSTRAINT IF EXISTS escrow_states_transaction_id_fkey,
  ADD CONSTRAINT escrow_states_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE RESTRICT;

ALTER TABLE public.escrow_ledger_entries DROP CONSTRAINT IF EXISTS escrow_ledger_entries_transaction_id_fkey,
  ADD CONSTRAINT escrow_ledger_entries_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE RESTRICT;

ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS payouts_transaction_id_fkey,
  ADD CONSTRAINT payouts_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE RESTRICT;

ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS refunds_transaction_id_fkey,
  ADD CONSTRAINT refunds_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE RESTRICT;

-- 2. Financial tables: profile refs -> RESTRICT
ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS payouts_seller_id_fkey,
  ADD CONSTRAINT payouts_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS refunds_buyer_id_fkey,
  ADD CONSTRAINT refunds_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

-- 3. Trust/evidence tables: transaction_id -> RESTRICT
ALTER TABLE public.delivery_proof_files DROP CONSTRAINT IF EXISTS delivery_proof_files_transaction_id_fkey,
  ADD CONSTRAINT delivery_proof_files_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE RESTRICT;

ALTER TABLE public.transaction_agreement_snapshots DROP CONSTRAINT IF EXISTS transaction_agreement_snapshots_transaction_id_fkey,
  ADD CONSTRAINT transaction_agreement_snapshots_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE RESTRICT;

-- 4. Unique constraints for 1:1 tables (conditional)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_links_transaction_id_key') THEN
    ALTER TABLE public.transaction_links ADD CONSTRAINT transaction_links_transaction_id_key UNIQUE (transaction_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_notes_transaction_id_key') THEN
    ALTER TABLE public.transaction_notes ADD CONSTRAINT transaction_notes_transaction_id_key UNIQUE (transaction_id);
  END IF;
END $$;
