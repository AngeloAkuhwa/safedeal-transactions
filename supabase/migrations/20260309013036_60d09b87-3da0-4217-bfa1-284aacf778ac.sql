-- Create transaction_messages table for buyer-seller messaging
CREATE TABLE public.transaction_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  sender_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  message_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add index for efficient querying by transaction
CREATE INDEX idx_transaction_messages_transaction_id ON public.transaction_messages(transaction_id);
CREATE INDEX idx_transaction_messages_recipient ON public.transaction_messages(recipient_user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.transaction_messages ENABLE ROW LEVEL SECURITY;

-- RLS: Transaction parties can select messages for their transactions
CREATE POLICY "parties_select_transaction_messages"
  ON public.transaction_messages
  FOR SELECT
  TO authenticated
  USING (is_transaction_party(auth.uid(), transaction_id));

-- RLS: Transaction parties can insert messages (sender must be the authenticated user)
CREATE POLICY "parties_insert_transaction_messages"
  ON public.transaction_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_user_id
    AND is_transaction_party(auth.uid(), transaction_id)
  );

-- Enable realtime for instant message delivery
ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_messages;