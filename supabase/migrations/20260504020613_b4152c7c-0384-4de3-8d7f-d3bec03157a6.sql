-- 1. Extend admin_action_type enum
DO $$ BEGIN
  ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'add_internal_note';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'flag_for_review';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.admin_action_type ADD VALUE IF NOT EXISTS 'unfreeze_transaction';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Extend audit_action_type enum
DO $$ BEGIN
  ALTER TYPE public.audit_action_type ADD VALUE IF NOT EXISTS 'admin_freeze';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.audit_action_type ADD VALUE IF NOT EXISTS 'admin_unfreeze';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.audit_action_type ADD VALUE IF NOT EXISTS 'admin_flag_review';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.audit_action_type ADD VALUE IF NOT EXISTS 'admin_escalate_dispute';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.audit_action_type ADD VALUE IF NOT EXISTS 'admin_internal_note';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. admin_transaction_notes table
CREATE TABLE IF NOT EXISTS public.admin_transaction_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  admin_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  note text NOT NULL CHECK (length(trim(note)) > 0 AND length(note) <= 2000),
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_tx_notes_tx
  ON public.admin_transaction_notes (transaction_id, created_at DESC);

ALTER TABLE public.admin_transaction_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admins_select_admin_tx_notes ON public.admin_transaction_notes;
CREATE POLICY admins_select_admin_tx_notes
  ON public.admin_transaction_notes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type));

DROP POLICY IF EXISTS admins_insert_admin_tx_notes ON public.admin_transaction_notes;
CREATE POLICY admins_insert_admin_tx_notes
  ON public.admin_transaction_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::user_role_type)
    AND auth.uid() = admin_user_id
  );
