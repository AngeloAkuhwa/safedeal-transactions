
-- ============================================================
-- SafeDeal Batch 7: Disputes, Responses, Evidence, Status History, Outcomes
-- ============================================================

-- ======================== ENUMS =============================

CREATE TYPE public.dispute_reason_type AS ENUM (
  'wrong_item_received',
  'damaged_item_received',
  'incomplete_order',
  'item_not_as_described',
  'item_not_delivered',
  'suspected_fake_item',
  'other'
);

CREATE TYPE public.dispute_case_status AS ENUM (
  'open',
  'seller_response_pending',
  'under_review',
  'resolved'
);

CREATE TYPE public.dispute_evidence_type AS ENUM (
  'buyer_photo',
  'buyer_video',
  'seller_receipt',
  'seller_tracking',
  'seller_product_photo',
  'supporting_document',
  'other'
);

CREATE TYPE public.dispute_outcome_type AS ENUM (
  'refund_buyer',
  'release_funds_to_seller',
  'close_case_without_resolution'
);

-- ============================================================
-- 1. disputes — Root case record
-- ============================================================
CREATE TABLE public.disputes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  opened_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason public.dispute_reason_type NOT NULL,
  description TEXT NOT NULL,
  status public.dispute_case_status NOT NULL DEFAULT 'open',
  seller_response_due_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_disputes_transaction UNIQUE (transaction_id)
);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_disputes_transaction ON public.disputes (transaction_id);
CREATE INDEX idx_disputes_opened_by ON public.disputes (opened_by_user_id);
CREATE INDEX idx_disputes_status ON public.disputes (status);

CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. dispute_responses — Seller's formal response
-- ============================================================
CREATE TABLE public.dispute_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE RESTRICT,
  responded_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  response_text TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dispute_responses_dispute UNIQUE (dispute_id)
);

ALTER TABLE public.dispute_responses ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_dispute_responses_responded_by ON public.dispute_responses (responded_by_user_id);

CREATE TRIGGER update_dispute_responses_updated_at BEFORE UPDATE ON public.dispute_responses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. dispute_evidence — Evidence file links
-- ============================================================
CREATE TABLE public.dispute_evidence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE RESTRICT,
  submitted_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  submitted_by_role public.transaction_actor_role NOT NULL,
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE RESTRICT,
  evidence_type public.dispute_evidence_type NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dispute_evidence ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_dispute_evidence_dispute ON public.dispute_evidence (dispute_id);
CREATE INDEX idx_dispute_evidence_submitted_by ON public.dispute_evidence (submitted_by_user_id);
CREATE INDEX idx_dispute_evidence_file ON public.dispute_evidence (file_id);
CREATE INDEX idx_dispute_evidence_type ON public.dispute_evidence (evidence_type);

-- ============================================================
-- 4. dispute_status_history — Case state transitions
-- ============================================================
CREATE TABLE public.dispute_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE RESTRICT,
  old_status public.dispute_case_status,
  new_status public.dispute_case_status NOT NULL,
  changed_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dispute_status_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_dispute_status_history_dispute ON public.dispute_status_history (dispute_id);
CREATE INDEX idx_dispute_status_history_new_status ON public.dispute_status_history (new_status);
CREATE INDEX idx_dispute_status_history_changed_at ON public.dispute_status_history (changed_at);

-- ============================================================
-- 5. dispute_outcomes — Final resolution
-- ============================================================
CREATE TABLE public.dispute_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE RESTRICT,
  outcome_type public.dispute_outcome_type NOT NULL,
  resolved_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decision_summary TEXT NOT NULL,
  refund_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  release_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  resolved_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dispute_outcomes_dispute UNIQUE (dispute_id)
);

ALTER TABLE public.dispute_outcomes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_dispute_outcomes_resolved_by ON public.dispute_outcomes (resolved_by_user_id);
CREATE INDEX idx_dispute_outcomes_type ON public.dispute_outcomes (outcome_type);

CREATE TRIGGER update_dispute_outcomes_updated_at BEFORE UPDATE ON public.dispute_outcomes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
