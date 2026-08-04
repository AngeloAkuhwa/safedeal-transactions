REVOKE ALL ON public.mfa_recovery_codes FROM anon;
REVOKE ALL ON public.mfa_recovery_codes FROM authenticated;
REVOKE ALL ON public.mfa_verification_attempts FROM anon;
REVOKE ALL ON public.mfa_verification_attempts FROM authenticated;
GRANT ALL ON public.mfa_recovery_codes TO service_role;
GRANT ALL ON public.mfa_verification_attempts TO service_role;