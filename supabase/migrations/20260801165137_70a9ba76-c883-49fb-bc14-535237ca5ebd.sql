REVOKE ALL ON FUNCTION public.prevent_escrow_ledger_update() FROM PUBLIC, anon, authenticated, sandbox_exec;

-- Rollback-only proof that the append-only guards hold for the table owner.
DO $$
DECLARE
  v_id uuid;
  v_blocked_update boolean := false;
  v_blocked_delete boolean := false;
BEGIN
  SELECT id INTO v_id FROM public.escrow_ledger_entries LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'ledger empty - guard test skipped';
    RETURN;
  END IF;

  BEGIN
    UPDATE public.escrow_ledger_entries SET notes = notes WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    v_blocked_update := true;
  END;

  BEGIN
    DELETE FROM public.escrow_ledger_entries WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    v_blocked_delete := true;
  END;

  IF NOT v_blocked_update THEN
    RAISE EXCEPTION 'GUARD FAILURE: ledger UPDATE was not blocked';
  END IF;
  IF NOT v_blocked_delete THEN
    RAISE EXCEPTION 'GUARD FAILURE: ledger DELETE was not blocked';
  END IF;
  RAISE NOTICE 'ledger append-only guards verified';
END$$;