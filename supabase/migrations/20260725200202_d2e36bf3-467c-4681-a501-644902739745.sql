-- Presence writer for internal users: update last_active_at for the caller only.
-- Kept SECURITY DEFINER so the strict admin-only UPDATE policy on internal_users
-- stays intact. Silent no-op for non-internal users (buyers/sellers).
CREATE OR REPLACE FUNCTION public.touch_internal_user_last_active()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.internal_users
     SET last_active_at = now()
   WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.touch_internal_user_last_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_internal_user_last_active() TO authenticated;

-- One-off backfill so already-seeded admins don't show "Never" on first load.
UPDATE public.internal_users
   SET last_active_at = COALESCE(last_active_at, updated_at, created_at)
 WHERE last_active_at IS NULL;