CREATE OR REPLACE FUNCTION public.recompute_needs_admin_review(p_tx_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active boolean;
BEGIN
  SELECT
       EXISTS (
         SELECT 1 FROM public.disputes
          WHERE transaction_id = p_tx_id
            AND status IN ('open','seller_response_pending','under_review','escalated')
       )
    OR EXISTS (
         SELECT 1 FROM public.admin_investigations
          WHERE transaction_id = p_tx_id
            AND resolved_at IS NULL
            AND status::text IN ('open','in_progress','investigating')
       )
    OR EXISTS (
         SELECT 1 FROM public.transactions
          WHERE id = p_tx_id
            AND money_status = 'funds_frozen'
       )
    OR EXISTS (
         SELECT 1 FROM public.release_review_queue
          WHERE transaction_id = p_tx_id
            AND status IN ('pending','claimed','processing','awaiting_info','held')
       )
  INTO v_active;

  UPDATE public.transactions
     SET needs_admin_review = COALESCE(v_active, false)
   WHERE id = p_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_needs_admin_review(uuid) TO service_role;