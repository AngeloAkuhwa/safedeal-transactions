
-- =============================================================================
-- Phase 2: Central payment snapshot hardening
-- =============================================================================

-- 1. Additive columns on transaction_pricing -------------------------------
ALTER TABLE public.transaction_pricing
  ADD COLUMN IF NOT EXISTS payment_processing_fee_amount NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS seller_payout_amount          NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS is_total_service_fee_capped   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pricing_model_version         TEXT;

-- Backfill only UNLOCKED rows (locked agreements must stay byte-for-byte unchanged).
UPDATE public.transaction_pricing tp
   SET payment_processing_fee_amount = COALESCE(tp.payment_processing_fee_amount, tp.processing_fee_amount),
       seller_payout_amount          = COALESCE(tp.seller_payout_amount, tp.item_amount),
       is_total_service_fee_capped   = (COALESCE(tp.processing_fee_amount,0) + COALESCE(tp.platform_fee_amount,0)) >= 2500
  FROM public.transactions t
 WHERE t.id = tp.transaction_id
   AND t.agreement_locked_at IS NULL
   AND (
     tp.payment_processing_fee_amount IS NULL
     OR tp.seller_payout_amount IS NULL
   );

-- Non-negative guards.
ALTER TABLE public.transaction_pricing
  DROP CONSTRAINT IF EXISTS chk_payment_processing_fee_nonneg,
  ADD  CONSTRAINT chk_payment_processing_fee_nonneg
       CHECK (payment_processing_fee_amount IS NULL OR payment_processing_fee_amount >= 0);

ALTER TABLE public.transaction_pricing
  DROP CONSTRAINT IF EXISTS chk_seller_payout_nonneg,
  ADD  CONSTRAINT chk_seller_payout_nonneg
       CHECK (seller_payout_amount IS NULL OR seller_payout_amount >= 0);


-- 2. Pricing-lock trigger -------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_pricing_update_after_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_locked   TIMESTAMPTZ;
  v_money    public.money_status;
  v_override BOOLEAN := COALESCE(current_setting('safedeal.pricing_override', true) = 'on', false);
BEGIN
  IF v_override THEN
    RETURN NEW;
  END IF;

  SELECT agreement_locked_at, money_status
    INTO v_locked, v_money
  FROM public.transactions
  WHERE id = NEW.transaction_id;

  IF v_locked IS NOT NULL
     OR v_money IN ('funds_held_in_escrow','funds_pending_release','funds_releasing',
                    'funds_released','funds_frozen','refund_pending','refund_issued') THEN
    RAISE EXCEPTION 'transaction_pricing is locked after payment (tx=%, money_status=%)',
      NEW.transaction_id, v_money
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_pricing_update ON public.transaction_pricing;
CREATE TRIGGER trg_prevent_pricing_update
  BEFORE UPDATE ON public.transaction_pricing
  FOR EACH ROW EXECUTE FUNCTION public.prevent_pricing_update_after_lock();


-- 3. Super-admin escape hatch --------------------------------------------
-- Performs the pricing mutation only. Calling edge function writes
-- admin_actions / transaction_events using the enums the app allows.
CREATE OR REPLACE FUNCTION public.admin_correct_pricing(
  p_transaction_id UUID,
  p_item_amount    NUMERIC,
  p_safedeal_fee   NUMERIC,
  p_processing_fee NUMERIC,
  p_reason         TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := auth.uid();
  v_old   public.transaction_pricing%ROWTYPE;
  v_new   public.transaction_pricing%ROWTYPE;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_admin, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_item_amount < 0 OR p_safedeal_fee < 0 OR p_processing_fee < 0 THEN
    RAISE EXCEPTION 'invalid_amounts' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old
  FROM public.transaction_pricing
  WHERE transaction_id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pricing_not_found' USING ERRCODE = '02000';
  END IF;

  PERFORM set_config('safedeal.pricing_override', 'on', true);

  UPDATE public.transaction_pricing
     SET item_amount                   = p_item_amount,
         platform_fee_amount           = p_safedeal_fee,
         processing_fee_amount         = p_processing_fee,
         payment_processing_fee_amount = p_processing_fee,
         buyer_total_amount            = p_item_amount + p_safedeal_fee + p_processing_fee,
         seller_net_amount             = p_item_amount,
         seller_payout_amount          = p_item_amount,
         is_total_service_fee_capped   = (p_safedeal_fee + p_processing_fee) >= 2500,
         updated_at                    = now()
   WHERE transaction_id = p_transaction_id
   RETURNING * INTO v_new;

  PERFORM set_config('safedeal.pricing_override', 'off', true);

  RETURN jsonb_build_object(
    'ok',     true,
    'old',    to_jsonb(v_old),
    'new',    to_jsonb(v_new),
    'reason', p_reason,
    'admin',  v_admin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_correct_pricing(UUID,NUMERIC,NUMERIC,NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_correct_pricing(UUID,NUMERIC,NUMERIC,NUMERIC,TEXT) TO authenticated, service_role;


-- 4. Dispute-status transition trigger -----------------------------------
CREATE OR REPLACE FUNCTION public.validate_dispute_transition(
  old_status public.dispute_case_status,
  new_status public.dispute_case_status
) RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF old_status = new_status THEN RETURN TRUE; END IF;
  RETURN CASE old_status
    WHEN 'open'                    THEN new_status IN ('seller_response_pending','under_review','resolved')
    WHEN 'seller_response_pending' THEN new_status IN ('under_review','resolved')
    WHEN 'under_review'            THEN new_status =  'resolved'
    WHEN 'resolved'                THEN FALSE
    ELSE FALSE
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_dispute_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT public.validate_dispute_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'invalid dispute transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_dispute_state_machine ON public.disputes;
CREATE TRIGGER enforce_dispute_state_machine
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dispute_transition();


-- 5. v_payout_account_state view -----------------------------------------
DROP VIEW IF EXISTS public.v_payout_account_state;
CREATE VIEW public.v_payout_account_state
WITH (security_invoker = on) AS
WITH ranked AS (
  SELECT
    pa.user_id,
    pa.id                       AS account_id,
    pa.bank_name,
    pa.masked_account_number,
    pa.verification_status,
    pa.provider_recipient_code,
    pa.last_verified_at,
    ROW_NUMBER() OVER (
      PARTITION BY pa.user_id
      ORDER BY (pa.verification_status = 'verified') DESC,
               pa.last_verified_at DESC NULLS LAST,
               pa.updated_at DESC
    ) AS rn
  FROM public.payout_accounts pa
)
SELECT
  user_id,
  account_id,
  bank_name,
  masked_account_number,
  verification_status,
  provider_recipient_code,
  last_verified_at,
  CASE
    WHEN verification_status <> 'verified'                              THEN 'unverified'
    WHEN verification_status =  'verified' AND provider_recipient_code IS NULL
                                                                        THEN 'verified_no_recipient'
    ELSE                                                                     'verified_ready'
  END AS account_state
FROM ranked
WHERE rn = 1;

GRANT SELECT ON public.v_payout_account_state TO authenticated, service_role;


-- 6. Index for payout lookups --------------------------------------------
CREATE INDEX IF NOT EXISTS idx_payouts_tx_status
  ON public.payouts(transaction_id, status);
