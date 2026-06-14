
-- Helper: derive a user_id from transaction_id (or dispute_id), prefer seller
CREATE OR REPLACE FUNCTION public.derive_target_user_id(p_transaction_id uuid, p_dispute_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_tx_id uuid := p_transaction_id;
BEGIN
  IF v_tx_id IS NULL AND p_dispute_id IS NOT NULL THEN
    SELECT transaction_id INTO v_tx_id FROM public.disputes WHERE id = p_dispute_id;
  END IF;
  IF v_tx_id IS NOT NULL THEN
    SELECT seller_id INTO v_user_id FROM public.transactions WHERE id = v_tx_id;
  END IF;
  RETURN v_user_id;
END;
$$;

-- Trigger: auto-populate target_user_id on admin_actions
CREATE OR REPLACE FUNCTION public.admin_actions_set_target_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.target_user_id IS NULL THEN
    NEW.target_user_id := public.derive_target_user_id(NEW.transaction_id, NEW.dispute_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_actions_set_target_user_trg ON public.admin_actions;
CREATE TRIGGER admin_actions_set_target_user_trg
BEFORE INSERT ON public.admin_actions
FOR EACH ROW EXECUTE FUNCTION public.admin_actions_set_target_user();

-- Trigger: auto-populate target_user_id on audit_logs
CREATE OR REPLACE FUNCTION public.audit_logs_set_target_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.target_user_id IS NULL THEN
    NEW.target_user_id := public.derive_target_user_id(NEW.transaction_id, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_set_target_user_trg ON public.audit_logs;
CREATE TRIGGER audit_logs_set_target_user_trg
BEFORE INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.audit_logs_set_target_user();

-- Backfill: admin_actions via transaction_id
UPDATE public.admin_actions a
SET target_user_id = t.seller_id
FROM public.transactions t
WHERE a.target_user_id IS NULL
  AND a.transaction_id IS NOT NULL
  AND a.transaction_id = t.id
  AND t.seller_id IS NOT NULL;

-- Backfill: admin_actions via dispute_id only
UPDATE public.admin_actions a
SET target_user_id = t.seller_id
FROM public.disputes d
JOIN public.transactions t ON t.id = d.transaction_id
WHERE a.target_user_id IS NULL
  AND a.transaction_id IS NULL
  AND a.dispute_id IS NOT NULL
  AND a.dispute_id = d.id
  AND t.seller_id IS NOT NULL;

-- Backfill: audit_logs via transaction_id
UPDATE public.audit_logs a
SET target_user_id = t.seller_id
FROM public.transactions t
WHERE a.target_user_id IS NULL
  AND a.transaction_id IS NOT NULL
  AND a.transaction_id = t.id
  AND t.seller_id IS NOT NULL;
