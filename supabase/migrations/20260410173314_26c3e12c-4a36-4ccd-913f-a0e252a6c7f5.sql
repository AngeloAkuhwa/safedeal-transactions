-- 1. Add consent_text_version column
ALTER TABLE public.identity_submissions
  ADD COLUMN consent_text_version text NOT NULL DEFAULT 'v1.0';

-- 2. Change reviewed_by from text to uuid
ALTER TABLE public.identity_submissions
  ALTER COLUMN reviewed_by TYPE uuid USING reviewed_by::uuid;

-- 3. Add previous_submission_id for resubmission history chain
ALTER TABLE public.identity_submissions
  ADD COLUMN previous_submission_id uuid REFERENCES public.identity_submissions(id);

-- 4. Admin SELECT policy on files for identity document review
CREATE POLICY "admins_select_all_files"
  ON public.files
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type));