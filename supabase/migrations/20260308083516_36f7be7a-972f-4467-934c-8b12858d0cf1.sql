
-- ============================================================
-- SafeDeal Batch 2: Transaction Core
-- ============================================================

-- ======================== ENUMS =============================

CREATE TYPE public.transaction_status AS ENUM (
  'draft',
  'awaiting_buyer',
  'awaiting_payment',
  'payment_secured',
  'seller_preparing_delivery',
  'seller_dispatched',
  'delivered_awaiting_verification',
  'completed',
  'disputed',
  'cancelled',
  'timed_out'
);

CREATE TYPE public.money_status AS ENUM (
  'not_secured',
  'payment_pending',
  'funds_held_in_escrow',
  'funds_frozen',
  'funds_releasing',
  'funds_released',
  'refund_pending',
  'refund_issued'
);

CREATE TYPE public.dispute_status AS ENUM (
  'none',
  'open',
  'seller_response_pending',
  'under_review',
  'resolved'
);

CREATE TYPE public.transaction_party_role AS ENUM (
  'buyer',
  'seller'
);

CREATE TYPE public.item_condition AS ENUM (
  'brand_new',
  'like_new',
  'excellent',
  'good',
  'fair',
  'used'
);

CREATE TYPE public.delivery_method_type AS ENUM (
  'courier',
  'pickup',
  'meetup',
  'hand_delivery'
);

-- ============================================================
-- 1. transactions
-- ============================================================
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_code TEXT UNIQUE NOT NULL,

  buyer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  status public.transaction_status NOT NULL DEFAULT 'draft',
  money_status public.money_status NOT NULL DEFAULT 'not_secured',
  dispute_status public.dispute_status NOT NULL DEFAULT 'none',

  region_id UUID REFERENCES public.serviceable_regions(id) ON DELETE SET NULL,

  buyer_contact_email TEXT,
  buyer_contact_phone TEXT,

  share_token TEXT UNIQUE NOT NULL,
  share_link_expires_at TIMESTAMPTZ,

  agreement_locked_at TIMESTAMPTZ,
  payment_received_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  verification_deadline_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_transactions_seller ON public.transactions (seller_id);
CREATE INDEX idx_transactions_buyer ON public.transactions (buyer_id);
CREATE INDEX idx_transactions_status ON public.transactions (status);
CREATE INDEX idx_transactions_money_status ON public.transactions (money_status);

-- ============================================================
-- 2. transaction_participants
-- ============================================================
CREATE TABLE public.transaction_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  role public.transaction_party_role NOT NULL,

  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_transaction_participant_role UNIQUE (transaction_id, role)
);

ALTER TABLE public.transaction_participants ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_transaction_participants_txn ON public.transaction_participants (transaction_id);

-- ============================================================
-- 3. transaction_items
-- ============================================================
CREATE TABLE public.transaction_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT NOT NULL,

  quantity INTEGER NOT NULL DEFAULT 1,

  condition_label public.item_condition NOT NULL,

  brand TEXT,
  model TEXT,

  warranty_info TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_transaction_items_txn ON public.transaction_items (transaction_id);

-- ============================================================
-- 4. transaction_pricing
-- ============================================================
CREATE TABLE public.transaction_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,

  currency_code TEXT NOT NULL,

  item_amount NUMERIC(18,2) NOT NULL,

  platform_fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  processing_fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

  seller_net_amount NUMERIC(18,2) NOT NULL,
  buyer_total_amount NUMERIC(18,2) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_pricing ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. transaction_delivery_terms
-- ============================================================
CREATE TABLE public.transaction_delivery_terms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,

  delivery_method public.delivery_method_type NOT NULL,

  expected_delivery_date DATE NOT NULL,

  verification_window_hours INTEGER NOT NULL,

  delivery_address_line1 TEXT,
  delivery_address_line2 TEXT,
  delivery_city TEXT,
  delivery_state TEXT,
  delivery_country_code TEXT,
  delivery_postal_code TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_delivery_terms ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. transaction_notes
-- ============================================================
CREATE TABLE public.transaction_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,

  seller_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_notes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. transaction_links
-- ============================================================
CREATE TABLE public.transaction_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,

  share_token TEXT UNIQUE NOT NULL,

  url TEXT NOT NULL,

  expires_at TIMESTAMPTZ,

  first_opened_at TIMESTAMPTZ,
  opened_count INTEGER NOT NULL DEFAULT 0,
  last_opened_at TIMESTAMPTZ,

  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_transaction_links_token ON public.transaction_links (share_token);

-- ============================================================
-- Apply updated_at triggers (reuse existing function)
-- ============================================================
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transaction_items_updated_at BEFORE UPDATE ON public.transaction_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transaction_pricing_updated_at BEFORE UPDATE ON public.transaction_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transaction_delivery_terms_updated_at BEFORE UPDATE ON public.transaction_delivery_terms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transaction_notes_updated_at BEFORE UPDATE ON public.transaction_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transaction_links_updated_at BEFORE UPDATE ON public.transaction_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
