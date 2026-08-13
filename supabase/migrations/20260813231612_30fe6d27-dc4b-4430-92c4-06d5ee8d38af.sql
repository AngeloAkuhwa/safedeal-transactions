ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS watchdog_alerted_at timestamptz;

COMMENT ON COLUMN public.payouts.watchdog_alerted_at IS
  'Last time the payout-watchdog cron raised a stuck-payout alert for this payout. Used to avoid alert spam (24h cooldown).';

CREATE INDEX IF NOT EXISTS idx_payouts_watchdog_scan
  ON public.payouts (status, initiated_at)
  WHERE provider_reference IS NULL;