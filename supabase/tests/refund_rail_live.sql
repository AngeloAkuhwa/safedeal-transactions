-- ─────────────────────────────────────────────────────────────────────────────
-- LIVE refund-rail proof. Executes a real capture + refund against the database
-- and rolls back. This exists because the ledger_write_guarded overload outage
-- was invisible to every source-text scanning rule we have: the SQL was
-- perfectly well-formed, it simply bound the wrong function.
--
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/refund_rail_live.sql
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_seller uuid; v_buyer uuid; v_tx uuid; v_pay uuid; v_refund uuid;
  v_adj_balance numeric; v_adj_count int; v_held numeric; v_reversal numeric;
BEGIN
  SELECT id INTO v_seller FROM public.profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO v_buyer FROM public.profiles WHERE id <> v_seller ORDER BY created_at LIMIT 1;
  IF v_seller IS NULL OR v_buyer IS NULL THEN
    RAISE EXCEPTION 'refund_rail_live: needs at least two profiles to seed';
  END IF;

  INSERT INTO public.transactions(
    transaction_code, seller_id, buyer_id, created_by_user_id,
    share_token, status, money_status, dispute_status
  ) VALUES (
    'SD-RRLIVE-' || substr(md5(random()::text), 1, 8), v_seller, v_buyer, v_seller,
    'rrlive-' || substr(md5(random()::text), 1, 16),
    'awaiting_payment', 'not_secured', 'none'
  ) RETURNING id INTO v_tx;

  INSERT INTO public.transaction_pricing(
    transaction_id, currency_code, item_amount, platform_fee_amount,
    payment_processing_fee_amount, seller_payout_amount, buyer_total_amount,
    pricing_model_version
  ) VALUES (v_tx, 'NGN', 20000.00, 400.00, 380.00, 20000.00, 20780.00, 'test');

  INSERT INTO public.escrow_states(transaction_id, state, held_amount)
  VALUES (v_tx, 'awaiting_payment', 0);

  INSERT INTO public.payments(
    transaction_id, provider, provider_reference, status,
    payment_method_type, currency_code, amount
  ) VALUES (
    v_tx, 'paystack', 'rrlive_' || substr(md5(random()::text), 1, 12), 'pending',
    'card', 'NGN', 20780.00
  ) RETURNING id INTO v_pay;

  -- 1. Capture must succeed AND must actually move the escrow row.
  PERFORM public.record_payment_capture_atomic(v_pay, 'evt_rrlive_' || v_tx::text, NULL);

  SELECT held_amount INTO v_held FROM public.escrow_states WHERE transaction_id = v_tx;
  IF v_held IS DISTINCT FROM 20000.00 THEN
    RAISE EXCEPTION 'capture did not hold the item amount: got %', v_held;
  END IF;

  -- 2. Refund of item + platform fee. Escrow holds only the item, so this
  --    forces the platform-fee reversal through ledger_write_guarded.
  v_refund := public.start_refund_atomic(v_tx, 20400.00, v_seller, 'rrlive', 'automated proof');
  IF v_refund IS NULL THEN
    RAISE EXCEPTION 'start_refund_atomic returned NULL';
  END IF;

  -- 3. The reversal must exist and MUST carry balance_after (the overload bug
  --    produced a NULL here and aborted the whole refund).
  SELECT count(*), max(balance_after), max(amount)
    INTO v_adj_count, v_adj_balance, v_reversal
  FROM public.escrow_ledger_entries
  WHERE transaction_id = v_tx
    AND entry_type = 'adjustment'
    AND reference_type = 'platform_fee_reversal';

  IF v_adj_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 platform_fee_reversal, got %', v_adj_count;
  END IF;
  IF v_adj_balance IS NULL THEN
    RAISE EXCEPTION 'platform_fee_reversal carries a NULL balance_after';
  END IF;
  IF v_reversal IS DISTINCT FROM 400.00 THEN
    RAISE EXCEPTION 'expected a 400.00 platform fee reversal, got %', v_reversal;
  END IF;

  -- 4. The refund row is real and pending provider handoff.
  IF NOT EXISTS (
    SELECT 1 FROM public.refunds
    WHERE id = v_refund AND refund_amount = 20400.00 AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'refund row not written as expected';
  END IF;

  RAISE NOTICE 'refund_rail_live: PASS (tx=%, refund=%, balance_after=%)', v_tx, v_refund, v_adj_balance;
END $$;

ROLLBACK;
