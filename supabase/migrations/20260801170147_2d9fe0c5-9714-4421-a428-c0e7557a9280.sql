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
    -- Canonical payloads carry money as integer minor units (kobo).
    p_payload        := jsonb_build_object(
                          'finding_key', p_finding_key,
                          'transaction_id', p_transaction_id::text,
                          'adjustment_minor', round(p_adjustment * 100)::bigint,
                          'expected_before_minor', round(p_expected_before * 100)::bigint,
                          'expected_after_minor', round(p_expected_after * 100)::bigint
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