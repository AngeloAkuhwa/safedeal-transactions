-- 1. New fine-grained finance permissions
INSERT INTO public.permissions (key, module, action, label, description, risk_level, is_system_default, status)
VALUES
  ('payouts.release', 'payouts', 'release', 'Payouts — Release Funds', 'Execute a seller payout (moves real money).', 'critical', true, 'active'),
  ('refunds.issue', 'refunds', 'issue', 'Refunds — Issue Refund', 'Execute a buyer refund (moves real money).', 'critical', true, 'active'),
  ('release_review.view', 'release_review', 'view', 'Release Review — View', 'View the release review queue.', 'low', true, 'active'),
  ('release_review.flag', 'release_review', 'flag', 'Release Review — Flag', 'Flag a transaction for release review.', 'high', true, 'active'),
  ('release_review.resolve', 'release_review', 'resolve', 'Release Review — Resolve', 'Resolve a release review (may release or refund funds).', 'critical', true, 'active')
ON CONFLICT (key) DO UPDATE
  SET module = EXCLUDED.module,
      action = EXCLUDED.action,
      label = EXCLUDED.label,
      risk_level = EXCLUDED.risk_level,
      status = 'active';

-- 2. Grants: money-movement keys go ONLY to finance roles + super_admin.
INSERT INTO public.role_permissions (role_key, permission_key)
SELECT r.role_key, p.permission_key
FROM (VALUES ('super_admin'), ('finance_operator'), ('finance_approver')) AS r(role_key)
CROSS JOIN (VALUES ('payouts.release'), ('refunds.issue'), ('release_review.flag'), ('release_review.resolve'), ('release_review.view')) AS p(permission_key)
ON CONFLICT DO NOTHING;

-- Read-only visibility of the queue for oversight roles (no money movement).
INSERT INTO public.role_permissions (role_key, permission_key)
SELECT r.role_key, 'release_review.view'
FROM (VALUES ('senior_admin'), ('compliance_officer'), ('auditor')) AS r(role_key)
ON CONFLICT DO NOTHING;

-- 3. Record who flagged a release review (maker-checker initiator).
ALTER TABLE public.release_review_queue
  ADD COLUMN IF NOT EXISTS flagged_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.flag_for_release_review(p_transaction_id uuid, p_reason text, p_actor_user_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_queue_type text;
  v_queue_id uuid;
  v_seller uuid;
  v_payout uuid;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  v_queue_type := CASE p_reason
    WHEN 'missing_seller_confirmation' THEN 'stuck'
    WHEN 'missing_buyer_confirmation' THEN 'stuck'
    WHEN 'stuck_confirmation' THEN 'stuck'
    WHEN 'payout_account_missing' THEN 'payout_account_missing'
    WHEN 'pricing_missing' THEN 'pricing_missing'
    WHEN 'silent_dispute' THEN 'silent_dispute'
    WHEN 'failed_payout' THEN 'failed_payout'
    WHEN 'refund_request' THEN 'refund_request'
    WHEN 'transfer_reversed' THEN 'transfer_reversed'
    WHEN 'manual_hold' THEN 'manual_hold'
    WHEN 'delivery_proof_missing' THEN 'delivery_proof_missing'
    WHEN 'suspicious_activity' THEN 'suspicious_activity'
    ELSE p_reason
  END;

  UPDATE public.transactions
     SET needs_release_review = true,
         release_review_reason = p_reason,
         updated_at = now()
   WHERE id = p_transaction_id
   RETURNING seller_id INTO v_seller;

  IF v_seller IS NULL THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  SELECT id INTO v_payout
    FROM public.payouts
   WHERE transaction_id = p_transaction_id
   ORDER BY created_at DESC
   LIMIT 1;

  INSERT INTO public.release_review_queue (
    transaction_id, payout_id, seller_id, queue_type, status, notes, entered_queue_at, flagged_by_user_id
  ) VALUES (
    p_transaction_id, v_payout, v_seller, v_queue_type, 'pending', p_notes, now(), p_actor_user_id
  )
  ON CONFLICT (transaction_id, queue_type) WHERE status = ANY (ARRAY['pending'::text,'claimed'::text,'processing'::text,'awaiting_info'::text,'held'::text])
  DO UPDATE SET
    notes = COALESCE(EXCLUDED.notes, public.release_review_queue.notes),
    payout_id = COALESCE(EXCLUDED.payout_id, public.release_review_queue.payout_id),
    -- initiator is sticky: the FIRST person to flag stays the maker
    flagged_by_user_id = COALESCE(public.release_review_queue.flagged_by_user_id, EXCLUDED.flagged_by_user_id)
  RETURNING id INTO v_queue_id;

  INSERT INTO public.admin_actions (admin_user_id, transaction_id, action_type, action_notes)
  VALUES (p_actor_user_id, p_transaction_id, 'escalate_case', COALESCE(p_notes, p_reason));

  RETURN v_queue_id;
END;
$function$;

-- 4. Maker-checker platform setting (OFF by default).
INSERT INTO public.system_settings (setting_key, setting_value, scope, is_overridable)
VALUES ('finance.maker_checker_enforced', 'false'::jsonb, 'platform', false)
ON CONFLICT DO NOTHING;