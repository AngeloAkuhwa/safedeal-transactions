-- Item 5b: backfill derived balance_after on adjustment entries only.
-- Semantics: canonical escrow chain (escrow_hold + adjustment - payout_debit - refund_debit),
-- identical to public.escrow_canonical_balance().
-- The table is append-only; the update trigger is suspended only for the
-- duration of this derived-column backfill inside the same transaction.
ALTER TABLE public.escrow_ledger_entries DISABLE TRIGGER trg_prevent_escrow_ledger_update;

WITH chain AS (
  SELECT e.id,
         SUM(CASE e.entry_type
               WHEN 'escrow_hold'  THEN e.amount
               WHEN 'adjustment'   THEN e.amount
               WHEN 'payout_debit' THEN -e.amount
               WHEN 'refund_debit' THEN -e.amount
               ELSE 0 END)
         OVER (PARTITION BY e.transaction_id ORDER BY e.created_at, e.id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
  FROM public.escrow_ledger_entries e
)
UPDATE public.escrow_ledger_entries t
SET balance_after = c.running
FROM chain c
WHERE t.id = c.id
  AND t.entry_type = 'adjustment'
  AND t.balance_after IS NULL;

ALTER TABLE public.escrow_ledger_entries ENABLE TRIGGER trg_prevent_escrow_ledger_update;

-- Guard: future adjustment entries must always carry a balance.
CREATE OR REPLACE FUNCTION public.enforce_adjustment_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Intent markers (freeze_hold, payout_awaiting_release,
  -- dispute_release_approved_pending_admin_release) are deliberately allowed to
  -- carry a NULL balance_after: they hold no position in the cash chain.
  IF NEW.entry_type = 'adjustment' AND NEW.balance_after IS NULL THEN
    RAISE EXCEPTION 'adjustment_requires_balance_after';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_adjustment_balance_trg ON public.escrow_ledger_entries;
CREATE TRIGGER enforce_adjustment_balance_trg
BEFORE INSERT OR UPDATE ON public.escrow_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_adjustment_balance();

-- ledger_write_guarded must therefore compute and pass the balance for adjustments.
CREATE OR REPLACE FUNCTION public.ledger_write_guarded(
  p_transaction_id uuid,
  p_entry_type public.escrow_ledger_entry_type,
  p_amount numeric,
  p_idempotency_key text,
  p_payload jsonb,
  p_currency text DEFAULT 'NGN',
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Adjustments always carry the resulting canonical balance.
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
$$;