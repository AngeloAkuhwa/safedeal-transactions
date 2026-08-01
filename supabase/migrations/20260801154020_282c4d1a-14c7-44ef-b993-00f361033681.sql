SET lock_timeout = '3s';

-- Canonical flat payload serialization (v1). Flat objects only: string, integer, null.
CREATE OR REPLACE FUNCTION public.canonical_payload_v1(p jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE k text; v jsonb; parts text[] := '{}'; t text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'canonical_payload_v1_requires_object';
  END IF;
  FOR k IN SELECT key FROM jsonb_object_keys(p) AS key ORDER BY key COLLATE "C" LOOP
    v := p -> k;
    t := jsonb_typeof(v);
    IF t = 'object' OR t = 'array' THEN
      RAISE EXCEPTION 'canonical_payload_v1_nested_not_allowed:%', k;
    ELSIF t = 'null' THEN
      parts := parts || (k || '=' || chr(0));
    ELSIF t = 'number' THEN
      IF (v #>> '{}') !~ '^-?[0-9]+$' THEN
        RAISE EXCEPTION 'canonical_payload_v1_non_integer_number:%', k;
      END IF;
      parts := parts || (k || '=' || (v #>> '{}'));
    ELSIF t = 'boolean' THEN
      parts := parts || (k || '=' || (v #>> '{}'));
    ELSE
      parts := parts || (k || '=' || normalize((v #>> '{}'), NFC));
    END IF;
  END LOOP;
  RETURN array_to_string(parts, E'\n');
END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_fingerprint_v1(p jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 'v1:' || encode(extensions.digest(convert_to(public.canonical_payload_v1(p), 'UTF8'), 'sha256'), 'hex')
$$;

REVOKE ALL ON FUNCTION public.canonical_payload_v1(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.canonical_fingerprint_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_fingerprint_v1(jsonb) TO service_role;

-- Guarded ledger writer: the only supported way to append an authoritative entry.
CREATE OR REPLACE FUNCTION public.ledger_write_guarded(
  p_transaction_id uuid,
  p_entry_type public.escrow_ledger_entry_type,
  p_amount numeric,
  p_currency text,
  p_reference_type text,
  p_reference_id uuid,
  p_notes text,
  p_created_by uuid,
  p_metadata jsonb,
  p_idempotency_key text,
  p_payload jsonb,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fp text;
  v_existing_fp text;
  v_existing_id uuid;
  v_id uuid;
BEGIN
  IF p_amount IS NULL OR NOT (p_amount = round(p_amount, 2)) THEN
    RAISE EXCEPTION 'invalid_money_amount:%', p_amount;
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'missing_idempotency_key';
  END IF;

  v_fp := public.canonical_fingerprint_v1(p_payload);

  INSERT INTO public.escrow_ledger_entries(
    transaction_id, entry_type, amount, currency_code, reference_type, reference_id,
    notes, created_by_user_id, metadata, idempotency_key, payload_fingerprint
  ) VALUES (
    p_transaction_id, p_entry_type, p_amount, COALESCE(p_currency, 'NGN'), p_reference_type, p_reference_id,
    p_notes, p_created_by, p_metadata, p_idempotency_key, v_fp
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'written', 'entry_id', v_id, 'fingerprint', v_fp);
  END IF;

  SELECT id, payload_fingerprint INTO v_existing_id, v_existing_fp
  FROM public.escrow_ledger_entries WHERE idempotency_key = p_idempotency_key;

  IF v_existing_fp = v_fp THEN
    RETURN jsonb_build_object('status', 'duplicate', 'entry_id', v_existing_id, 'fingerprint', v_fp);
  END IF;

  INSERT INTO public.financial_idempotency_conflicts(
    idempotency_key, existing_fingerprint, incoming_fingerprint,
    transaction_id, entry_type, correlation_id, actor_user_id
  ) VALUES (
    p_idempotency_key, v_existing_fp, v_fp, p_transaction_id, p_entry_type, p_correlation_id, p_created_by
  )
  ON CONFLICT (idempotency_key, existing_fingerprint, incoming_fingerprint)
  DO UPDATE SET last_seen = now(), occurrence_count = public.financial_idempotency_conflicts.occurrence_count + 1;

  RETURN jsonb_build_object('status', 'idempotency_conflict', 'entry_id', v_existing_id, 'correlation_id', p_correlation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ledger_write_guarded(uuid, public.escrow_ledger_entry_type, numeric, text, text, uuid, text, uuid, jsonb, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ledger_write_guarded(uuid, public.escrow_ledger_entry_type, numeric, text, text, uuid, text, uuid, jsonb, text, jsonb, uuid) TO service_role;

-- #12 payment capture bundle
CREATE OR REPLACE FUNCTION public.record_payment_capture_atomic(
  p_payment_id uuid,
  p_provider_event_id text,
  p_raw_payload jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx_id uuid; v_buyer uuid; v_status text; v_tx_status text;
  v_currency text; v_item numeric; v_platform numeric; v_processing numeric; v_total numeric;
  v_key_base text; v_res jsonb; v_conflict boolean := false; v_now timestamptz := now();
BEGIN
  IF p_provider_event_id IS NULL OR length(p_provider_event_id) < 3 THEN
    RAISE EXCEPTION 'missing_provider_event_id';
  END IF;

  SELECT transaction_id, status INTO v_tx_id, v_status
  FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF v_tx_id IS NULL THEN RAISE EXCEPTION 'payment_not_found'; END IF;

  SELECT buyer_id, status::text INTO v_buyer, v_tx_status
  FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  SELECT currency_code, item_amount, platform_fee_amount, payment_processing_fee_amount, buyer_total_amount
    INTO v_currency, v_item, v_platform, v_processing, v_total
  FROM public.transaction_pricing WHERE transaction_id = v_tx_id;

  IF v_item IS NULL OR v_total IS NULL THEN
    RAISE EXCEPTION 'missing_authoritative_pricing_snapshot';
  END IF;

  v_key_base := 'payment:capture:' || v_tx_id::text || ':' || p_provider_event_id;

  UPDATE public.payments
     SET status = 'succeeded', captured_at = COALESCE(captured_at, v_now),
         authorized_at = COALESCE(authorized_at, v_now),
         raw_payload = COALESCE(p_raw_payload, raw_payload), updated_at = v_now
   WHERE id = p_payment_id;

  UPDATE public.transactions
     SET status = 'payment_secured', money_status = 'funds_held_in_escrow',
         agreement_locked_at = COALESCE(agreement_locked_at, v_now), updated_at = v_now
   WHERE id = v_tx_id AND money_status IS DISTINCT FROM 'funds_held_in_escrow';

  UPDATE public.escrow_states
     SET state = 'held', held_amount = v_item, last_changed_at = v_now, updated_at = v_now
   WHERE transaction_id = v_tx_id;

  v_res := public.ledger_write_guarded(v_tx_id, 'payment_credit', v_total, v_currency, 'payment', p_payment_id,
    'Buyer payment received', v_buyer, jsonb_build_object('provider_event_id', p_provider_event_id),
    v_key_base || ':payment_credit',
    jsonb_build_object('transaction_id', v_tx_id::text, 'payment_id', p_payment_id::text,
      'provider_event_id', p_provider_event_id, 'entry_type', 'payment_credit',
      'amount_minor', round(v_total * 100)::bigint, 'currency', COALESCE(v_currency,'NGN')));
  v_conflict := v_conflict OR (v_res ->> 'status') = 'idempotency_conflict';

  v_res := public.ledger_write_guarded(v_tx_id, 'fee_record', COALESCE(v_processing,0), v_currency, 'paystack_fee', p_payment_id,
    'Payment processing fee', v_buyer, jsonb_build_object('provider_event_id', p_provider_event_id),
    v_key_base || ':fee_processing',
    jsonb_build_object('transaction_id', v_tx_id::text, 'payment_id', p_payment_id::text,
      'provider_event_id', p_provider_event_id, 'entry_type', 'fee_record', 'fee_kind', 'processing',
      'amount_minor', round(COALESCE(v_processing,0) * 100)::bigint, 'currency', COALESCE(v_currency,'NGN')));
  v_conflict := v_conflict OR (v_res ->> 'status') = 'idempotency_conflict';

  v_res := public.ledger_write_guarded(v_tx_id, 'fee_record', COALESCE(v_platform,0), v_currency, 'platform_fee', p_payment_id,
    'SafeDeal platform fee', v_buyer, jsonb_build_object('provider_event_id', p_provider_event_id),
    v_key_base || ':fee_platform',
    jsonb_build_object('transaction_id', v_tx_id::text, 'payment_id', p_payment_id::text,
      'provider_event_id', p_provider_event_id, 'entry_type', 'fee_record', 'fee_kind', 'platform',
      'amount_minor', round(COALESCE(v_platform,0) * 100)::bigint, 'currency', COALESCE(v_currency,'NGN')));
  v_conflict := v_conflict OR (v_res ->> 'status') = 'idempotency_conflict';

  v_res := public.ledger_write_guarded(v_tx_id, 'escrow_hold', v_item, v_currency, 'escrow', p_payment_id,
    'Seller principal held in escrow', v_buyer, jsonb_build_object('provider_event_id', p_provider_event_id),
    v_key_base || ':escrow_hold',
    jsonb_build_object('transaction_id', v_tx_id::text, 'payment_id', p_payment_id::text,
      'provider_event_id', p_provider_event_id, 'entry_type', 'escrow_hold',
      'amount_minor', round(v_item * 100)::bigint, 'currency', COALESCE(v_currency,'NGN')));
  v_conflict := v_conflict OR (v_res ->> 'status') = 'idempotency_conflict';

  IF v_conflict THEN
    RAISE EXCEPTION 'idempotency_conflict_payment_capture:%', p_payment_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'transaction_id', v_tx_id, 'already_captured', v_status = 'succeeded');
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_capture_atomic(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_capture_atomic(uuid, text, jsonb) TO service_role;

-- #13 completion release intent (commitment only, never a debit)
CREATE OR REPLACE FUNCTION public.record_completion_release_intent_atomic(
  p_transaction_id uuid,
  p_actor uuid,
  p_confirmation_id uuid,
  p_payout_id uuid,
  p_amount numeric,
  p_currency text,
  p_entry_type public.escrow_ledger_entry_type DEFAULT 'payout_awaiting_release',
  p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res jsonb; v_open integer;
BEGIN
  IF p_entry_type NOT IN ('payout_awaiting_release', 'dispute_release_approved_pending_admin_release') THEN
    RAISE EXCEPTION 'invalid_commitment_entry_type:%', p_entry_type;
  END IF;
  IF p_confirmation_id IS NULL THEN RAISE EXCEPTION 'missing_confirmation_id'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_commitment_amount'; END IF;

  PERFORM 1 FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;

  -- at most one open commitment per payout
  SELECT count(*) INTO v_open
  FROM public.escrow_ledger_entries e
  WHERE e.transaction_id = p_transaction_id
    AND e.entry_type IN ('payout_awaiting_release','dispute_release_approved_pending_admin_release')
    AND (p_payout_id IS NULL OR e.reference_id = p_payout_id);

  IF v_open > 0 THEN
    RETURN jsonb_build_object('ok', true, 'status', 'commitment_exists');
  END IF;

  v_res := public.ledger_write_guarded(
    p_transaction_id, p_entry_type, p_amount, p_currency, 'payout', p_payout_id,
    COALESCE(p_notes, 'Both parties confirmed. Commitment recorded; no funds transferred.'),
    p_actor, jsonb_build_object('confirmation_id', p_confirmation_id),
    'release:intent:' || p_transaction_id::text || ':' || p_confirmation_id::text || ':' || p_entry_type::text,
    jsonb_build_object('transaction_id', p_transaction_id::text, 'confirmation_id', p_confirmation_id::text,
      'payout_id', COALESCE(p_payout_id::text, ''), 'entry_type', p_entry_type::text,
      'amount_minor', round(p_amount * 100)::bigint, 'currency', COALESCE(p_currency,'NGN')));

  IF (v_res ->> 'status') = 'idempotency_conflict' THEN
    RAISE EXCEPTION 'idempotency_conflict_release_intent:%', p_confirmation_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', v_res ->> 'status');
END;
$$;

REVOKE ALL ON FUNCTION public.record_completion_release_intent_atomic(uuid, uuid, uuid, uuid, numeric, text, public.escrow_ledger_entry_type, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_completion_release_intent_atomic(uuid, uuid, uuid, uuid, numeric, text, public.escrow_ledger_entry_type, text) TO service_role;