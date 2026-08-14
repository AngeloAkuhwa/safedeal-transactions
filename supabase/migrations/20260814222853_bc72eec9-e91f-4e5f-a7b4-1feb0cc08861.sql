-- Apply the 11 staged money-function redefinitions (bodies staged in deploy.fn_source).
SELECT deploy.apply_staged();

-- Database backstop for refund sign/magnitude.
ALTER TABLE public.refunds
  ADD CONSTRAINT refunds_refund_amount_positive
  CHECK (refund_amount > 0 AND refund_amount = round(refund_amount, 2));