-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ONE ledger_write_guarded.
--
-- Two overloads existed, differing only in parameter ORDER:
--   (uuid, entry_type, numeric, p_currency,        p_reference_type, ...)  -- no balance_after
--   (uuid, entry_type, numeric, p_idempotency_key, p_payload,        ...)  -- sets balance_after
-- Every positional caller bound the first one, so no 'adjustment' entry ever
-- carried balance_after and enforce_adjustment_balance aborted the whole
-- transaction. Named callers (apply_financial_remediation_atomic) were
-- ambiguous. We keep the CURRENCY-FOURTH order (what every positional caller
-- already passes) and fold in the balance_after computation, then drop the
-- other overload so the ambiguity cannot come back.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.ledger_write_guarded(
  uuid, escrow_ledger_entry_type, numeric, text, jsonb, text, text, uuid, text, uuid, jsonb, uuid
);

CREATE OR REPLACE FUNCTION public.ledger_write_guarded(
  p_transaction_id uuid,
  p_entry_type escrow_ledger_entry_type,
  p_amount numeric,
  p_currency text,
  p_reference_type text,
  p_reference_id uuid,
  p_notes text,
  p_created_by uuid,
  p_metadata jsonb,
  p_idempotency_key text,
  p_payload jsonb,
  p_correlation_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fp text;
  v_existing_fp text;
  v_existing_id uuid;
  v_id uuid;
  v_balance numeric;
BEGIN
  IF p_amount IS NULL OR NOT (p_amount = round(p_amount, 2)) THEN
    RAISE EXCEPTION 'invalid_money_amount:%', p_amount;
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'missing_idempotency_key';
  END IF;

  v_fp := public.canonical_fingerprint_v1(p_payload);

  -- 'adjustment' rows hold a position in the cash chain, so they always carry
  -- the resulting canonical balance (enforce_adjustment_balance requires it).
  IF p_entry_type = 'adjustment' THEN
    v_balance := public.escrow_canonical_balance(p_transaction_id) + p_amount;
  END IF;

  INSERT INTO public.escrow_ledger_entries(
    transaction_id, entry_type, amount, currency_code, reference_type, reference_id,
    notes, created_by_user_id, metadata, idempotency_key, payload_fingerprint, balance_after
  ) VALUES (
    p_transaction_id, p_entry_type, p_amount, COALESCE(p_currency, 'NGN'), p_reference_type, p_reference_id,
    p_notes, p_created_by, p_metadata, p_idempotency_key, v_fp, v_balance
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
$function$;

COMMENT ON FUNCTION public.ledger_write_guarded(
  uuid, escrow_ledger_entry_type, numeric, text, text, uuid, text, uuid, jsonb, text, jsonb, uuid
) IS 'Sole guarded writer for escrow_ledger_entries. Do NOT create a second overload: a positional caller would silently bind the wrong one. Callers should use named parameters.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ensure_platform_fee_reversal: named parameters, so a future signature
--    change is a hard error rather than a silent mis-bind.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_platform_fee_reversal(
  p_transaction_id uuid,
  p_required numeric,
  p_actor_user_id uuid,
  p_reference_type text DEFAULT 'refund'::text,
  p_reference_id uuid DEFAULT NULL::uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_excess numeric;
  v_fee numeric;
  v_reversed numeric;
  v_remaining numeric;
  v_currency text;
  v_seq int;
  v_key text;
BEGIN
  IF p_required IS NULL OR p_required <= 0 THEN RETURN 0; END IF;

  v_available := public.escrow_available_balance(p_transaction_id);
  IF p_required <= v_available + 0.005 THEN RETURN 0; END IF;

  v_excess := round(p_required - v_available, 2);

  SELECT COALESCE(SUM(amount), 0) INTO v_fee
  FROM public.escrow_ledger_entries
  WHERE transaction_id = p_transaction_id
    AND entry_type = 'fee_record'::escrow_ledger_entry_type
    AND reference_type = 'platform_fee';

  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_reversed, v_seq
  FROM public.escrow_ledger_entries
  WHERE transaction_id = p_transaction_id
    AND entry_type = 'adjustment'::escrow_ledger_entry_type
    AND reference_type = 'platform_fee_reversal';

  v_remaining := round(COALESCE(v_fee, 0) - COALESCE(v_reversed, 0), 2);

  -- Cannot refund more than item + platform fee out of escrow.
  IF v_remaining <= 0 OR v_excess > v_remaining + 0.005 THEN
    RETURN 0;
  END IF;

  v_excess := LEAST(v_excess, v_remaining);

  SELECT currency_code INTO v_currency
  FROM public.transaction_pricing WHERE transaction_id = p_transaction_id;
  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'pricing_snapshot_missing_currency:%', p_transaction_id;
  END IF;

  v_key := 'escrow:platform_fee_reversal:' || p_transaction_id::text || ':' || (v_seq + 1)::text;

  PERFORM public.ledger_write_guarded(
    p_transaction_id  := p_transaction_id,
    p_entry_type      := 'adjustment'::escrow_ledger_entry_type,
    p_amount          := v_excess,
    p_currency        := v_currency,
    p_reference_type  := 'platform_fee_reversal',
    p_reference_id    := p_reference_id,
    p_notes           := 'SafeDeal platform fee reversed into escrow for buyer refund',
    p_created_by      := p_actor_user_id,
    p_metadata        := jsonb_build_object(
                           'operation', 'platform_fee_reversal_for_refund',
                           'required', p_required,
                           'available_before', v_available,
                           'platform_fee_booked', v_fee,
                           'context', p_reference_type
                         ),
    p_idempotency_key := v_key,
    p_payload         := jsonb_build_object(
                           'transaction_id', p_transaction_id::text,
                           'entry_type', 'adjustment',
                           'operation', 'platform_fee_reversal_for_refund',
                           'sequence', v_seq + 1,
                           'amount_minor', round(v_excess * 100)::bigint,
                           'currency', v_currency
                         )
  );

  RETURN v_excess;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. record_payment_capture_atomic: fail closed when there is no escrow row.
--    Previously the UPDATE matched zero rows and capture still returned ok,
--    leaving money held and invisible to every admin escrow surface.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_payment_capture_atomic(
  p_payment_id uuid,
  p_provider_event_id text,
  p_raw_payload jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid; v_buyer uuid; v_status text; v_tx_status text;
  v_currency text; v_item numeric; v_platform numeric; v_processing numeric; v_total numeric;
  v_key_base text; v_res jsonb; v_conflict boolean := false; v_now timestamptz := now();
  v_escrow_rows int;
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
  GET DIAGNOSTICS v_escrow_rows = ROW_COUNT;

  -- Fail closed: holding money against a transaction with no escrow row makes
  -- the funds invisible to every admin escrow surface. No caller may skip it.
  IF v_escrow_rows = 0 THEN
    RAISE EXCEPTION 'missing_escrow_state:%', v_tx_id;
  END IF;

  v_res := public.ledger_write_guarded(
    p_transaction_id := v_tx_id, p_entry_type := 'payment_credit', p_amount := v_total,
    p_currency := v_currency, p_reference_type := 'payment', p_reference_id := p_payment_id,
    p_notes := 'Buyer payment received', p_created_by := v_buyer,
    p_metadata := jsonb_build_object('provider_event_id', p_provider_event_id),
    p_idempotency_key := v_key_base || ':payment_credit',
    p_payload := jsonb_build_object('transaction_id', v_tx_id::text, 'payment_id', p_payment_id::text,
      'provider_event_id', p_provider_event_id, 'entry_type', 'payment_credit',
      'amount_minor', round(v_total * 100)::bigint, 'currency', v_currency));
  v_conflict := v_conflict OR (v_res ->> 'status') = 'idempotency_conflict';

  v_res := public.ledger_write_guarded(
    p_transaction_id := v_tx_id, p_entry_type := 'fee_record', p_amount := COALESCE(v_processing, 0),
    p_currency := v_currency, p_reference_type := 'paystack_fee', p_reference_id := p_payment_id,
    p_notes := 'Payment processing fee', p_created_by := v_buyer,
    p_metadata := jsonb_build_object('provider_event_id', p_provider_event_id),
    p_idempotency_key := v_key_base || ':fee_processing',
    p_payload := jsonb_build_object('transaction_id', v_tx_id::text, 'payment_id', p_payment_id::text,
      'provider_event_id', p_provider_event_id, 'entry_type', 'fee_record', 'fee_kind', 'processing',
      'amount_minor', round(COALESCE(v_processing, 0) * 100)::bigint, 'currency', v_currency));
  v_conflict := v_conflict OR (v_res ->> 'status') = 'idempotency_conflict';

  v_res := public.ledger_write_guarded(
    p_transaction_id := v_tx_id, p_entry_type := 'fee_record', p_amount := COALESCE(v_platform, 0),
    p_currency := v_currency, p_reference_type := 'platform_fee', p_reference_id := p_payment_id,
    p_notes := 'SafeDeal platform fee', p_created_by := v_buyer,
    p_metadata := jsonb_build_object('provider_event_id', p_provider_event_id),
    p_idempotency_key := v_key_base || ':fee_platform',
    p_payload := jsonb_build_object('transaction_id', v_tx_id::text, 'payment_id', p_payment_id::text,
      'provider_event_id', p_provider_event_id, 'entry_type', 'fee_record', 'fee_kind', 'platform',
      'amount_minor', round(COALESCE(v_platform, 0) * 100)::bigint, 'currency', v_currency));
  v_conflict := v_conflict OR (v_res ->> 'status') = 'idempotency_conflict';

  v_res := public.ledger_write_guarded(
    p_transaction_id := v_tx_id, p_entry_type := 'escrow_hold', p_amount := v_item,
    p_currency := v_currency, p_reference_type := 'escrow', p_reference_id := p_payment_id,
    p_notes := 'Seller principal held in escrow', p_created_by := v_buyer,
    p_metadata := jsonb_build_object('provider_event_id', p_provider_event_id),
    p_idempotency_key := v_key_base || ':escrow_hold',
    p_payload := jsonb_build_object('transaction_id', v_tx_id::text, 'payment_id', p_payment_id::text,
      'provider_event_id', p_provider_event_id, 'entry_type', 'escrow_hold',
      'amount_minor', round(v_item * 100)::bigint, 'currency', v_currency));
  v_conflict := v_conflict OR (v_res ->> 'status') = 'idempotency_conflict';

  IF v_conflict THEN
    RAISE EXCEPTION 'idempotency_conflict_payment_capture:%', p_payment_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'transaction_id', v_tx_id, 'already_captured', v_status = 'succeeded');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Comment now describes what the code enforces: only 'adjustment' rows are
--    checked, so intent markers are exempt BY ENTRY TYPE, not by an exemption
--    list. (The old comment implied a list that was never implemented.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_adjustment_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only 'adjustment' rows move the cash chain, so only they must carry the
  -- resulting balance. Intent markers (freeze_hold, payout_awaiting_release,
  -- dispute_release_approved_pending_admin_release) are different entry types
  -- and are therefore never reached by this check — that is the exemption.
  IF NEW.entry_type = 'adjustment' AND NEW.balance_after IS NULL THEN
    RAISE EXCEPTION 'adjustment_requires_balance_after';
  END IF;
  RETURN NEW;
END;
$function$;