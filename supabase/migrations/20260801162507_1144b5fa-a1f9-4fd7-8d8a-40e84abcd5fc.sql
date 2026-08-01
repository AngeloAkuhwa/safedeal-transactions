-- Correction 1 / Phase 2: least-privilege EXECUTE boundary for financial routines.
-- Forward-only, transactional. No data changes.

DO $$
DECLARE
  fn text;
  backend_only text[] := ARRAY[
    -- value-moving / state-changing
    'public.release_payout_atomic(uuid,uuid,uuid,text)',
    'public.complete_payout_atomic(uuid,numeric,text)',
    'public.fail_payout_atomic(uuid,text,integer)',
    'public.retry_payout_atomic(uuid,uuid,text)',
    'public.reverse_payout_atomic(uuid,numeric,text,text)',
    'public.start_refund_atomic(uuid,numeric,uuid,text,text)',
    'public.complete_refund_atomic(uuid,text)',
    'public.fail_refund_atomic(uuid,text)',
    'public.freeze_funds_atomic(uuid,uuid,text)',
    'public.unfreeze_funds_atomic(uuid,uuid,money_status,text)',
    'public.flag_for_release_review(uuid,text,uuid,text)',
    'public.record_payment_capture_atomic(uuid,text,jsonb)',
    'public.record_completion_release_intent_atomic(uuid,uuid,uuid,uuid,numeric,text,escrow_ledger_entry_type,text)',
    'public.resolve_dispute_atomic(uuid,uuid,dispute_outcome_type,numeric,numeric,text,boolean)',
    'public.resolve_dispute_atomic(uuid,uuid,dispute_outcome_type,numeric,numeric,text,boolean,boolean)',
    'public.dispute_request_more_info_atomic(uuid,uuid,timestamptz,text)',
    -- ledger write boundary
    'public.ledger_write_guarded(uuid,escrow_ledger_entry_type,numeric,text,text,uuid,text,uuid,jsonb,text,jsonb,uuid)',
    -- leases
    'public.acquire_job_lease(text,text,integer)',
    'public.heartbeat_job_lease(text,uuid,integer)',
    'public.release_job_lease(text,uuid)',
    'public.financial_lease_ttl_seconds()',
    -- backend-only financial read helpers
    'public.escrow_available_balance(uuid)',
    'public.escrow_open_commitments(uuid,uuid,uuid)',
    'public.escrow_uncommitted_available(uuid,uuid,uuid)',
    'public.admin_financial_reconciliation(timestamptz,boolean)',
    'public.admin_financial_reconciliation_summary(timestamptz)',
    'public.admin_escrow_kpis()',
    'public.admin_escrow_records_page(text,text,text,integer,integer,text,text)',
    'public.admin_escrow_ledger_daily_trend(integer)',
    'public.admin_payout_health(timestamptz,timestamptz)',
    'public.admin_reconciliation_mismatches(timestamptz)',
    'public.admin_orphan_completed_payouts(timestamptz)',
    'public.admin_duplicate_ledger_entries(timestamptz)'
  ];
BEGIN
  FOREACH fn IN ARRAY backend_only LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- Trigger-only functions must never be directly invocable.
REVOKE ALL ON FUNCTION public.escrow_ledger_require_idem() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_payout_verified() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.track_auto_release_toggle() FROM PUBLIC, anon, authenticated;

-- Re-assert the ledger DML boundary (including TRUNCATE).
REVOKE ALL ON TABLE public.escrow_ledger_entries FROM anon;
REVOKE ALL ON TABLE public.escrow_ledger_entries FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.escrow_ledger_entries FROM service_role;
GRANT SELECT ON TABLE public.escrow_ledger_entries TO service_role;