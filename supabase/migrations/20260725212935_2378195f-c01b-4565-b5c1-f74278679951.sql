
DO $$
DECLARE v TEXT;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'user_invited','invitation_resent','user_activated',
    'role_assigned','role_changed',
    'permission_override_requested','permission_override_approved','permission_override_rejected',
    'role_change_approved','role_change_rejected',
    'user_reactivated','user_deactivated',
    'session_revoked','task_reassigned'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'admin_action_type' AND e.enumlabel = v
    ) THEN
      EXECUTE format('ALTER TYPE public.admin_action_type ADD VALUE %L', v);
    END IF;
  END LOOP;
END $$;
