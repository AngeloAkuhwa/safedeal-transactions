CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_expires_at
  ON public.user_permission_overrides (expires_at)
  WHERE expires_at IS NOT NULL;