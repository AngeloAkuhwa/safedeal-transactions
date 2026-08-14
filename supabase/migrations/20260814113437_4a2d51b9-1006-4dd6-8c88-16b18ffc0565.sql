CREATE TABLE public.contact_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  topic text NOT NULL DEFAULT 'general',
  transaction_reference text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_messages_status_chk CHECK (status IN ('new','in_progress','resolved')),
  CONSTRAINT contact_messages_message_len CHECK (char_length(message) BETWEEN 1 AND 4000),
  CONSTRAINT contact_messages_name_len CHECK (char_length(full_name) BETWEEN 1 AND 120),
  CONSTRAINT contact_messages_email_len CHECK (char_length(email) BETWEEN 3 AND 255)
);

GRANT SELECT, UPDATE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal_admins_read_contact_messages"
ON public.contact_messages FOR SELECT TO authenticated
USING (public.is_internal_admin(auth.uid()));

CREATE POLICY "internal_admins_update_contact_messages"
ON public.contact_messages FOR UPDATE TO authenticated
USING (public.is_internal_admin(auth.uid()))
WITH CHECK (public.is_internal_admin(auth.uid()));

CREATE INDEX contact_messages_created_at_idx ON public.contact_messages (created_at DESC);
CREATE INDEX contact_messages_status_idx ON public.contact_messages (status);