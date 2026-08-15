-- ============================================================================
-- Phase 0 closure: table-level DML lockdown, forced RLS, internal consistency
-- constraints, balance floors, and narrowed EXECUTE grants.
-- ============================================================================

-- 1a. Client roles hold no table-level DML on money tables. RLS default-deny
--     already blocked these, but one layer is not two.
DO $do$
DECLARE
  -- Every money table. anon never writes to any of them.
  v_all text[] := ARRAY[
    'payments','payouts','refunds','escrow_states','escrow_ledger_entries',
    'dispute_outcomes','money_status_history','vendor_plan_purchases',
    'transaction_pricing','financial_remediations','escrow_reconciliation_results',
    'payout_accounts','checkout_sessions','release_review_queue'
  ];
  -- No INSERT/UPDATE policy exists for a client role on these, so the grant was
  -- pure surface area: revoke from authenticated as well.
  v_no_client_writes text[] := ARRAY[
    'payments','payouts','refunds','escrow_states','escrow_ledger_entries',
    'dispute_outcomes','money_status_history','vendor_plan_purchases',
    'financial_remediations','escrow_reconciliation_results'
  ];
  -- These carry genuine INSERT/UPDATE policies for authenticated; only the
  -- unused destructive/structural privileges come off.
  v_client_writable text[] := ARRAY[
    'transaction_pricing','payout_accounts','checkout_sessions','release_review_queue'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY v_all LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;

  FOREACH t IN ARRAY v_no_client_writes LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
  END LOOP;

  FOREACH t IN ARRAY v_client_writable LOOP
    EXECUTE format(
      'REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
  END LOOP;
END $do$;

-- 1b. FORCE ROW LEVEL SECURITY is safe for the definer path: postgres and
--     service_role both carry BYPASSRLS, which outranks forced RLS.

-- 2. transaction_pricing is internally consistent, not merely non-negative.
ALTER TABLE public.transaction_pricing
  DROP CONSTRAINT IF EXISTS transaction_pricing_total_matches_components;
ALTER TABLE public.transaction_pricing
  ADD CONSTRAINT transaction_pricing_total_matches_components CHECK (
    buyer_total_amount IS NULL OR item_amount IS NULL
    OR round(buyer_total_amount, 2) = round(
         item_amount
         + COALESCE(platform_fee_amount, 0)
         + COALESCE(payment_processing_fee_amount, 0), 2)
  );

ALTER TABLE public.transaction_pricing
  DROP CONSTRAINT IF EXISTS transaction_pricing_payout_bounded_by_item;
ALTER TABLE public.transaction_pricing
  ADD CONSTRAINT transaction_pricing_payout_bounded_by_item CHECK (
    seller_payout_amount IS NULL OR item_amount IS NULL
    OR seller_payout_amount <= item_amount + 0.005
  );

-- The same predicates at the RLS boundary, so a seller write is refused by the
-- policy and not only by the constraint.
DROP POLICY IF EXISTS sellers_insert_txn_pricing ON public.transaction_pricing;
CREATE POLICY sellers_insert_txn_pricing ON public.transaction_pricing
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.transactions t
           WHERE t.id = transaction_pricing.transaction_id AND t.seller_id = auth.uid())
  AND public.is_finite_money(item_amount) AND item_amount >= 0
  AND public.is_finite_money(platform_fee_amount) AND platform_fee_amount >= 0
  AND public.is_finite_money(payment_processing_fee_amount) AND payment_processing_fee_amount >= 0
  AND public.is_finite_money(seller_payout_amount) AND seller_payout_amount >= 0
  AND public.is_finite_money(buyer_total_amount) AND buyer_total_amount >= 0
  AND round(buyer_total_amount, 2)
      = round(item_amount + platform_fee_amount + payment_processing_fee_amount, 2)
  AND seller_payout_amount <= item_amount + 0.005
);

DROP POLICY IF EXISTS sellers_update_txn_pricing ON public.transaction_pricing;
CREATE POLICY sellers_update_txn_pricing ON public.transaction_pricing
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.transactions t
           WHERE t.id = transaction_pricing.transaction_id AND t.seller_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.transactions t
           WHERE t.id = transaction_pricing.transaction_id AND t.seller_id = auth.uid())
  AND public.is_finite_money(item_amount) AND item_amount >= 0
  AND public.is_finite_money(buyer_total_amount) AND buyer_total_amount >= 0
  AND (platform_fee_amount IS NULL
       OR (public.is_finite_money(platform_fee_amount) AND platform_fee_amount >= 0))
  AND (payment_processing_fee_amount IS NULL
       OR (public.is_finite_money(payment_processing_fee_amount) AND payment_processing_fee_amount >= 0))
  AND (seller_payout_amount IS NULL
       OR (public.is_finite_money(seller_payout_amount) AND seller_payout_amount >= 0))
  AND round(buyer_total_amount, 2) = round(
        item_amount + COALESCE(platform_fee_amount, 0)
                    + COALESCE(payment_processing_fee_amount, 0), 2)
  AND (seller_payout_amount IS NULL OR seller_payout_amount <= item_amount + 0.005)
);

-- 3a. The running escrow balance has a floor. A debit that would take the
--     chain negative is a bug, and the ledger is append-only.
ALTER TABLE public.escrow_ledger_entries
  DROP CONSTRAINT IF EXISTS escrow_ledger_balance_after_finite;
ALTER TABLE public.escrow_ledger_entries
  ADD CONSTRAINT escrow_ledger_balance_after_finite CHECK (
    balance_after IS NULL
    OR (balance_after >= 0 AND balance_after < 'Infinity'::numeric)
  );

DO $do$
DECLARE s text; s0 text; v_oid oid;
BEGIN
  SELECT oid INTO v_oid FROM pg_proc
   WHERE proname = 'ledger_write_guarded' AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;
  s := replace(s,
'  INSERT INTO public.escrow_ledger_entries(',
'  -- A cash movement can never drive the canonical position below zero.
  IF v_balance IS NOT NULL AND v_balance < 0 THEN
    RAISE EXCEPTION ''ledger_balance_negative:tx=% type=% amount=% resulting=%'',
      p_transaction_id, p_entry_type, p_amount, v_balance;
  END IF;

  INSERT INTO public.escrow_ledger_entries(');
  IF s = s0 THEN RAISE EXCEPTION 'expected function body shape not found: ledger_write_guarded'; END IF;
  EXECUTE s;
END $do$;

-- 3b. Reserved stock is bounded by real stock.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_stock_quantity_nonnegative;
ALTER TABLE public.products ADD CONSTRAINT products_stock_quantity_nonnegative
  CHECK (stock_quantity >= 0);
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_reserved_quantity_bounded;
ALTER TABLE public.products ADD CONSTRAINT products_reserved_quantity_bounded
  CHECK (reserved_quantity >= 0 AND reserved_quantity <= stock_quantity);

-- 4. Narrow two EXECUTE grants to what their justification actually claims.
--    is_transaction_party is an RLS predicate: authenticated needs it, anon
--    does not. derive_target_user_id is called only from SECURITY DEFINER
--    triggers, so no client role needs it at all — and it would otherwise
--    answer "who sells this transaction?" for any UUID holder.
REVOKE EXECUTE ON FUNCTION public.is_transaction_party(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.derive_target_user_id(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.derive_target_user_id(uuid, uuid) TO service_role, postgres;

-- 5. Value validation on the two remaining ownership-only policies.
DROP POLICY IF EXISTS buyers_insert_own_checkout_sessions ON public.checkout_sessions;
CREATE POLICY buyers_insert_own_checkout_sessions ON public.checkout_sessions
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = buyer_id
  AND public.is_finite_money(subtotal_amount) AND subtotal_amount >= 0
  AND public.is_finite_money(total_protection_fee) AND total_protection_fee >= 0
  AND public.is_finite_money(total_amount) AND total_amount >= 0
  AND round(total_amount, 2) = round(subtotal_amount + total_protection_fee, 2)
);

DROP POLICY IF EXISTS buyers_update_own_checkout_sessions ON public.checkout_sessions;
CREATE POLICY buyers_update_own_checkout_sessions ON public.checkout_sessions
FOR UPDATE TO authenticated
USING (auth.uid() = buyer_id)
WITH CHECK (
  auth.uid() = buyer_id
  AND public.is_finite_money(subtotal_amount) AND subtotal_amount >= 0
  AND public.is_finite_money(total_protection_fee) AND total_protection_fee >= 0
  AND public.is_finite_money(total_amount) AND total_amount >= 0
  AND round(total_amount, 2) = round(subtotal_amount + total_protection_fee, 2)
);

DROP POLICY IF EXISTS admins_insert_release_queue ON public.release_review_queue;
CREATE POLICY admins_insert_release_queue ON public.release_review_queue
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::user_role_type)
  AND (amount IS NULL OR (public.is_finite_money(amount) AND amount >= 0))
);

DROP POLICY IF EXISTS admins_update_release_queue ON public.release_review_queue;
CREATE POLICY admins_update_release_queue ON public.release_review_queue
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::user_role_type))
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::user_role_type)
  AND (amount IS NULL OR (public.is_finite_money(amount) AND amount >= 0))
);