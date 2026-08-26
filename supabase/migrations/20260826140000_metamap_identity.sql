-- Automated identity verification through MetaMap.
--
-- Identity verification was entirely manual: a person typed a legal name and
-- either the last four digits of a NIN or uploaded a document, and an admin
-- looked at it and decided. Two problems with that. The NIN route is masked to
-- `****1234`, so the admin approving it is not checking anything, they are
-- taking the applicant's word and recording that they took it. And a queue
-- that a human has to drain does not scale past the size it is now, which
-- happens to be one pending row.
--
-- MetaMap does the check. It reads the document, matches the face on it
-- against a liveness capture, screens watchlists, and returns one of three
-- answers. Two of them are automatic. The third, `reviewNeeded`, lands in the
-- queue that already exists, so the human path is not replaced, it becomes the
-- exception rather than the rule.
--
-- The design rule this schema encodes: **the provider's claim and our decision
-- are separate columns.** `provider_status` is what MetaMap said;
-- `status` is what SafeDeal concluded. Collapsing them would make it
-- impossible to answer "why is this person verified" six months from now, and
-- an escrow product needs that answer.

BEGIN;

-- Existing values: nin, government_id. Neither describes a provider-run check.
ALTER TYPE public.identity_verification_method ADD VALUE IF NOT EXISTS 'metamap';

ALTER TABLE public.identity_submissions
  -- Which pipeline produced this row. Defaulted to 'manual' so every existing
  -- row keeps its true provenance rather than being retitled by this migration.
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'manual',
  -- MetaMap's own verification id. `provider_reference` already existed and
  -- was unused; it becomes the id so there is one place to look.
  ADD COLUMN IF NOT EXISTS provider_status text,
  -- verified | reviewNeeded | rejected, exactly as MetaMap spelled it. Stored
  -- verbatim rather than translated, because a mapping that loses the original
  -- cannot be re-derived when the mapping itself turns out to be wrong.
  ADD COLUMN IF NOT EXISTS provider_document_type text,
  ADD COLUMN IF NOT EXISTS provider_checked_at timestamptz,
  -- The decision-relevant slice of the resource, never the media. Enough to
  -- answer "why", not enough to become a copy of someone's passport.
  ADD COLUMN IF NOT EXISTS provider_payload jsonb,
  -- Set only when the pipeline decided without a human. An audit needs to
  -- distinguish "an admin approved this" from "nobody looked".
  ADD COLUMN IF NOT EXISTS auto_decided_at timestamptz;

COMMENT ON COLUMN public.identity_submissions.provider_status IS
  'MetaMap''s verdict, stored verbatim (verified/reviewNeeded/rejected). Kept '
  'separate from `status`, which is SafeDeal''s conclusion, so the mapping '
  'between them can be re-derived if it turns out to be wrong.';

COMMENT ON COLUMN public.identity_submissions.auto_decided_at IS
  'Set only when no human reviewed. Distinguishes "an admin approved this" '
  'from "nobody looked", which an escrow audit has to be able to tell apart.';

-- Every webhook we receive, signature-checked or not.
--
-- Three jobs, and the third is the one that is easy to skip and expensive to
-- have skipped:
--
--   1. Idempotency. MetaMap retries. Without a uniqueness key a retried
--      `verification_completed` re-runs the decision, and a submission that a
--      human had since rejected would be silently re-verified.
--   2. Ordering. `verification_updated` arrives after `verification_completed`
--      and overrides it. Keeping both means the sequence is reconstructable.
--   3. Rejected deliveries. A request whose signature does NOT verify is
--      recorded too, with `signature_valid = false`. A forged webhook that is
--      silently dropped looks exactly like no webhook, and the difference
--      between "nobody tried" and "somebody tried and failed" is the whole
--      signal.
CREATE TABLE IF NOT EXISTS public.metamap_webhook_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at       timestamptz NOT NULL DEFAULT now(),

  event_name        text NOT NULL,
  verification_id   text,
  flow_id           text,
  -- MetaMap's own timestamp, which together with the id and event name is what
  -- makes a retry recognisable as the same delivery.
  event_timestamp   timestamptz,

  signature_valid   boolean NOT NULL,
  submission_id     uuid REFERENCES public.identity_submissions(id) ON DELETE SET NULL,
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  raw               jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Null when the event was handled cleanly. A value here is a delivery that
  -- arrived and could not be acted on, which is the state most worth finding.
  processing_error  text,
  processed_at      timestamptz
);

-- The idempotency key. Partial, because a delivery with no verification id
-- (a malformed or forged one) still gets recorded rather than being rejected
-- by a constraint it cannot satisfy.
CREATE UNIQUE INDEX IF NOT EXISTS metamap_webhook_events_delivery_idx
  ON public.metamap_webhook_events (verification_id, event_name, event_timestamp)
  WHERE verification_id IS NOT NULL AND event_timestamp IS NOT NULL;

CREATE INDEX IF NOT EXISTS metamap_webhook_events_recent_idx
  ON public.metamap_webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS metamap_webhook_events_unverified_idx
  ON public.metamap_webhook_events (received_at DESC)
  WHERE signature_valid = false;

CREATE INDEX IF NOT EXISTS metamap_webhook_events_failed_idx
  ON public.metamap_webhook_events (received_at DESC)
  WHERE processing_error IS NOT NULL;

ALTER TABLE public.metamap_webhook_events ENABLE ROW LEVEL SECURITY;

-- No policies, same reasoning as `error_events`: this table holds document
-- types, verification ids and provider payloads for real people. It is written
-- only by the webhook function and read only by an admin function, both
-- service-role, and no browser role has any business reaching it.
REVOKE ALL ON public.metamap_webhook_events FROM anon, authenticated;
GRANT ALL ON public.metamap_webhook_events TO service_role;

COMMENT ON TABLE public.metamap_webhook_events IS
  'Every MetaMap webhook delivery, including ones whose signature failed. '
  'The unique index on (verification_id, event_name, event_timestamp) makes '
  'a provider retry a no-op rather than a second decision.';

COMMIT;
