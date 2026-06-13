
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'escrow_reconciliation_status') THEN
    CREATE TYPE public.escrow_reconciliation_status AS ENUM (
      'ok','drift','missing_ledger','missing_pricing'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.escrow_reconciliation_results (
  id                       UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id           UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  run_id                   UUID NOT NULL,
  run_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  paystack_collected       NUMERIC(14,2) NOT NULL DEFAULT 0,
  paystack_paid_out        NUMERIC(14,2) NOT NULL DEFAULT 0,
  paystack_refunded        NUMERIC(14,2) NOT NULL DEFAULT 0,
  ledger_balance           NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_ledger_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
  delta                    NUMERIC(14,2) NOT NULL DEFAULT 0,
  status                   public.escrow_reconciliation_status NOT NULL,
  detail                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, run_id)
);

GRANT SELECT ON public.escrow_reconciliation_results TO authenticated;
GRANT ALL    ON public.escrow_reconciliation_results TO service_role;

ALTER TABLE public.escrow_reconciliation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read reconciliation results"
  ON public.escrow_reconciliation_results;
CREATE POLICY "Admins can read reconciliation results"
  ON public.escrow_reconciliation_results
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.user_role_type));

CREATE INDEX IF NOT EXISTS escrow_recon_tx_run_idx
  ON public.escrow_reconciliation_results (transaction_id, run_at DESC);
CREATE INDEX IF NOT EXISTS escrow_recon_status_open_idx
  ON public.escrow_reconciliation_results (run_at DESC) WHERE status <> 'ok';
CREATE INDEX IF NOT EXISTS escrow_recon_run_idx
  ON public.escrow_reconciliation_results (run_id);

CREATE OR REPLACE VIEW public.v_pricing_snapshot_coverage
WITH (security_invoker = on) AS
WITH base AS (
  SELECT
    t.id AS transaction_id,
    t.money_status,
    t.created_at,
    CASE
      WHEN tp.transaction_id IS NULL THEN 'snapshot_missing'
      WHEN tp.item_amount IS NOT NULL
       AND tp.platform_fee_amount IS NOT NULL
       AND tp.payment_processing_fee_amount IS NOT NULL
       AND tp.seller_payout_amount IS NOT NULL
       AND tp.buyer_total_amount IS NOT NULL
       AND tp.pricing_model_version IS NOT NULL
        THEN 'snapshot_complete'
      WHEN tp.processing_fee_amount IS NOT NULL
        OR tp.seller_net_amount IS NOT NULL
        THEN 'snapshot_legacy'
      ELSE 'snapshot_missing'
    END AS snapshot_state
  FROM public.transactions t
  LEFT JOIN public.transaction_pricing tp ON tp.transaction_id = t.id
  WHERE t.money_status NOT IN ('not_secured','payment_pending')
)
SELECT
  snapshot_state,
  COUNT(*) AS total_count,
  COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '30 days') AS last_30d_count,
  COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '90 days') AS last_90d_count
FROM base
GROUP BY snapshot_state;

GRANT SELECT ON public.v_pricing_snapshot_coverage TO authenticated;

CREATE OR REPLACE VIEW public.v_pricing_snapshot_audit
WITH (security_invoker = on) AS
SELECT
  t.id AS transaction_id,
  t.transaction_code,
  t.money_status,
  t.created_at,
  tp.pricing_model_version,
  CASE
    WHEN tp.transaction_id IS NULL THEN 'snapshot_missing'
    WHEN tp.item_amount IS NOT NULL
     AND tp.platform_fee_amount IS NOT NULL
     AND tp.payment_processing_fee_amount IS NOT NULL
     AND tp.seller_payout_amount IS NOT NULL
     AND tp.buyer_total_amount IS NOT NULL
     AND tp.pricing_model_version IS NOT NULL
      THEN 'snapshot_complete'
    WHEN tp.processing_fee_amount IS NOT NULL
      OR tp.seller_net_amount IS NOT NULL
      THEN 'snapshot_legacy'
    ELSE 'snapshot_missing'
  END AS snapshot_state
FROM public.transactions t
LEFT JOIN public.transaction_pricing tp ON tp.transaction_id = t.id
WHERE t.money_status NOT IN ('not_secured','payment_pending');

GRANT SELECT ON public.v_pricing_snapshot_audit TO authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-escrow-hourly') THEN
    PERFORM cron.unschedule('reconcile-escrow-hourly');
  END IF;
END$$;

SELECT cron.schedule(
  'reconcile-escrow-hourly',
  '7 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://cfkdasmhlqswpunugbkf.supabase.co/functions/v1/reconcile-escrow',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNma2Rhc21obHFzd3B1bnVnYmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NTIyNTUsImV4cCI6MjA4ODUyODI1NX0.9DZJt5KXs5v6A_end4Xi6x57sRR-qIAmbJTHgHkqMrE","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNma2Rhc21obHFzd3B1bnVnYmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NTIyNTUsImV4cCI6MjA4ODUyODI1NX0.9DZJt5KXs5v6A_end4Xi6x57sRR-qIAmbJTHgHkqMrE"}'::jsonb,
    body := jsonb_build_object('source','pg_cron','triggered_at', now())
  );
  $cron$
);
