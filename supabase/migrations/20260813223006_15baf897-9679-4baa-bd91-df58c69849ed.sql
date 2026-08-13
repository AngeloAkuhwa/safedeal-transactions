-- 1. Drop the stale 7-argument resolve_dispute_atomic overload. The app and
-- every DB caller use the 8-argument version (with p_acknowledge_frozen_funds
-- and the platform-fee refund-ceiling fix). Verified: no pg_proc body and no
-- application code references the 7-arg signature.
DROP FUNCTION IF EXISTS public.resolve_dispute_atomic(uuid, uuid, dispute_outcome_type, numeric, numeric, text, boolean);

-- 2. Audit label for retrying a stuck dispute refund at the payment provider.
ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'retry_refund';