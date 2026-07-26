
ALTER TABLE public.internal_users
  ADD COLUMN IF NOT EXISTS activated_at timestamptz NULL;

-- Backfill stuck rows: anyone who has signed in but is still "invited"
UPDATE public.internal_users iu
SET status = 'active',
    invitation_status = 'accepted',
    activated_at = COALESCE(iu.activated_at, u.last_sign_in_at, now())
FROM auth.users u
WHERE u.id = iu.id
  AND iu.status = 'invited'
  AND u.last_sign_in_at IS NOT NULL;
