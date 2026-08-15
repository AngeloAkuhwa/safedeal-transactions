-- =====================================================================
-- 1. payout_accounts: privileged columns are service_role-only
-- =====================================================================
CREATE OR REPLACE FUNCTION public.payout_accounts_pin_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bank_changed boolean;
BEGIN
  -- service_role / owner writes (edge functions, migrations) are the only
  -- path allowed to assert verification state.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verification_status     := 'pending';
    NEW.provider_recipient_code := NULL;
    NEW.provider_recipient_id   := NULL;
    NEW.last_verified_at        := NULL;
    NEW.provider_response       := NULL;
    NEW.last_verification_error := NULL;
    RETURN NEW;
  END IF;

  v_bank_changed := (NEW.bank_code IS DISTINCT FROM OLD.bank_code)
                 OR (NEW.bank_name IS DISTINCT FROM OLD.bank_name)
                 OR (NEW.account_name IS DISTINCT FROM OLD.account_name)
                 OR (NEW.masked_account_number IS DISTINCT FROM OLD.masked_account_number)
                 OR (NEW.provider IS DISTINCT FROM OLD.provider);

  IF v_bank_changed THEN
    -- Fail SAFE, not merely unchanged: a client-side destination edit
    -- invalidates any prior verification.
    NEW.verification_status     := 'requires_update';
    NEW.provider_recipient_code := NULL;
    NEW.provider_recipient_id   := NULL;
    NEW.last_verified_at        := NULL;
    NEW.provider_response       := NULL;
    NEW.last_verification_error := OLD.last_verification_error;
  ELSE
    NEW.verification_status     := OLD.verification_status;
    NEW.provider_recipient_code := OLD.provider_recipient_code;
    NEW.provider_recipient_id   := OLD.provider_recipient_id;
    NEW.last_verified_at        := OLD.last_verified_at;
    NEW.provider_response       := OLD.provider_response;
    NEW.last_verification_error := OLD.last_verification_error;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payout_accounts_pin_privileged_fields ON public.payout_accounts;
CREATE TRIGGER payout_accounts_pin_privileged_fields
BEFORE INSERT OR UPDATE ON public.payout_accounts
FOR EACH ROW EXECUTE FUNCTION public.payout_accounts_pin_privileged_fields();

-- Second layer: column-level grants, so the privileged columns are not even
-- writable by the client role.
REVOKE INSERT, UPDATE ON public.payout_accounts FROM authenticated;
GRANT INSERT (user_id, bank_code, bank_name, account_name, masked_account_number, provider)
  ON public.payout_accounts TO authenticated;
GRANT UPDATE (bank_code, bank_name, account_name, masked_account_number, provider)
  ON public.payout_accounts TO authenticated;

-- Third layer: the INSERT policy pins the same values.
DROP POLICY IF EXISTS "Users manage own payout account" ON public.payout_accounts;
CREATE POLICY "Users manage own payout account"
ON public.payout_accounts FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND verification_status = 'pending'
  AND provider_recipient_code IS NULL
  AND provider_recipient_id IS NULL
  AND last_verified_at IS NULL
  AND provider_response IS NULL
);

-- =====================================================================
-- 2a. check_admin_rate_limit: settings-derived ceiling + caller check
-- =====================================================================
INSERT INTO public.system_settings (setting_key, setting_value, scope, is_overridable)
VALUES ('security.admin_rate_limit_caps',
        '{"default": 20, "reveal_user_field": 20, "export_user_detail": 5, "admin_export": 5}'::jsonb,
        'platform', false)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.check_admin_rate_limit(
  _admin_id uuid,
  _action_key text,
  _max_per_hour integer DEFAULT NULL
)
RETURNS TABLE(allowed boolean, used integer, cap integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caps  jsonb;
  v_cap   integer;
  v_count integer;
BEGIN
  IF _admin_id IS NULL OR _action_key IS NULL OR btrim(_action_key) = '' THEN
    RAISE EXCEPTION 'rate_limit_invalid_args';
  END IF;

  -- A signed-in caller may only meter ITSELF; it cannot burn someone else's
  -- budget or check on their behalf.
  IF auth.uid() IS NOT NULL AND auth.uid() <> _admin_id THEN
    RAISE EXCEPTION 'rate_limit_subject_mismatch';
  END IF;

  -- The subject must be real, active internal staff.
  IF NOT public.internal_access_active(_admin_id) THEN
    RAISE EXCEPTION 'rate_limit_subject_not_internal';
  END IF;

  v_caps := public.get_effective_setting(NULL, 'security.admin_rate_limit_caps');
  IF v_caps IS NULL THEN
    RAISE EXCEPTION 'rate_limit_caps_unconfigured';
  END IF;

  v_cap := COALESCE((v_caps ->> _action_key)::int, (v_caps ->> 'default')::int);
  IF v_cap IS NULL OR v_cap <= 0 THEN
    RAISE EXCEPTION 'rate_limit_cap_unconfigured_for_action';
  END IF;

  -- A caller-supplied ceiling may only LOWER the configured cap, never raise
  -- it. The limiter is not parameterised by the party being limited.
  IF _max_per_hour IS NOT NULL AND _max_per_hour > 0 THEN
    v_cap := least(v_cap, _max_per_hour);
  END IF;

  DELETE FROM public.admin_rate_limits
   WHERE occurred_at < now() - INTERVAL '2 hours';

  SELECT COUNT(*)::int INTO v_count
    FROM public.admin_rate_limits
   WHERE admin_user_id = _admin_id
     AND action_key = _action_key
     AND occurred_at >= now() - INTERVAL '1 hour';

  IF v_count >= v_cap THEN
    RETURN QUERY SELECT FALSE, v_count, v_cap;
    RETURN;
  END IF;

  INSERT INTO public.admin_rate_limits (admin_user_id, action_key)
  VALUES (_admin_id, _action_key);

  RETURN QUERY SELECT TRUE, v_count + 1, v_cap;
END;
$$;

REVOKE ALL ON FUNCTION public.check_admin_rate_limit(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_admin_rate_limit(uuid, text, integer) TO service_role, postgres;

-- =====================================================================
-- 2b. annotate_setting_version_reason: authorised callers only
-- =====================================================================
CREATE OR REPLACE FUNCTION public.annotate_setting_version_reason(
  _setting_key text, _scope text, _vendor_id uuid, _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
     AND NOT (auth.uid() IS NOT NULL AND public.is_internal_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_id
  FROM public.system_settings_history
  WHERE setting_key = _setting_key
    AND scope = _scope
    AND COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(_vendor_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND reason IS NULL
  ORDER BY version DESC
  LIMIT 1;

  IF v_id IS NOT NULL AND _reason IS NOT NULL AND length(btrim(_reason)) > 0 THEN
    UPDATE public.system_settings_history SET reason = _reason WHERE id = v_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.annotate_setting_version_reason(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.annotate_setting_version_reason(text, text, uuid, text) TO service_role, postgres;

-- =====================================================================
-- 3. transactions / transaction_items / transaction_delivery_terms
-- =====================================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.transactions, public.transaction_items, public.transaction_delivery_terms,
     public.checkout_session_items
  FROM anon;

-- No UPDATE policy exists on transactions for clients; the grant outlived it.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.transactions FROM authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.transaction_items FROM authenticated;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.transaction_delivery_terms FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.checkout_session_items FROM authenticated;

ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_delivery_terms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_session_items FORCE ROW LEVEL SECURITY;

GRANT ALL ON public.transactions TO service_role;
GRANT ALL ON public.transaction_items TO service_role;
GRANT ALL ON public.transaction_delivery_terms TO service_role;
GRANT ALL ON public.checkout_session_items TO service_role;

-- =====================================================================
-- 4. checkout_session_items value consistency
-- =====================================================================
ALTER TABLE public.checkout_session_items
  ADD CONSTRAINT checkout_items_quantity_positive CHECK (quantity > 0);
ALTER TABLE public.checkout_session_items
  ADD CONSTRAINT checkout_items_line_total_matches_components
  CHECK (round(line_total, 2) = round(unit_price * quantity, 2));

-- =====================================================================
-- 5. Money-coerced-to-zero column defaults
-- =====================================================================
ALTER TABLE public.transaction_pricing ALTER COLUMN platform_fee_amount DROP DEFAULT;
ALTER TABLE public.dispute_outcomes ALTER COLUMN refund_amount DROP DEFAULT;
ALTER TABLE public.dispute_outcomes ALTER COLUMN release_amount DROP DEFAULT;
ALTER TABLE public.vendor_plans ALTER COLUMN monthly_price_naira DROP DEFAULT;
ALTER TABLE public.vendor_plans ALTER COLUMN yearly_price_naira DROP DEFAULT;

-- =====================================================================
-- 6. effective_vendor_plan_code: derive the fallback tier
-- =====================================================================
CREATE OR REPLACE FUNCTION public.effective_vendor_plan_code(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT code
      FROM public.vendor_plans
     WHERE is_active
     ORDER BY monthly_price_naira ASC, sort_order ASC
     LIMIT 1
  )
  SELECT CASE
    WHEN p.vendor_plan_code IS NULL THEN (SELECT code FROM base)
    WHEN p.vendor_plan_code = (SELECT code FROM base) THEN (SELECT code FROM base)
    WHEN p.vendor_plan_expires_at IS NULL THEN (SELECT code FROM base)
    WHEN p.vendor_plan_expires_at < now() THEN (SELECT code FROM base)
    WHEN NOT EXISTS (
      SELECT 1 FROM public.vendor_plans vp
       WHERE vp.code = p.vendor_plan_code AND vp.is_active
    ) THEN (SELECT code FROM base)
    ELSE p.vendor_plan_code
  END
  FROM public.profiles p
  WHERE p.id = _user_id;
$$;