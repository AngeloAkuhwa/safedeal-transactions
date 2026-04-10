-- Batch 1: Buyer Verification Foundation
-- verification_level_type enum, phone_otp_codes table, compute_verification_level function

CREATE TYPE public.verification_level_type AS ENUM ('unverified', 'basic_verified', 'trusted_buyer', 'high_trust_buyer');

ALTER TABLE public.account_verifications
  ADD COLUMN verification_level public.verification_level_type NOT NULL DEFAULT 'unverified';

CREATE TABLE public.phone_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.phone_otp_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_phone_otp_user ON public.phone_otp_codes (user_id, created_at DESC);
CREATE INDEX idx_phone_otp_phone ON public.phone_otp_codes (phone, created_at DESC);

CREATE OR REPLACE FUNCTION public.compute_verification_level(_user_id uuid)
RETURNS public.verification_level_type
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _email_verified boolean;
  _phone_verified boolean;
  _identity_verified boolean;
  _has_location boolean;
BEGIN
  SELECT email_verified, phone_verified, identity_verified
  INTO _email_verified, _phone_verified, _identity_verified
  FROM account_verifications WHERE user_id = _user_id;

  SELECT (state_name IS NOT NULL AND state_name != '' AND city_name IS NOT NULL AND city_name != '')
  INTO _has_location
  FROM profiles WHERE id = _user_id;

  IF _identity_verified AND _phone_verified AND _email_verified AND _has_location THEN
    RETURN 'trusted_buyer';
  ELSIF _email_verified AND _phone_verified AND _has_location THEN
    RETURN 'basic_verified';
  ELSE
    RETURN 'unverified';
  END IF;
END;
$$;

UPDATE public.account_verifications av
SET verification_level = public.compute_verification_level(av.user_id);
