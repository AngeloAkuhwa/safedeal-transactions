
-- New enums
CREATE TYPE public.identity_submission_status AS ENUM ('not_started','pending_review','verified','rejected','more_info_needed');
CREATE TYPE public.identity_verification_method AS ENUM ('nin','government_id');

-- Identity submissions table
CREATE TABLE public.identity_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status public.identity_submission_status NOT NULL DEFAULT 'pending_review',
  verification_method public.identity_verification_method NOT NULL,
  legal_name text NOT NULL,
  date_of_birth date,
  masked_identifier text,
  document_file_id uuid REFERENCES public.files(id) ON DELETE RESTRICT,
  consent_accepted_at timestamptz NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  review_notes text,
  rejected_at timestamptz,
  rejection_reason text,
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger for updated_at
CREATE TRIGGER update_identity_submissions_updated_at
  BEFORE UPDATE ON public.identity_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.identity_submissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own submissions
CREATE POLICY "users_select_own_identity_submissions"
  ON public.identity_submissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can create their own submissions
CREATE POLICY "users_insert_own_identity_submissions"
  ON public.identity_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update own submissions only when rejected or more_info_needed
CREATE POLICY "users_update_own_identity_submissions"
  ON public.identity_submissions
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND status IN ('rejected', 'more_info_needed')
  )
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all submissions
CREATE POLICY "admins_select_all_identity_submissions"
  ON public.identity_submissions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type));

-- Admins can update all submissions
CREATE POLICY "admins_update_all_identity_submissions"
  ON public.identity_submissions
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role_type));

-- Index for fast lookups
CREATE INDEX idx_identity_submissions_user_id ON public.identity_submissions(user_id);
CREATE INDEX idx_identity_submissions_status ON public.identity_submissions(status);
