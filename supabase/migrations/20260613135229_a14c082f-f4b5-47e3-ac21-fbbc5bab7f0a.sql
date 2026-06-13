-- Phase 7 — Final pricing cleanup.

-- Step 1: backfill canonical from legacy values for historical rows.
ALTER TABLE public.transaction_pricing DISABLE TRIGGER trg_prevent_pricing_edit_after_lock;
ALTER TABLE public.transaction_pricing DISABLE TRIGGER trg_prevent_pricing_update;

UPDATE public.transaction_pricing
SET
  payment_processing_fee_amount = COALESCE(payment_processing_fee_amount, processing_fee_amount),
  seller_payout_amount          = COALESCE(seller_payout_amount, seller_net_amount),
  pricing_model_version         = COALESCE(pricing_model_version, 'NG_MVP_TOTAL_SERVICE_FEE_CAP_2500_V1')
WHERE
  payment_processing_fee_amount IS NULL
  OR seller_payout_amount IS NULL
  OR pricing_model_version IS NULL;

ALTER TABLE public.transaction_pricing ENABLE TRIGGER trg_prevent_pricing_edit_after_lock;
ALTER TABLE public.transaction_pricing ENABLE TRIGGER trg_prevent_pricing_update;

-- Step 2: pre-flight assertion.
DO $$
DECLARE
  bad_count BIGINT;
BEGIN
  SELECT count(*) INTO bad_count
  FROM public.transactions t
  LEFT JOIN public.transaction_pricing tp ON tp.transaction_id = t.id
  WHERE t.money_status NOT IN ('not_secured','payment_pending')
    AND (
      tp.transaction_id IS NULL
      OR tp.payment_processing_fee_amount IS NULL
      OR tp.seller_payout_amount IS NULL
      OR tp.buyer_total_amount IS NULL
      OR tp.platform_fee_amount IS NULL
      OR tp.pricing_model_version IS NULL
    );

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'Phase 7 aborted after backfill: % post-payment transactions still lack a canonical pricing snapshot.',
      bad_count;
  END IF;
END$$;

-- Step 3: tighten canonical columns.
ALTER TABLE public.transaction_pricing
  ALTER COLUMN payment_processing_fee_amount SET NOT NULL,
  ALTER COLUMN seller_payout_amount          SET NOT NULL,
  ALTER COLUMN buyer_total_amount            SET NOT NULL,
  ALTER COLUMN platform_fee_amount           SET NOT NULL,
  ALTER COLUMN pricing_model_version         SET NOT NULL;

-- Step 4: recreate dependent view using canonical column.
DROP VIEW IF EXISTS public.seller_transactions_view;
CREATE VIEW public.seller_transactions_view
WITH (security_invoker = on) AS
SELECT t.id,
       t.transaction_code,
       t.status,
       t.money_status,
       t.dispute_status,
       t.created_at,
       t.delivered_at,
       t.completed_at,
       tp.item_amount,
       tp.seller_payout_amount,
       tp.currency_code
FROM public.transactions t
LEFT JOIN public.transaction_pricing tp ON tp.transaction_id = t.id
WHERE t.seller_id = auth.uid();

GRANT SELECT ON public.seller_transactions_view TO authenticated;

-- Step 5: refresh coverage + audit views (now legacy-bucket-free).
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
    ELSE 'snapshot_missing'
  END AS snapshot_state
FROM public.transactions t
LEFT JOIN public.transaction_pricing tp ON tp.transaction_id = t.id
WHERE t.money_status NOT IN ('not_secured','payment_pending');

GRANT SELECT ON public.v_pricing_snapshot_audit TO authenticated;

-- Step 6: drop legacy columns.
ALTER TABLE public.transaction_pricing
  DROP COLUMN IF EXISTS processing_fee_amount,
  DROP COLUMN IF EXISTS seller_net_amount;