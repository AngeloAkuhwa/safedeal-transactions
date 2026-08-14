DO $$
BEGIN
  -- Financial tables carry append-only delete guards; disable them for this
  -- one-time pre-launch purge, then re-enable.
  ALTER TABLE public.escrow_ledger_entries DISABLE TRIGGER prevent_escrow_ledger_delete;
  ALTER TABLE public.escrow_states DISABLE TRIGGER prevent_escrow_states_delete;
  ALTER TABLE public.payments DISABLE TRIGGER prevent_payments_delete;
  ALTER TABLE public.payouts DISABLE TRIGGER prevent_payouts_delete;
  ALTER TABLE public.refunds DISABLE TRIGGER refunds_prevent_delete;
  ALTER TABLE public.refunds DISABLE TRIGGER prevent_refunds_delete;
  ALTER TABLE public.transaction_completion_confirmations DISABLE TRIGGER prevent_tcc_delete;
  ALTER TABLE public.financial_remediations DISABLE TRIGGER trg_prevent_remediation_mutation;

  -- Preserve audit history, just unlink it from the purged deals.
  UPDATE public.audit_logs SET transaction_id = NULL WHERE transaction_id IS NOT NULL;

  -- Admin surfaces referencing transactions/disputes
  DELETE FROM public.case_reviews;
  DELETE FROM public.admin_transaction_notes;
  DELETE FROM public.admin_investigations;
  DELETE FROM public.admin_actions WHERE transaction_id IS NOT NULL OR dispute_id IS NOT NULL;

  -- Orchestration
  DELETE FROM public.task_comments;
  DELETE FROM public.task_status_history;
  DELETE FROM public.task_assignment_history;
  DELETE FROM public.orchestration_events;
  DELETE FROM public.orchestration_tasks;
  DELETE FROM public.orchestration_notification_dedupe;

  -- Notifications tied to transactions
  DELETE FROM public.notification_deliveries
   WHERE notification_id IN (SELECT id FROM public.notifications WHERE related_transaction_id IS NOT NULL);
  DELETE FROM public.notifications WHERE related_transaction_id IS NOT NULL;

  -- Financial / reconciliation
  DELETE FROM public.financial_remediations;
  DELETE FROM public.financial_idempotency_conflicts;
  DELETE FROM public.escrow_reconciliation_results;
  DELETE FROM public.release_review_queue;
  DELETE FROM public.money_status_history;
  DELETE FROM public.escrow_ledger_entries;
  DELETE FROM public.escrow_states;

  -- Money movement
  DELETE FROM public.refunds;
  DELETE FROM public.payouts;
  DELETE FROM public.payment_webhook_logs;

  -- Disputes
  DELETE FROM public.dispute_evidence;
  DELETE FROM public.dispute_responses;
  DELETE FROM public.dispute_outcomes;
  DELETE FROM public.dispute_status_history;
  DELETE FROM public.disputes;

  -- Delivery
  DELETE FROM public.delivery_proof_files;
  DELETE FROM public.delivery_updates;
  DELETE FROM public.delivery_tracking_details;
  DELETE FROM public.delivery_confirmations;
  DELETE FROM public.delivery_confirmation_tokens;

  -- Transaction children
  DELETE FROM public.transaction_completion_confirmations;
  DELETE FROM public.transaction_agreement_snapshots;
  DELETE FROM public.transaction_delivery_terms;
  DELETE FROM public.transaction_status_history;
  DELETE FROM public.transaction_events;
  DELETE FROM public.transaction_messages;
  DELETE FROM public.transaction_notes;
  DELETE FROM public.transaction_media;
  DELETE FROM public.transaction_links;
  DELETE FROM public.transaction_participants;
  DELETE FROM public.transaction_pricing;
  DELETE FROM public.transaction_items;

  -- Checkout + payments + transactions
  DELETE FROM public.checkout_session_items;
  DELETE FROM public.payments;
  DELETE FROM public.transactions;
  DELETE FROM public.checkout_sessions;
  DELETE FROM public.cart_items;

  ALTER TABLE public.escrow_ledger_entries ENABLE TRIGGER prevent_escrow_ledger_delete;
  ALTER TABLE public.escrow_states ENABLE TRIGGER prevent_escrow_states_delete;
  ALTER TABLE public.payments ENABLE TRIGGER prevent_payments_delete;
  ALTER TABLE public.payouts ENABLE TRIGGER prevent_payouts_delete;
  ALTER TABLE public.refunds ENABLE TRIGGER refunds_prevent_delete;
  ALTER TABLE public.refunds ENABLE TRIGGER prevent_refunds_delete;
  ALTER TABLE public.transaction_completion_confirmations ENABLE TRIGGER prevent_tcc_delete;
  ALTER TABLE public.financial_remediations ENABLE TRIGGER trg_prevent_remediation_mutation;
END $$;