
-- ============================================================
-- SafeDeal Batch 8: Admin Actions, Case Reviews, System Settings, Timeout Rules
-- ============================================================

-- ======================== ENUMS =============================

CREATE TYPE public.admin_action_type AS ENUM (
  'freeze_transaction',
  'request_evidence',
  'extend_deadline',
  'escalate_case',
  'refund_buyer',
  'release_funds',
  'close_case',
  'flag_user',
  'unflag_user',
  'update_setting'
);

CREATE TYPE public.timeout_rule_type AS ENUM (
  'seller_fulfillment_timeout',
  'buyer_verification_timeout'
);

-- ============================================================
-- 1. admin_actions (immutable — no updated_at)
-- ============================================================
CREATE TABLE public.admin_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  dispute_id UUID REFERENCES public.disputes(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_type public.admin_action_type NOT NULL,
  action_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_admin_actions_admin_user ON public.admin_actions (admin_user_id);
CREATE INDEX idx_admin_actions_transaction ON public.admin_actions (transaction_id);
CREATE INDEX idx_admin_actions_dispute ON public.admin_actions (dispute_id);
CREATE INDEX idx_admin_actions_target_user ON public.admin_actions (target_user_id);
CREATE INDEX idx_admin_actions_type ON public.admin_actions (action_type);

-- ============================================================
-- 2. case_reviews (immutable — no updated_at)
-- ============================================================
CREATE TABLE public.case_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE RESTRICT,
  reviewed_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  review_notes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.case_reviews ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_case_reviews_dispute ON public.case_reviews (dispute_id);
CREATE INDEX idx_case_reviews_reviewer ON public.case_reviews (reviewed_by_user_id);

-- ============================================================
-- 3. system_settings (mutable)
-- ============================================================
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_system_settings_key ON public.system_settings (setting_key);

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4. timeout_rules (mutable)
-- ============================================================
CREATE TABLE public.timeout_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_type public.timeout_rule_type NOT NULL UNIQUE,
  hours_until_trigger INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.timeout_rules ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_timeout_rules_type ON public.timeout_rules (rule_type);
CREATE INDEX idx_timeout_rules_active ON public.timeout_rules (is_active);

CREATE TRIGGER update_timeout_rules_updated_at BEFORE UPDATE ON public.timeout_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
