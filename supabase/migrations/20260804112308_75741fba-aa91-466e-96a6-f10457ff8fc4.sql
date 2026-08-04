-- 1. Recovery codes (hash-only storage)
CREATE TABLE public.mfa_recovery_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  salt text NOT NULL,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.mfa_recovery_codes TO service_role;

ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages recovery codes"
  ON public.mfa_recovery_codes FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_mfa_recovery_codes_user_unused
  ON public.mfa_recovery_codes (user_id) WHERE used_at IS NULL;

-- 2. Verification attempt log (brute-force protection + audit)
CREATE TABLE public.mfa_verification_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  success boolean NOT NULL,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.mfa_verification_attempts TO service_role;

ALTER TABLE public.mfa_verification_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages mfa attempts"
  ON public.mfa_verification_attempts FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_mfa_attempts_user_time
  ON public.mfa_verification_attempts (user_id, created_at DESC);

-- 3. Derived MFA state: is there a VERIFIED factor for this user?
CREATE OR REPLACE FUNCTION public.user_has_verified_mfa(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.mfa_factors f
    WHERE f.user_id = _user_id AND f.status = 'verified'
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_verified_mfa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_verified_mfa(uuid) TO service_role;

-- 4. Real 2FA status for the internal-user directory (derived, not stored)
CREATE OR REPLACE FUNCTION public.internal_users_mfa_status()
RETURNS TABLE (user_id uuid, two_factor_enabled boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_any_internal_role(auth.uid(), ARRAY[
      'super_admin','senior_admin','dispute_manager','dispute_agent',
      'support_agent','identity_officer','finance_operator','finance_approver',
      'compliance_officer','auditor'
    ])
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT iu.id,
         EXISTS (
           SELECT 1 FROM auth.mfa_factors f
           WHERE f.user_id = iu.id AND f.status = 'verified'
         )
  FROM public.internal_users iu;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_users_mfa_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_users_mfa_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_users_mfa_status() TO service_role;

-- 5. Own recovery-code status (counts only, never the codes)
CREATE OR REPLACE FUNCTION public.my_mfa_recovery_status()
RETURNS TABLE (total integer, unused integer, generated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE used_at IS NULL)::int,
         MAX(created_at)
  FROM public.mfa_recovery_codes
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_mfa_recovery_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_mfa_recovery_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_mfa_recovery_status() TO service_role;

COMMENT ON COLUMN public.internal_users.two_factor_enabled IS
  'DEPRECATED shadow flag. Real 2FA state is derived from auth.mfa_factors via public.internal_users_mfa_status(). Kept for one release, then dropped.';