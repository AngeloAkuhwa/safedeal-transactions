
-- Phase R: keep account_verifications.payout_verified honest
CREATE OR REPLACE FUNCTION public.sync_payout_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ready boolean;
BEGIN
  v_ready := (NEW.verification_status = 'verified'
              AND NEW.provider_recipient_code IS NOT NULL
              AND length(trim(NEW.provider_recipient_code)) > 0);

  UPDATE public.account_verifications
     SET payout_verified = v_ready,
         updated_at = now()
   WHERE user_id = NEW.user_id
     AND payout_verified IS DISTINCT FROM v_ready;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payout_verified ON public.payout_accounts;
CREATE TRIGGER trg_sync_payout_verified
AFTER INSERT OR UPDATE OF verification_status, provider_recipient_code
ON public.payout_accounts
FOR EACH ROW
EXECUTE FUNCTION public.sync_payout_verified();

-- One-time backfill — correct stale flags now
UPDATE public.account_verifications av
   SET payout_verified = sub.ready,
       updated_at = now()
  FROM (
    SELECT user_id,
           (verification_status = 'verified'
            AND provider_recipient_code IS NOT NULL
            AND length(trim(provider_recipient_code)) > 0) AS ready
      FROM public.payout_accounts
  ) sub
 WHERE av.user_id = sub.user_id
   AND av.payout_verified IS DISTINCT FROM sub.ready;

-- Sellers with no payout_accounts row at all → not verified
UPDATE public.account_verifications
   SET payout_verified = false,
       updated_at = now()
 WHERE payout_verified = true
   AND NOT EXISTS (
     SELECT 1 FROM public.payout_accounts pa WHERE pa.user_id = account_verifications.user_id
   );
