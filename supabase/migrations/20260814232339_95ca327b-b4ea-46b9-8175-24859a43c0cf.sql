-- Complete the property: every public numeric money column has a schema-level
-- finiteness backstop. Signed balances/deltas remain signed by design.
ALTER TABLE public.buyer_specific_offer_items
  ADD CONSTRAINT buyer_offer_items_unit_price_finite_nonnegative
    CHECK (unit_price_snapshot >= 0 AND unit_price_snapshot < 'Infinity'::numeric);

ALTER TABLE public.checkout_session_items
  ADD CONSTRAINT checkout_items_unit_price_finite_nonnegative
    CHECK (unit_price >= 0 AND unit_price < 'Infinity'::numeric),
  ADD CONSTRAINT checkout_items_line_total_finite_nonnegative
    CHECK (line_total >= 0 AND line_total < 'Infinity'::numeric);

ALTER TABLE public.checkout_sessions
  ADD CONSTRAINT checkout_sessions_subtotal_finite_nonnegative
    CHECK (subtotal_amount >= 0 AND subtotal_amount < 'Infinity'::numeric),
  ADD CONSTRAINT checkout_sessions_protection_fee_finite_nonnegative
    CHECK (total_protection_fee >= 0 AND total_protection_fee < 'Infinity'::numeric),
  ADD CONSTRAINT checkout_sessions_total_finite_nonnegative
    CHECK (total_amount >= 0 AND total_amount < 'Infinity'::numeric);

ALTER TABLE public.escrow_ledger_entries
  ADD CONSTRAINT escrow_ledger_balance_after_finite
    CHECK (balance_after IS NULL OR (balance_after > '-Infinity'::numeric AND balance_after < 'Infinity'::numeric));

ALTER TABLE public.escrow_reconciliation_results
  ADD CONSTRAINT reconciliation_paystack_collected_finite_nonnegative
    CHECK (paystack_collected >= 0 AND paystack_collected < 'Infinity'::numeric),
  ADD CONSTRAINT reconciliation_paystack_refunded_finite_nonnegative
    CHECK (paystack_refunded >= 0 AND paystack_refunded < 'Infinity'::numeric),
  ADD CONSTRAINT reconciliation_paystack_paid_out_finite_nonnegative
    CHECK (paystack_paid_out >= 0 AND paystack_paid_out < 'Infinity'::numeric),
  ADD CONSTRAINT reconciliation_ledger_balance_finite
    CHECK (ledger_balance > '-Infinity'::numeric AND ledger_balance < 'Infinity'::numeric),
  ADD CONSTRAINT reconciliation_expected_balance_finite
    CHECK (expected_ledger_balance > '-Infinity'::numeric AND expected_ledger_balance < 'Infinity'::numeric),
  ADD CONSTRAINT reconciliation_delta_finite
    CHECK (delta > '-Infinity'::numeric AND delta < 'Infinity'::numeric);

ALTER TABLE public.products
  ADD CONSTRAINT products_unit_price_finite_nonnegative
    CHECK (unit_price >= 0 AND unit_price < 'Infinity'::numeric),
  ADD CONSTRAINT products_original_price_finite_nonnegative
    CHECK (original_price IS NULL OR (original_price >= 0 AND original_price < 'Infinity'::numeric));

ALTER TABLE public.release_review_queue
  ADD CONSTRAINT release_review_amount_finite_nonnegative
    CHECK (amount IS NULL OR (amount >= 0 AND amount < 'Infinity'::numeric));

ALTER TABLE public.vendor_plan_purchases
  ADD CONSTRAINT vendor_plan_purchases_amount_finite_nonnegative
    CHECK (amount_naira >= 0 AND amount_naira < 'Infinity'::numeric);

ALTER TABLE public.vendor_plans
  ADD CONSTRAINT vendor_plans_escrow_fee_rate_finite_nonnegative
    CHECK (escrow_fee_rate >= 0 AND escrow_fee_rate < 'Infinity'::numeric),
  ADD CONSTRAINT vendor_plans_monthly_price_finite_nonnegative
    CHECK (monthly_price_naira >= 0 AND monthly_price_naira < 'Infinity'::numeric),
  ADD CONSTRAINT vendor_plans_yearly_price_finite_nonnegative
    CHECK (yearly_price_naira >= 0 AND yearly_price_naira < 'Infinity'::numeric);