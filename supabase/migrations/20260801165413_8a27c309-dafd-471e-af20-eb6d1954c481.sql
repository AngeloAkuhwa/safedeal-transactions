-- Canonical escrow balance, matching admin_financial_reconciliation exactly:
--   escrow_hold + adjustment - payout_debit - refund_debit
-- `adjustment` carries SIGNED semantics: a positive value increases the
-- escrow balance, a negative value decreases it. Remediation entries are
-- always `adjustment` rows with reference_type = 'remediation'.
CREATE OR REPLACE FUNCTION public.escrow_canonical_balance(_transaction_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE e.entry_type
      WHEN 'escrow_hold'  THEN e.amount
      WHEN 'adjustment'   THEN e.amount
      WHEN 'payout_debit' THEN -e.amount
      WHEN 'refund_debit' THEN -e.amount
      ELSE 0
    END), 0)
  FROM public.escrow_ledger_entries e
  WHERE e.transaction_id = _transaction_id;
$$;

REVOKE ALL ON FUNCTION public.escrow_canonical_balance(uuid) FROM PUBLIC, anon, authenticated, sandbox_exec;
GRANT EXECUTE ON FUNCTION public.escrow_canonical_balance(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- Immutable remediation audit book
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_remediations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_key text NOT NULL UNIQUE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  rule_code text NOT NULL,
  reason_code text NOT NULL,
  before_balance numeric(18,2) NOT NULL,
  adjustment_amount numeric(18,2) NOT NULL,
  after_balance numeric(18,2) NOT NULL,
  ledger_entry_id uuid,
  idempotency_key text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.financial_remediations TO authenticated;
GRANT ALL ON public.financial_remediations TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.financial_remediations FROM authenticated, anon, sandbox_exec, service_role;
GRANT SELECT ON public.financial_remediations TO sandbox_exec;

ALTER TABLE public.financial_remediations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal staff can read remediations" ON public.financial_remediations;
CREATE POLICY "internal staff can read remediations"
ON public.financial_remediations FOR SELECT TO authenticated
USING (public.has_any_internal_role(auth.uid(), ARRAY['super_admin','senior_admin','finance_operator','finance_approver','compliance_officer','auditor']));

CREATE OR REPLACE FUNCTION public.prevent_remediation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'financial_remediations is append-only';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_remediation_mutation() FROM PUBLIC, anon, authenticated, sandbox_exec;

DROP TRIGGER IF EXISTS trg_prevent_remediation_mutation ON public.financial_remediations;
CREATE TRIGGER trg_prevent_remediation_mutation
BEFORE UPDATE OR DELETE ON public.financial_remediations
FOR EACH ROW EXECUTE FUNCTION public.prevent_remediation_mutation();

-- ---------------------------------------------------------------------
-- Atomic, idempotent remediation applier
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_financial_remediation_atomic(
  p_finding_key     text,
  p_transaction_id  uuid,
  p_rule_code       text,
  p_reason_code     text,
  p_expected_before numeric,
  p_adjustment      numeric,
  p_expected_after  numeric,
  p_evidence        jsonb DEFAULT '{}'::jsonb,
  p_actor_user_id   uuid DEFAULT NULL,
  p_correlation_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.financial_remediations%ROWTYPE;
  v_current numeric;
  v_after numeric;
  v_idem text;
  v_write jsonb;
  v_entry_id uuid;
BEGIN
  IF p_finding_key IS NULL OR length(p_finding_key) < 8 THEN
    RAISE EXCEPTION 'invalid_finding_key';
  END IF;
  IF p_adjustment IS NULL OR p_adjustment = 0 OR p_adjustment <> round(p_adjustment, 2) THEN
    RAISE EXCEPTION 'invalid_adjustment_amount:%', p_adjustment;
  END IF;
  IF round(p_expected_before + p_adjustment, 2) <> round(p_expected_after, 2) THEN
    RAISE EXCEPTION 'inconsistent_expected_after';
  END IF;

  -- Idempotent replay: already applied.
  SELECT * INTO v_existing FROM public.financial_remediations WHERE finding_key = p_finding_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'already_applied',
      'remediation_id', v_existing.id,
      'ledger_entry_id', v_existing.ledger_entry_id,
      'before_balance', v_existing.before_balance,
      'after_balance', v_existing.after_balance
    );
  END IF;

  -- Lock the transaction so no concurrent settlement moves the balance.
  PERFORM 1 FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  v_current := public.escrow_canonical_balance(p_transaction_id);
  IF round(v_current, 2) <> round(p_expected_before, 2) THEN
    RAISE EXCEPTION 'state_fingerprint_mismatch: expected % got %', p_expected_before, v_current;
  END IF;

  v_idem := 'remediation:v1:' || p_finding_key;

  v_write := public.ledger_write_guarded(
    p_transaction_id := p_transaction_id,
    p_entry_type     := 'adjustment'::escrow_ledger_entry_type,
    p_amount         := p_adjustment,
    p_currency       := COALESCE((SELECT currency_code FROM public.transaction_pricing WHERE transaction_id = p_transaction_id LIMIT 1), 'NGN'),
    p_reference_type := 'remediation',
    p_reference_id   := NULL,
    p_notes          := 'Correction 1 remediation: ' || p_reason_code,
    p_created_by     := p_actor_user_id,
    p_metadata       := jsonb_build_object(
                          'finding_key', p_finding_key,
                          'rule_code', p_rule_code,
                          'reason_code', p_reason_code,
                          'before_balance', p_expected_before,
                          'after_balance', p_expected_after
                        ),
    p_idempotency_key := v_idem,
    p_payload        := jsonb_build_object(
                          'finding_key', p_finding_key,
                          'transaction_id', p_transaction_id,
                          'adjustment', p_adjustment
                        ),
    p_correlation_id := p_correlation_id
  );

  IF (v_write->>'status') = 'idempotency_conflict' THEN
    RAISE EXCEPTION 'remediation_idempotency_conflict';
  END IF;
  v_entry_id := (v_write->>'entry_id')::uuid;

  v_after := public.escrow_canonical_balance(p_transaction_id);
  IF round(v_after, 2) <> round(p_expected_after, 2) THEN
    RAISE EXCEPTION 'post_state_mismatch: expected % got %', p_expected_after, v_after;
  END IF;

  INSERT INTO public.financial_remediations(
    finding_key, transaction_id, rule_code, reason_code,
    before_balance, adjustment_amount, after_balance,
    ledger_entry_id, idempotency_key, evidence, actor_user_id, correlation_id
  ) VALUES (
    p_finding_key, p_transaction_id, p_rule_code, p_reason_code,
    p_expected_before, p_adjustment, v_after,
    v_entry_id, v_idem, COALESCE(p_evidence, '{}'::jsonb), p_actor_user_id, p_correlation_id
  );

  RETURN jsonb_build_object(
    'status', 'applied',
    'ledger_entry_id', v_entry_id,
    'idempotency_key', v_idem,
    'before_balance', p_expected_before,
    'after_balance', v_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_financial_remediation_atomic(text, uuid, text, text, numeric, numeric, numeric, jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated, sandbox_exec;
GRANT EXECUTE ON FUNCTION public.apply_financial_remediation_atomic(text, uuid, text, text, numeric, numeric, numeric, jsonb, uuid, uuid) TO service_role;

-- Fix the cron-secret comparison: pgcrypto's digest() lives in `extensions`.
CREATE OR REPLACE FUNCTION public.verify_reconcile_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE v_secret text;
BEGIN
  IF p_secret IS NULL OR length(p_secret) < 32 THEN
    RETURN false;
  END IF;
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'reconcile_escrow_cron_secret'
  LIMIT 1;
  IF v_secret IS NULL THEN
    RETURN false;
  END IF;
  RETURN encode(extensions.digest(p_secret, 'sha256'), 'hex')
       = encode(extensions.digest(v_secret, 'sha256'), 'hex');
END;
$$;

REVOKE ALL ON FUNCTION public.verify_reconcile_cron_secret(text) FROM PUBLIC, anon, authenticated, sandbox_exec;
GRANT EXECUTE ON FUNCTION public.verify_reconcile_cron_secret(text) TO service_role;