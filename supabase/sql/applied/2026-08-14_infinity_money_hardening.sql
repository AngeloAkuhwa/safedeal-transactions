-- ============================================================================
-- Infinity/NaN money hardening, money-column CHECK constraints, property-based
-- positional-binding rule, and the two amount-taking RPCs left outside the class.
-- ============================================================================

-- 1. One finiteness predicate, used by every amount validation.
--    NaN is excluded because NaN < 'Infinity' is false in Postgres ordering.
CREATE OR REPLACE FUNCTION public.is_finite_money(p_amount numeric)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT p_amount IS NOT NULL
     AND p_amount > '-Infinity'::numeric
     AND p_amount < 'Infinity'::numeric;
$fn$;

-- 2. CHECK constraints on every money column. Written with literal comparisons
--    rather than the helper so the constraint survives function drift.
ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS refunds_refund_amount_positive;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_refund_amount_positive
  CHECK (refund_amount > 0 AND refund_amount < 'Infinity'::numeric);

ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS payouts_amount_finite_positive;
ALTER TABLE public.payouts ADD CONSTRAINT payouts_amount_finite_positive
  CHECK (amount > 0 AND amount < 'Infinity'::numeric);

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_amount_finite_positive;
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_finite_positive
  CHECK (amount > 0 AND amount < 'Infinity'::numeric);

-- Ledger amounts are signed on purpose (reversal adjustments are negative),
-- so only NaN and both infinities are excluded.
ALTER TABLE public.escrow_ledger_entries DROP CONSTRAINT IF EXISTS escrow_ledger_entries_amount_finite;
ALTER TABLE public.escrow_ledger_entries ADD CONSTRAINT escrow_ledger_entries_amount_finite
  CHECK (amount > '-Infinity'::numeric AND amount < 'Infinity'::numeric);

-- 2b. An orchestration task may legitimately carry no amount; when it carries
--     one it must state its own currency instead of inheriting an invented NGN.
ALTER TABLE public.orchestration_tasks ALTER COLUMN currency DROP NOT NULL;
ALTER TABLE public.orchestration_tasks DROP CONSTRAINT IF EXISTS orchestration_tasks_amount_needs_currency;
ALTER TABLE public.orchestration_tasks ADD CONSTRAINT orchestration_tasks_amount_needs_currency
  CHECK (amount IS NULL OR (currency IS NOT NULL AND btrim(currency) <> ''));
ALTER TABLE public.orchestration_tasks DROP CONSTRAINT IF EXISTS orchestration_tasks_amount_finite;
ALTER TABLE public.orchestration_tasks ADD CONSTRAINT orchestration_tasks_amount_finite
  CHECK (amount IS NULL OR (amount >= 0 AND amount < 'Infinity'::numeric));

-- 3. The escrow balance helpers bind each other by name.
CREATE OR REPLACE FUNCTION public.escrow_uncommitted_available(
  _transaction_id uuid, _exclude_payout_id uuid DEFAULT NULL::uuid, _exclude_refund_id uuid DEFAULT NULL::uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT public.escrow_available_balance(_transaction_id := _transaction_id)
       - public.escrow_open_commitments(
           _transaction_id    := _transaction_id,
           _exclude_payout_id := _exclude_payout_id,
           _exclude_refund_id := _exclude_refund_id);
$fn$;

-- 4. Class rewrite: every NaN-only guard becomes a finiteness guard, and every
--    escrow-helper call is bound by name.
DO $do$
DECLARE r record; s text; s0 text; n int := 0;
BEGIN
  FOR r IN
    SELECT * FROM (
      SELECT p.oid, p.proname
        FROM pg_proc p JOIN pg_namespace nm ON nm.oid = p.pronamespace
       WHERE nm.nspname = 'public' AND p.prokind = 'f'
         AND p.proname NOT IN ('is_finite_money','escrow_available_balance','escrow_canonical_balance',
                               'escrow_open_commitments','escrow_uncommitted_available')
         AND pg_get_functiondef(p.oid) ~ '''NaN''::numeric|public\.escrow_(available_balance|canonical_balance|open_commitments|uncommitted_available)\('
      ORDER BY p.proname
    ) q
  LOOP
    s0 := pg_get_functiondef(r.oid);
    s  := s0;
    s := regexp_replace(s, '(\m[a-z_][a-z0-9_]*) = ''NaN''::numeric', 'NOT public.is_finite_money(\1)', 'g');
    s := regexp_replace(s,
      'public\.escrow_uncommitted_available\(\s*(?!\w+\s*:=)([^,()]+?)\s*,\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)',
      'public.escrow_uncommitted_available(_transaction_id := \1, _exclude_payout_id := \2, _exclude_refund_id := \3)', 'g');
    s := regexp_replace(s,
      'public\.escrow_open_commitments\(\s*(?!\w+\s*:=)([^,()]+?)\s*,\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)',
      'public.escrow_open_commitments(_transaction_id := \1, _exclude_payout_id := \2, _exclude_refund_id := \3)', 'g');
    s := regexp_replace(s, 'public\.escrow_available_balance\(\s*(?!\w+\s*:=)([^,()]+?)\s*\)',
      'public.escrow_available_balance(_transaction_id := \1)', 'g');
    s := regexp_replace(s, 'public\.escrow_canonical_balance\(\s*(?!\w+\s*:=)([^,()]+?)\s*\)',
      'public.escrow_canonical_balance(_transaction_id := \1)', 'g');
    IF s <> s0 THEN EXECUTE s; n := n + 1; END IF;
  END LOOP;
  RAISE NOTICE 'money guard/binding rewrite touched % functions', n;
END $do$;

-- 5. Targeted structural edits.
DO $do$
DECLARE s text; s0 text; v_oid oid;
  v_missing CONSTANT text := 'expected function body shape not found: ';
BEGIN
  -- 5a. complete_refund_atomic validates before it writes.
  SELECT oid INTO v_oid FROM pg_proc WHERE proname = 'complete_refund_atomic'
    AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;
  s := replace(s,
'  IF v_amount IS NULL OR NOT public.is_finite_money(v_amount) OR v_amount <= 0 THEN
    RAISE EXCEPTION ''invalid_refund_amount:%'', v_amount;
  END IF;
  IF v_currency IS NULL OR btrim(v_currency) = '''' THEN
    RAISE EXCEPTION ''pricing_snapshot_missing_currency:%'', v_tx_id;
  END IF;

', '');
  s := replace(s,
'  IF v_tx_id IS NULL THEN RAISE EXCEPTION ''refund_not_found''; END IF;',
'  IF v_tx_id IS NULL THEN RAISE EXCEPTION ''refund_not_found''; END IF;

  -- Validate before any write. Rollback would make a late check fail-closed in
  -- effect, but the amount and currency of a refund are preconditions, not
  -- afterthoughts.
  IF v_amount IS NULL OR NOT public.is_finite_money(v_amount) OR v_amount <= 0
     OR v_amount <> round(v_amount, 2) THEN
    RAISE EXCEPTION ''invalid_refund_amount:%'', v_amount;
  END IF;
  IF v_currency IS NULL OR btrim(v_currency) = '''' THEN
    RAISE EXCEPTION ''pricing_snapshot_missing_currency:%'', v_tx_id;
  END IF;');
  IF s = s0 THEN RAISE EXCEPTION '%complete_refund_atomic', v_missing; END IF;
  EXECUTE s;

  -- 5b. reverse_payout_atomic gets a ceiling: a reversal can never exceed the
  --     payout it reverses.
  SELECT oid INTO v_oid FROM pg_proc WHERE proname = 'reverse_payout_atomic'
    AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;
  s := replace(s, '  v_escrow_rows int;', '  v_escrow_rows int; v_payout_amount numeric;');
  s := replace(s,
'  SELECT transaction_id, currency_code, status INTO v_tx_id, v_currency, v_status
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;',
'  SELECT transaction_id, currency_code, status, amount
    INTO v_tx_id, v_currency, v_status, v_payout_amount
  FROM public.payouts WHERE id = p_payout_id FOR UPDATE;');
  s := replace(s,
'  UPDATE public.payouts
  SET status = ''reversed''::payout_status,',
'  -- A reversal is bounded by the payout it reverses. Without this the ledger
  -- takes an unbounded negative adjustment, and the ledger is append-only.
  IF NOT public.is_finite_money(v_payout_amount) OR v_payout_amount <= 0 THEN
    RAISE EXCEPTION ''invalid_reversal_amount:payout_amount=%'', v_payout_amount;
  END IF;
  IF p_amount > v_payout_amount + 0.005 THEN
    RAISE EXCEPTION ''reversal_exceeds_payout_amount: payout=% requested=%'', v_payout_amount, p_amount;
  END IF;

  UPDATE public.payouts
  SET status = ''reversed''::payout_status,');
  IF s = s0 THEN RAISE EXCEPTION '%reverse_payout_atomic', v_missing; END IF;
  EXECUTE s;

  -- 5c. admin_correct_pricing joins the class: NaN and Infinity are refused,
  --     and amounts must be kobo-scaled.
  SELECT oid INTO v_oid FROM pg_proc WHERE proname = 'admin_correct_pricing'
    AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;
  s := replace(s,
'  IF p_item_amount < 0 OR p_safedeal_fee < 0 OR p_processing_fee < 0 THEN
    RAISE EXCEPTION ''invalid_amounts'' USING ERRCODE = ''22023'';
  END IF;',
'  -- NaN compares greater than every numeric, so a bare "< 0" test passes it
  -- straight into the pricing snapshot. Finiteness and scale are checked first.
  IF NOT public.is_finite_money(p_item_amount)
     OR NOT public.is_finite_money(p_safedeal_fee)
     OR NOT public.is_finite_money(p_processing_fee) THEN
    RAISE EXCEPTION ''invalid_money_amount:% % %'', p_item_amount, p_safedeal_fee, p_processing_fee
      USING ERRCODE = ''22023'';
  END IF;
  IF p_item_amount <> round(p_item_amount, 2)
     OR p_safedeal_fee <> round(p_safedeal_fee, 2)
     OR p_processing_fee <> round(p_processing_fee, 2) THEN
    RAISE EXCEPTION ''invalid_money_amount:unscaled'' USING ERRCODE = ''22023'';
  END IF;
  IF p_item_amount < 0 OR p_safedeal_fee < 0 OR p_processing_fee < 0 THEN
    RAISE EXCEPTION ''invalid_money_amount:negative'' USING ERRCODE = ''22023'';
  END IF;');
  IF s = s0 THEN RAISE EXCEPTION '%admin_correct_pricing', v_missing; END IF;
  EXECUTE s;

  -- 5d. create_orchestration_task validates its amount and stops inventing NGN.
  SELECT oid INTO v_oid FROM pg_proc WHERE proname = 'create_orchestration_task'
    AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;
  s := replace(s, 'COALESCE(_currency,''NGN'')', '_currency');
  s := replace(s,
'  IF _source_event_key IS NOT NULL THEN',
'  -- A task carries an amount into an admin queue, so it is money and is
  -- validated like money. A stated amount must state its own currency.
  IF _amount IS NOT NULL THEN
    IF NOT public.is_finite_money(_amount) OR _amount < 0 OR _amount <> round(_amount, 2) THEN
      RAISE EXCEPTION ''invalid_money_amount:%'', _amount;
    END IF;
    IF _currency IS NULL OR btrim(_currency) = '''' THEN
      RAISE EXCEPTION ''task_currency_missing'';
    END IF;
  END IF;

  IF _source_event_key IS NOT NULL THEN');
  IF s = s0 THEN RAISE EXCEPTION '%create_orchestration_task', v_missing; END IF;
  EXECUTE s;

  -- 5e. The last two positional bindings of a SECURITY DEFINER money function.
  SELECT oid INTO v_oid FROM pg_proc WHERE proname = 'ensure_delivery_terms_on_lock'
    AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;
  s := replace(s,
'        PERFORM public.flag_for_release_review(
          NEW.id,
          ''manual_hold'',
          NULL,',
'        PERFORM public.flag_for_release_review(
          p_transaction_id := NEW.id,
          p_reason         := ''manual_hold'',
          p_actor_user_id  := NULL,
          p_notes          :=');
  IF s = s0 THEN RAISE EXCEPTION '%ensure_delivery_terms_on_lock', v_missing; END IF;
  EXECUTE s;

  SELECT oid INTO v_oid FROM pg_proc WHERE proname = 'admin_financial_reconciliation_summary'
    AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;
  s := replace(s, 'public.admin_financial_reconciliation(_since, false)',
                  'public.admin_financial_reconciliation(_since := _since, _only_issues := false)');
  IF s = s0 THEN RAISE EXCEPTION '%admin_financial_reconciliation_summary', v_missing; END IF;
  EXECUTE s;
END $do$;
