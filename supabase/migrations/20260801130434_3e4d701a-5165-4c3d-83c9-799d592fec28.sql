-- 1. Cash-movement flag on the ledger -------------------------------------
ALTER TABLE public.escrow_ledger_entries
  ADD COLUMN IF NOT EXISTS is_cash_movement boolean
  GENERATED ALWAYS AS (
    entry_type IN (
      'payment_credit'::escrow_ledger_entry_type,
      'escrow_hold'::escrow_ledger_entry_type,
      'payout_debit'::escrow_ledger_entry_type,
      'refund_debit'::escrow_ledger_entry_type,
      'adjustment'::escrow_ledger_entry_type
    )
  ) STORED;

-- 2. Duplicate movement guard ---------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS escrow_ledger_unique_cash_movement
  ON public.escrow_ledger_entries (transaction_id, entry_type, reference_type, reference_id)
  WHERE reference_id IS NOT NULL
    AND entry_type IN (
      'payment_credit'::escrow_ledger_entry_type,
      'escrow_hold'::escrow_ledger_entry_type,
      'payout_debit'::escrow_ledger_entry_type,
      'refund_debit'::escrow_ledger_entry_type
    );

CREATE INDEX IF NOT EXISTS escrow_ledger_tx_type_idx
  ON public.escrow_ledger_entries (transaction_id, entry_type);

-- 3. Available-balance helper ---------------------------------------------
CREATE OR REPLACE FUNCTION public.escrow_available_balance(_transaction_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(
    CASE e.entry_type
      WHEN 'escrow_hold' THEN e.amount
      WHEN 'payout_debit' THEN -e.amount
      WHEN 'refund_debit' THEN -e.amount
      WHEN 'adjustment' THEN e.amount
      ELSE 0
    END
  ), 0)::numeric
  FROM public.escrow_ledger_entries e
  WHERE e.transaction_id = _transaction_id
$$;

-- 4. Balance guard on payout completion + correct escrow accounting --------
CREATE OR REPLACE FUNCTION public.complete_payout_atomic(p_payout_id uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid;
  v_seller_id uuid;
  v_currency text;
  v_old_money money_status;
  v_available numeric;
BEGIN
  SELECT transaction_id, seller_id, currency_code INTO v_tx_id, v_seller_id, v_currency
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;

  IF v_tx_id IS NULL THEN
    RAISE EXCEPTION 'payout_not_found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.payouts WHERE id = p_payout_id AND status = 'completed') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  -- Never move more than escrow actually holds for this transaction.
  v_available := public.escrow_available_balance(v_tx_id);
  IF p_amount > v_available + 0.01 THEN
    RAISE EXCEPTION 'payout_exceeds_escrow_balance: available=% requested=%', v_available, p_amount;
  END IF;

  UPDATE public.payouts
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_payout_id;

  SELECT money_status INTO v_old_money FROM public.transactions WHERE id = v_tx_id FOR UPDATE;

  IF v_old_money = 'funds_releasing'::money_status THEN
    UPDATE public.transactions
    SET money_status = 'funds_released',
        release_completed_at = now(),
        updated_at = now()
    WHERE id = v_tx_id;

    INSERT INTO public.money_status_history(transaction_id, old_status, new_status, reason)
    VALUES (v_tx_id, v_old_money, 'funds_released', 'transfer_success_webhook');
  END IF;

  UPDATE public.escrow_states
  SET released_amount = released_amount + p_amount,
      held_amount = GREATEST(0, held_amount - p_amount),
      state = 'released_to_seller'::escrow_state,
      last_changed_at = now(),
      updated_at = now()
  WHERE transaction_id = v_tx_id;

  INSERT INTO public.escrow_ledger_entries(
    transaction_id, entry_type, amount, currency_code, reference_type, reference_id, notes
  ) VALUES (
    v_tx_id, 'payout_debit', p_amount, COALESCE(v_currency, 'NGN'),
    'payout', p_payout_id, 'transfer.success'
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.release_review_queue
  SET status = 'released',
      resolved_at = now(),
      updated_at = now()
  WHERE transaction_id = v_tx_id AND status IN ('processing','claimed','pending');

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 5. Canonical reconciliation ----------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_financial_reconciliation(
  _since timestamptz DEFAULT NULL,
  _only_issues boolean DEFAULT false
)
RETURNS TABLE (
  transaction_id uuid,
  transaction_code text,
  currency text,
  money_status text,
  created_at timestamptz,
  captured numeric,
  escrowed numeric,
  refunded numeric,
  released numeric,
  payout_approved numeric,
  remaining numeric,
  ledger_balance numeric,
  expected_balance numeric,
  difference numeric,
  status text,
  issues text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH scope AS (
  SELECT t.id, t.transaction_code, t.money_status, t.created_at
  FROM public.transactions t
  WHERE (_since IS NULL OR t.created_at >= _since)
    AND t.money_status NOT IN ('not_secured'::money_status, 'payment_pending'::money_status)
),
pay AS (
  SELECT p.transaction_id, SUM(p.amount) AS captured
  FROM public.payments p
  WHERE p.status = 'succeeded'
  GROUP BY 1
),
led AS (
  SELECT e.transaction_id,
         SUM(e.amount) FILTER (WHERE e.entry_type = 'payment_credit') AS credit,
         SUM(e.amount) FILTER (WHERE e.entry_type = 'fee_record')     AS fees,
         SUM(e.amount) FILTER (WHERE e.entry_type = 'escrow_hold')    AS hold,
         SUM(e.amount) FILTER (WHERE e.entry_type = 'payout_debit')   AS payout_debit,
         SUM(e.amount) FILTER (WHERE e.entry_type = 'refund_debit')   AS refund_debit,
         SUM(e.amount) FILTER (WHERE e.entry_type = 'adjustment')     AS adjustment,
         COUNT(*)                                                     AS entries
  FROM public.escrow_ledger_entries e
  GROUP BY 1
),
po AS (
  SELECT p.transaction_id,
         SUM(p.amount) FILTER (WHERE p.status = 'completed')                          AS paid,
         SUM(p.amount) FILTER (WHERE p.status IN ('pending','processing','completed')) AS approved,
         COUNT(*) FILTER (WHERE p.status IN ('pending','processing'))                  AS in_flight,
         COUNT(*) FILTER (WHERE p.status = 'completed' AND p.completed_at IS NULL)     AS missing_ts
  FROM public.payouts p
  GROUP BY 1
),
rf AS (
  SELECT r.transaction_id,
         SUM(r.refund_amount) FILTER (WHERE r.status = 'completed')                 AS refunded,
         COUNT(*) FILTER (WHERE r.status IN ('pending','processing'))               AS in_flight
  FROM public.refunds r
  GROUP BY 1
),
es AS (
  SELECT s.transaction_id, s.held_amount, s.released_amount, s.refunded_amount, s.frozen_amount
  FROM public.escrow_states s
),
dup AS (
  SELECT d.transaction_id, SUM(d.n - 1) AS dupes
  FROM (
    SELECT e.transaction_id, COUNT(*) AS n
    FROM public.escrow_ledger_entries e
    WHERE e.reference_id IS NOT NULL AND e.is_cash_movement
    GROUP BY e.transaction_id, e.entry_type, e.reference_type, e.reference_id
    HAVING COUNT(*) > 1
  ) d
  GROUP BY d.transaction_id
),
base AS (
  SELECT
    s.id,
    s.transaction_code,
    COALESCE(tp.currency_code, 'NGN')            AS currency,
    s.money_status::text                          AS money_status,
    s.created_at,
    COALESCE(pay.captured, 0)                     AS captured,
    COALESCE(led.hold, 0)                         AS escrowed,
    COALESCE(rf.refunded, 0)                      AS refunded,
    COALESCE(po.paid, 0)                          AS released,
    COALESCE(po.approved, 0)                      AS payout_approved,
    COALESCE(led.credit, 0)                       AS credit,
    COALESCE(led.fees, 0)                         AS fees,
    COALESCE(led.payout_debit, 0)                 AS payout_debit,
    COALESCE(led.refund_debit, 0)                 AS refund_debit,
    COALESCE(led.adjustment, 0)                   AS adjustment,
    COALESCE(led.entries, 0)                      AS entries,
    COALESCE(po.in_flight, 0)                     AS payouts_in_flight,
    COALESCE(po.missing_ts, 0)                    AS payouts_missing_ts,
    COALESCE(rf.in_flight, 0)                     AS refunds_in_flight,
    COALESCE(dup.dupes, 0)                        AS dupes,
    es.held_amount, es.released_amount, es.refunded_amount
  FROM scope s
  LEFT JOIN public.transaction_pricing tp ON tp.transaction_id = s.id
  LEFT JOIN pay ON pay.transaction_id = s.id
  LEFT JOIN led ON led.transaction_id = s.id
  LEFT JOIN po  ON po.transaction_id  = s.id
  LEFT JOIN rf  ON rf.transaction_id  = s.id
  LEFT JOIN es  ON es.transaction_id  = s.id
  LEFT JOIN dup ON dup.transaction_id = s.id
),
scored AS (
  SELECT b.*,
    (b.escrowed + b.adjustment - b.payout_debit - b.refund_debit) AS ledger_balance,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN b.captured > 0 AND b.entries = 0 THEN 'missing_ledger' END,
      CASE WHEN b.credit > 0 AND ABS(b.credit - (b.fees + b.escrowed)) > 0.01 THEN 'ledger_split_mismatch' END,
      CASE WHEN b.captured > 0 AND b.credit > 0 AND ABS(b.captured - b.credit) > 0.01 THEN 'capture_ledger_mismatch' END,
      CASE WHEN (b.payout_debit + b.refund_debit) > b.escrowed + b.adjustment + 0.01 THEN 'over_disbursed' END,
      CASE WHEN ABS(b.payout_debit - b.released) > 0.01 THEN 'release_amount_mismatch' END,
      CASE WHEN b.held_amount IS NOT NULL
             AND ABS(b.held_amount - (b.escrowed + b.adjustment - b.payout_debit - b.refund_debit)) > 0.01
           THEN 'escrow_state_drift' END,
      CASE WHEN b.released_amount IS NOT NULL AND ABS(b.released_amount - b.released) > 0.01
           THEN 'escrow_released_drift' END,
      CASE WHEN b.payouts_missing_ts > 0 THEN 'payout_missing_completion_timestamp' END,
      CASE WHEN b.dupes > 0 THEN 'duplicate_ledger_entries' END
    ], NULL) AS issues
  FROM base b
)
SELECT
  s.id,
  s.transaction_code,
  s.currency,
  s.money_status,
  s.created_at,
  s.captured,
  s.escrowed,
  s.refunded,
  s.released,
  s.payout_approved,
  GREATEST(s.ledger_balance, 0)                       AS remaining,
  s.ledger_balance,
  (s.escrowed + s.adjustment - s.payout_debit - s.refund_debit) AS expected_balance,
  ROUND(
    COALESCE(s.held_amount, s.ledger_balance) - s.ledger_balance
  , 2)                                                AS difference,
  CASE
    WHEN ARRAY_LENGTH(s.issues, 1) IS NULL
         AND (s.payouts_in_flight > 0 OR s.refunds_in_flight > 0) THEN 'pending_settlement'
    WHEN ARRAY_LENGTH(s.issues, 1) IS NULL THEN 'reconciled'
    WHEN s.issues && ARRAY['missing_ledger','over_disbursed','duplicate_ledger_entries','capture_ledger_mismatch','ledger_split_mismatch'] THEN 'mismatch'
    ELSE 'requires_review'
  END                                                  AS status,
  COALESCE(s.issues, ARRAY[]::text[])                  AS issues
FROM scored s
WHERE NOT _only_issues OR ARRAY_LENGTH(s.issues, 1) IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.admin_financial_reconciliation_summary(_since timestamptz DEFAULT NULL)
RETURNS TABLE (
  reconciled bigint,
  pending_settlement bigint,
  mismatch bigint,
  requires_review bigint,
  total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COUNT(*) FILTER (WHERE r.status = 'reconciled')::bigint,
    COUNT(*) FILTER (WHERE r.status = 'pending_settlement')::bigint,
    COUNT(*) FILTER (WHERE r.status = 'mismatch')::bigint,
    COUNT(*) FILTER (WHERE r.status = 'requires_review')::bigint,
    COUNT(*)::bigint
  FROM public.admin_financial_reconciliation(_since, false) r
$$;

REVOKE ALL ON FUNCTION public.admin_financial_reconciliation(timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_financial_reconciliation_summary(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.escrow_available_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_financial_reconciliation(timestamptz, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_financial_reconciliation_summary(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.escrow_available_balance(uuid) TO service_role;