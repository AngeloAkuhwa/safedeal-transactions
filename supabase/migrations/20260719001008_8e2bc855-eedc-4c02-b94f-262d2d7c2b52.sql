
CREATE TABLE IF NOT EXISTS public.admin_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id UUID NOT NULL,
  action_key TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_rate_limits_lookup
  ON public.admin_rate_limits (admin_user_id, action_key, occurred_at DESC);

GRANT ALL ON public.admin_rate_limits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_rate_limits_id_seq TO service_role;

ALTER TABLE public.admin_rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anon: table is service-role only.

CREATE OR REPLACE FUNCTION public.check_admin_rate_limit(
  _admin_id UUID,
  _action_key TEXT,
  _max_per_hour INT
) RETURNS TABLE (allowed BOOLEAN, used INT, cap INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Prune anything older than 2 hours to keep the table small.
  DELETE FROM public.admin_rate_limits
   WHERE occurred_at < now() - INTERVAL '2 hours';

  SELECT COUNT(*)::INT INTO v_count
    FROM public.admin_rate_limits
   WHERE admin_user_id = _admin_id
     AND action_key = _action_key
     AND occurred_at >= now() - INTERVAL '1 hour';

  IF v_count >= _max_per_hour THEN
    RETURN QUERY SELECT FALSE, v_count, _max_per_hour;
    RETURN;
  END IF;

  INSERT INTO public.admin_rate_limits (admin_user_id, action_key)
  VALUES (_admin_id, _action_key);

  RETURN QUERY SELECT TRUE, v_count + 1, _max_per_hour;
END;
$$;

REVOKE ALL ON FUNCTION public.check_admin_rate_limit(UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_admin_rate_limit(UUID, TEXT, INT) TO service_role;
