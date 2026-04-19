-- Add new notification type for direct messages between transaction parties
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'direct_message';

-- Add read tracking to transaction_messages so we can show unread state per recipient
ALTER TABLE public.transaction_messages
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_transaction_messages_unread
  ON public.transaction_messages (recipient_user_id, is_read)
  WHERE is_read = false;

-- Allow recipient to mark their own messages as read
DROP POLICY IF EXISTS "recipient_marks_messages_read" ON public.transaction_messages;
CREATE POLICY "recipient_marks_messages_read"
  ON public.transaction_messages
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_user_id)
  WITH CHECK (auth.uid() = recipient_user_id);