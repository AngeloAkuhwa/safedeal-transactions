
-- Add is_read boolean column defaulting to false, backfill from status
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;
UPDATE public.notifications SET is_read = true WHERE status = 'read';

-- Add related_dispute_id column
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_dispute_id uuid REFERENCES public.disputes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_dispute ON public.notifications (related_dispute_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, is_read);
