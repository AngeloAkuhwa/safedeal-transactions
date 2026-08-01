-- Containment completion: sandbox_exec (tooling role) must have no direct
-- ledger DML and no executable money-mutating routine.
REVOKE INSERT ON public.escrow_ledger_entries FROM sandbox_exec;

DO $$
DECLARE
  r record;
  mutating text[] := ARRAY[
    'acquire_job_lease','heartbeat_job_lease','release_job_lease',
    'admin_correct_pricing','apply_financial_remediation_atomic',
    'complete_payout_atomic','complete_refund_atomic',
    'fail_payout_atomic','fail_refund_atomic',
    'freeze_funds_atomic','unfreeze_funds_atomic',
    'ledger_write_guarded','record_completion_release_intent_atomic',
    'release_payout_atomic','retry_payout_atomic','reverse_payout_atomic',
    'start_refund_atomic','flag_for_release_review',
    'trigger_reconcile_escrow','verify_reconcile_cron_secret',
    'release_expired_awaiting_payment','reconcile_all_product_reservations'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(mutating)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, sandbox_exec', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;