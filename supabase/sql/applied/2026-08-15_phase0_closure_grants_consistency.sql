-- ============================================================================
-- Phase 0 closure. Applied 2026-08-15.
--   1. Table-level DML lockdown + FORCE RLS on the 14 money tables.
--   2. transaction_pricing internal-consistency CHECKs, mirrored into RLS.
--   3. Ledger balance floor (>= 0) and products.reserved_quantity bounds.
--   4. Narrowed EXECUTE on is_transaction_party / derive_target_user_id.
--   5. Value validation in the checkout_sessions / release_review_queue policies.
--
-- FORCE ROW LEVEL SECURITY is safe for the SECURITY DEFINER path: postgres and
-- service_role both carry BYPASSRLS, which outranks forced RLS.
-- ============================================================================
-- (full statements as applied; see migration history)

DO $do$
DECLARE
  v_all text[] := ARRAY['payments','payouts','refunds','escrow_states','escrow_ledger_entries',
    'dispute_outcomes','money_status_history','vendor_plan_purchases','transaction_pricing',
    'financial_remediations','escrow_reconciliation_results','payout_accounts',
    'checkout_sessions','release_review_queue'];
  v_no_client_writes text[] := ARRAY['payments','payouts','refunds','escrow_states',
    'escrow_ledger_entries','dispute_outcomes','money_status_history','vendor_plan_purchases',
    'financial_remediations','escrow_reconciliation_results'];
  v_client_writable text[] := ARRAY['transaction_pricing','payout_accounts',
    'checkout_sessions','release_review_queue'];
  t text;
BEGIN
  FOREACH t IN ARRAY v_all LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
  FOREACH t IN ARRAY v_no_client_writes LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
  END LOOP;
  FOREACH t IN ARRAY v_client_writable LOOP
    EXECUTE format('REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
  END LOOP;
END $do$;

ALTER TABLE public.transaction_pricing ADD CONSTRAINT transaction_pricing_total_matches_components CHECK (
  buyer_total_amount IS NULL OR item_amount IS NULL
  OR round(buyer_total_amount,2) = round(item_amount + COALESCE(platform_fee_amount,0)
       + COALESCE(payment_processing_fee_amount,0), 2));
ALTER TABLE public.transaction_pricing ADD CONSTRAINT transaction_pricing_payout_bounded_by_item CHECK (
  seller_payout_amount IS NULL OR item_amount IS NULL OR seller_payout_amount <= item_amount + 0.005);

ALTER TABLE public.escrow_ledger_entries DROP CONSTRAINT IF EXISTS escrow_ledger_balance_after_finite;
ALTER TABLE public.escrow_ledger_entries ADD CONSTRAINT escrow_ledger_balance_after_finite CHECK (
  balance_after IS NULL OR (balance_after >= 0 AND balance_after < 'Infinity'::numeric));
-- ledger_write_guarded raises ledger_balance_negative before the INSERT.

ALTER TABLE public.products ADD CONSTRAINT products_stock_quantity_nonnegative CHECK (stock_quantity >= 0);
ALTER TABLE public.products ADD CONSTRAINT products_reserved_quantity_bounded
  CHECK (reserved_quantity >= 0 AND reserved_quantity <= stock_quantity);

REVOKE ALL ON FUNCTION public.is_transaction_party(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_transaction_party(uuid, uuid) TO authenticated, service_role, postgres;
REVOKE ALL ON FUNCTION public.derive_target_user_id(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.derive_target_user_id(uuid, uuid) TO service_role, postgres;

-- RLS policies recreated with value predicates: sellers_{insert,update}_txn_pricing,
-- buyers_{insert,update}_own_checkout_sessions, admins_{insert,update}_release_queue.
