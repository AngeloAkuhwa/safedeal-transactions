CREATE TABLE IF NOT EXISTS public.orchestration_notification_dedupe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  key text NOT NULL,
  recipient_id uuid,
  first_sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS orchestration_notification_dedupe_unique
  ON public.orchestration_notification_dedupe (event, key, COALESCE(recipient_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS orchestration_notification_dedupe_expires_idx
  ON public.orchestration_notification_dedupe (expires_at);

GRANT ALL ON public.orchestration_notification_dedupe TO service_role;

ALTER TABLE public.orchestration_notification_dedupe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages orchestration notification dedupe"
  ON public.orchestration_notification_dedupe
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);