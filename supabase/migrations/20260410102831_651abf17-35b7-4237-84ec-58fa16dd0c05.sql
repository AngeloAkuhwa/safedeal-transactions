-- 1. Fix unique constraint for max-2 responses
ALTER TABLE public.dispute_responses DROP CONSTRAINT IF EXISTS uq_dispute_responses_dispute;
ALTER TABLE public.dispute_responses ADD CONSTRAINT uq_dispute_response_number UNIQUE (dispute_id, response_number);

-- 2. Add edit tracking columns to dispute_responses
ALTER TABLE public.dispute_responses ADD COLUMN IF NOT EXISTS edited_at timestamptz DEFAULT NULL;
ALTER TABLE public.dispute_responses ADD COLUMN IF NOT EXISTS edited_by_user_id uuid DEFAULT NULL;
ALTER TABLE public.dispute_responses ADD COLUMN IF NOT EXISTS previous_response_text text DEFAULT NULL;

-- 3. Add dedicated evidence type for dispute-phase additional evidence
ALTER TYPE public.dispute_evidence_type ADD VALUE IF NOT EXISTS 'seller_additional_dispute_evidence';

-- 4. Add replacement tracking columns to dispute_evidence
ALTER TABLE public.dispute_evidence ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.dispute_evidence ADD COLUMN IF NOT EXISTS replaced_at timestamptz DEFAULT NULL;
ALTER TABLE public.dispute_evidence ADD COLUMN IF NOT EXISTS replaced_by_file_id uuid DEFAULT NULL;

-- 5. Add new audit action types for dispute-centric logging
ALTER TYPE public.audit_action_type ADD VALUE IF NOT EXISTS 'dispute_response_edited';
ALTER TYPE public.audit_action_type ADD VALUE IF NOT EXISTS 'dispute_evidence_replaced';

-- 6. Allow sellers to UPDATE their own dispute_responses (for editing)
CREATE POLICY "sellers_update_own_dispute_responses"
ON public.dispute_responses
FOR UPDATE
TO authenticated
USING (
  auth.uid() = responded_by_user_id
  AND EXISTS (
    SELECT 1 FROM disputes d
    JOIN transactions t ON t.id = d.transaction_id
    WHERE d.id = dispute_responses.dispute_id
    AND t.seller_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = responded_by_user_id
);

-- 7. Allow sellers to UPDATE dispute_evidence (for replacement tracking - is_active, replaced_at, replaced_by_file_id)
CREATE POLICY "sellers_update_own_dispute_evidence"
ON public.dispute_evidence
FOR UPDATE
TO authenticated
USING (
  auth.uid() = submitted_by_user_id
  AND EXISTS (
    SELECT 1 FROM disputes d
    JOIN transactions t ON t.id = d.transaction_id
    WHERE d.id = dispute_evidence.dispute_id
    AND t.seller_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = submitted_by_user_id
);