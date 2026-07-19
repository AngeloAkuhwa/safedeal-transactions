-- Background CSV export jobs for large admin exports (P1 scale item).
CREATE TABLE IF NOT EXISTS public.admin_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  export_type text NOT NULL,               -- e.g. 'escrow', 'users_directory', 'flagged_users', 'transactions_monitor'
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed','expired')),
  row_count integer,
  file_path text,                          -- storage path inside 'admin-exports' bucket
  file_size_bytes bigint,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_export_jobs TO authenticated;
GRANT ALL    ON public.admin_export_jobs TO service_role;

ALTER TABLE public.admin_export_jobs ENABLE ROW LEVEL SECURITY;

-- Requesters can read their own jobs (they polled for status/download).
CREATE POLICY "Requesters read own export jobs"
  ON public.admin_export_jobs
  FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

-- Admins (any admin) can see all export jobs for oversight.
CREATE POLICY "Admins read all export jobs"
  ON public.admin_export_jobs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- All writes/updates happen from edge functions via service_role.
-- No INSERT/UPDATE/DELETE policies for authenticated roles.

CREATE INDEX IF NOT EXISTS idx_admin_export_jobs_requester
  ON public.admin_export_jobs (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_export_jobs_status
  ON public.admin_export_jobs (status, created_at DESC);

CREATE TRIGGER trg_admin_export_jobs_touch
  BEFORE UPDATE ON public.admin_export_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();