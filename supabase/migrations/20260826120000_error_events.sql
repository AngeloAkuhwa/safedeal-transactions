-- Error monitoring: one table every failure lands in, client or edge.
--
-- The product is about to take live payments and has no error visibility at
-- all. A JavaScript exception on the checkout page is currently invisible: it
-- is learned about from a buyer complaining, if ever. This is the store behind
-- that, and it is deliberately self-hosted rather than a third-party SDK,
-- because the lockfile cannot be regenerated in the build sandbox and because
-- errors from an escrow product are worth keeping in the operator's own
-- database rather than shipping to a vendor.
--
-- The correlation_id is the reason this is one table rather than two. A buyer
-- sees "payment failed"; the operator needs the edge function's stack for the
-- same attempt. Both rows carry the id the client minted before the call, so a
-- client symptom and its server cause join without guessing by timestamp.

BEGIN;

CREATE TYPE public.error_source AS ENUM ('client', 'edge');
CREATE TYPE public.error_severity AS ENUM ('warning', 'error', 'fatal');

CREATE TABLE public.error_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- When the failure happened, per the reporter, and when we received it.
  -- They differ when a report is buffered offline or sent on page unload, and
  -- the gap is itself a signal worth keeping.
  occurred_at       timestamptz NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),

  correlation_id    uuid,
  source            public.error_source NOT NULL,
  severity          public.error_severity NOT NULL DEFAULT 'error',

  -- What kind of failure: react_render, unhandled_rejection, window_error,
  -- edge_exception, edge_refusal, network. Free text rather than an enum so a
  -- new kind never needs a migration to be recordable; grouping is by
  -- fingerprint anyway.
  kind              text NOT NULL,

  message           text NOT NULL,
  stack             text,

  -- Where. Route for a client error, function name for an edge one.
  route             text,
  function_name     text,
  http_status       integer,

  -- Who, when known. Never trusted from the request body: the ingest function
  -- derives it from the caller's token, so a forged report cannot be attributed
  -- to another account.
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id        text,

  release           text,
  user_agent        text,
  viewport          text,

  -- Structured extras. Capped by the ingest function, never rendered as HTML.
  context           jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Stable hash of kind + normalised message + top stack frame, so the same
  -- defect recurring 4,000 times is one row in the admin view rather than 4,000.
  fingerprint       text NOT NULL,

  -- Operator workflow. An error nobody has looked at reads differently from
  -- one that was seen and judged not to matter.
  acknowledged_at   timestamptz,
  acknowledged_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now()
);

-- The three questions an operator actually asks, in order: what is happening
-- right now, what is this one defect doing over time, and what happened to
-- this specific user's attempt.
CREATE INDEX error_events_recent_idx      ON public.error_events (occurred_at DESC);
CREATE INDEX error_events_fingerprint_idx ON public.error_events (fingerprint, occurred_at DESC);
CREATE INDEX error_events_correlation_idx ON public.error_events (correlation_id)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX error_events_unack_idx       ON public.error_events (occurred_at DESC)
  WHERE acknowledged_at IS NULL;

ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;

-- No policies on purpose, which in RLS means no client role can read or write
-- this table at all. Reports arrive only through the ingest edge function and
-- are read only through the admin one, both service-role. A table of stack
-- traces is exactly the thing that must not be readable by the browser that
-- produced them: stacks name internal paths, and context can carry the shape
-- of a failing request.
REVOKE ALL ON public.error_events FROM anon, authenticated;
GRANT ALL ON public.error_events TO service_role;

COMMENT ON TABLE public.error_events IS
  'Every client and edge failure, joined by correlation_id. Written only by '
  'the log-error function and read only by admin-error-events, both '
  'service-role. RLS is on with no policies, so no browser role can reach it.';

COMMENT ON COLUMN public.error_events.fingerprint IS
  'kind + normalised message + top stack frame. Groups a recurring defect so '
  'the admin view shows one row with a count rather than thousands of rows.';

COMMENT ON COLUMN public.error_events.user_id IS
  'Derived by the ingest function from the caller token, never read from the '
  'request body, so a forged report cannot be attributed to another account.';

COMMIT;
