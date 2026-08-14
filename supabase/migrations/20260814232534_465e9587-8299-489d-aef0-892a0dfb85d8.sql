DO $do$
DECLARE s text; s0 text; v_oid oid;
BEGIN
  SELECT oid INTO v_oid FROM pg_proc
   WHERE proname = 'selftest_refund_rail'
     AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;
  s := replace(s,
    'AND p.pronargs > 1
         AND pg_get_functiondef(p.oid) ~
             ''\m(escrow_ledger_entries|escrow_states|payouts|refunds|payments|transaction_pricing)\M''',
    'AND (
           pg_get_functiondef(p.oid) ~
             ''\m(escrow_ledger_entries|escrow_states|payouts|refunds|payments|transaction_pricing|dispute_outcomes|financial_remediations)\M''
           OR p.proname IN (''escrow_available_balance'', ''escrow_uncommitted_available'',
                            ''escrow_open_commitments'', ''escrow_canonical_balance'')
         )');
  IF s = s0 THEN
    RAISE EXCEPTION 'selftest_refund_rail: argument-count filter shape not found';
  END IF;
  EXECUTE s;
END $do$;