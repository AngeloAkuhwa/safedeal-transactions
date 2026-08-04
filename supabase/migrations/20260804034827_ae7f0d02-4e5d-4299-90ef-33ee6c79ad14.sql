
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- ---------------------------------------------------------------
-- One-time cleanup of the duplicated escrow drift alerts.
-- Keeps the earliest row per (user, transaction) and folds the
-- duplicates into occurrence_count / first_seen_at / last_seen_at.
-- ---------------------------------------------------------------
DO $$
DECLARE
  v_removed BIGINT;
BEGIN
  CREATE TEMP TABLE _drift_groups ON COMMIT DROP AS
  SELECT
    user_id,
    related_transaction_id,
    (array_agg(id ORDER BY created_at ASC))[1] AS keep_id,
    count(*)::int AS total,
    min(created_at) AS first_seen,
    max(created_at) AS last_seen
  FROM public.notifications
  WHERE type = 'security_alert'
    AND title LIKE 'Escrow drift detected%'
    AND related_transaction_id IS NOT NULL
  GROUP BY user_id, related_transaction_id
  HAVING count(*) > 1;

  UPDATE public.notifications n
  SET occurrence_count = g.total,
      first_seen_at    = g.first_seen,
      last_seen_at     = g.last_seen,
      dedupe_key       = 'escrow_drift:' || g.related_transaction_id::text
  FROM _drift_groups g
  WHERE n.id = g.keep_id;

  WITH deleted AS (
    DELETE FROM public.notifications n
    USING _drift_groups g
    WHERE n.user_id = g.user_id
      AND n.related_transaction_id = g.related_transaction_id
      AND n.type = 'security_alert'
      AND n.title LIKE 'Escrow drift detected%'
      AND n.id <> g.keep_id
    RETURNING 1
  )
  SELECT count(*) INTO v_removed FROM deleted;

  RAISE NOTICE 'escrow drift duplicate notifications removed: %', v_removed;
END $$;

-- Backfill seen timestamps for remaining rows so the UI has stable values.
UPDATE public.notifications
SET first_seen_at = COALESCE(first_seen_at, created_at),
    last_seen_at  = COALESCE(last_seen_at, created_at)
WHERE first_seen_at IS NULL OR last_seen_at IS NULL;

-- One active alert per (user, dedupe_key).
CREATE UNIQUE INDEX IF NOT EXISTS notifications_active_dedupe_key_uidx
  ON public.notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_dedupe_key
  ON public.notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ---------------------------------------------------------------
-- Raise-or-refresh a system alert for every admin user.
-- Returns the number of rows inserted and updated.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.raise_system_alert(
  _dedupe_key TEXT,
  _type public.notification_type,
  _title TEXT,
  _message TEXT,
  _related_transaction_id UUID DEFAULT NULL,
  _metadata JSONB DEFAULT NULL
)
RETURNS TABLE (inserted_count INTEGER, updated_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ins INTEGER := 0;
  v_upd INTEGER := 0;
  v_admin RECORD;
  v_existing UUID;
BEGIN
  IF _dedupe_key IS NULL OR length(_dedupe_key) = 0 THEN
    RAISE EXCEPTION 'dedupe_key is required';
  END IF;

  FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    SELECT id INTO v_existing
    FROM public.notifications
    WHERE user_id = v_admin.user_id
      AND dedupe_key = _dedupe_key
      AND resolved_at IS NULL
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.notifications
      SET occurrence_count = occurrence_count + 1,
          last_seen_at = now(),
          title = _title,
          message = _message,
          metadata = COALESCE(_metadata, metadata)
      WHERE id = v_existing;
      v_upd := v_upd + 1;
    ELSE
      INSERT INTO public.notifications (
        user_id, type, channel, title, message,
        related_transaction_id, status, metadata,
        dedupe_key, occurrence_count, first_seen_at, last_seen_at
      ) VALUES (
        v_admin.user_id, _type, 'in_app', _title, _message,
        _related_transaction_id, 'pending', _metadata,
        _dedupe_key, 1, now(), now()
      );
      v_ins := v_ins + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_ins, v_upd;
END $$;

REVOKE ALL ON FUNCTION public.raise_system_alert(TEXT, public.notification_type, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.raise_system_alert(TEXT, public.notification_type, TEXT, TEXT, UUID, JSONB) TO service_role;

-- ---------------------------------------------------------------
-- Resolve active alerts under a key prefix whose condition cleared.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_system_alerts(
  _key_prefix TEXT,
  _active_keys TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH resolved AS (
    UPDATE public.notifications
    SET resolved_at = now()
    WHERE dedupe_key LIKE _key_prefix || '%'
      AND resolved_at IS NULL
      AND NOT (dedupe_key = ANY (COALESCE(_active_keys, ARRAY[]::TEXT[])))
    RETURNING 1
  )
  SELECT count(*)::int INTO v_count FROM resolved;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.resolve_system_alerts(TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_system_alerts(TEXT, TEXT[]) TO service_role;
