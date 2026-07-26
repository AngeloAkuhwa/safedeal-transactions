ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS matrix_alerts jsonb NOT NULL DEFAULT jsonb_build_object(
    'critical_permission_changed', true,
    'change_set_rejected_or_failed', true,
    'temporary_access_expiring', true,
    'protected_role_modified', true
  );