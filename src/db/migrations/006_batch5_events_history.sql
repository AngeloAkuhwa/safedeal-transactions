
-- ============================================================
-- SafeDeal Batch 5: Transaction Events, Status History,
--                    Money Status History, Delivery Updates,
--                    Delivery Tracking, Delivery Confirmations
-- ============================================================

-- ======================== ENUMS =============================

CREATE TYPE public.transaction_event_type AS ENUM (
  'transaction_created',
  'transaction_link_opened',
  'buyer_joined',
  'payment_received',
  'agreement_locked',
  'funds_held',
  'seller_preparing_delivery',
  'seller_dispatched',
  'delivered',
  'verification_window_opened',
  'buyer_confirmed',
  'dispute_opened',
  'seller_responded',
  'refund_issued',
  'payout_released',
  'auto_cancelled',
  'auto_released'
);

CREATE TYPE public.transaction_actor_role AS ENUM (
  'buyer',
  'seller',
  'admin',
  'system'
);

CREATE TYPE public.delivery_update_status AS ENUM (
  'processing',
  'dispatched',
  'delivered'
);

-- ============================================================
-- 1. transaction_events
-- ============================================================
CREATE TABLE public.transaction_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  event_type public.transaction_event_type NOT NULL,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role public.transaction_actor_role,
  event_data JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_transaction_events_txn ON public.transaction_events (transaction_id);
CREATE INDEX idx_transaction_events_type ON public.transaction_events (event_type);
CREATE INDEX idx_transaction_events_occurred ON public.transaction_events (occurred_at);

-- ============================================================
-- 2. transaction_status_history
-- ============================================================
CREATE TABLE public.transaction_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  old_status public.transaction_status,
  new_status public.transaction_status NOT NULL,
  changed_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_status_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_txn_status_history_txn ON public.transaction_status_history (transaction_id);
CREATE INDEX idx_txn_status_history_new ON public.transaction_status_history (new_status);
CREATE INDEX idx_txn_status_history_changed ON public.transaction_status_history (changed_at);

-- ============================================================
-- 3. money_status_history
-- ============================================================
CREATE TABLE public.money_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  old_status public.money_status,
  new_status public.money_status NOT NULL,
  changed_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.money_status_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_money_status_history_txn ON public.money_status_history (transaction_id);
CREATE INDEX idx_money_status_history_new ON public.money_status_history (new_status);
CREATE INDEX idx_money_status_history_changed ON public.money_status_history (changed_at);

-- ============================================================
-- 4. delivery_updates
-- ============================================================
CREATE TABLE public.delivery_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  status public.delivery_update_status NOT NULL,
  notes TEXT,
  updated_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_updates ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_delivery_updates_txn ON public.delivery_updates (transaction_id);
CREATE INDEX idx_delivery_updates_status ON public.delivery_updates (status);
CREATE INDEX idx_delivery_updates_created ON public.delivery_updates (created_at);

-- ============================================================
-- 5. delivery_tracking_details
-- ============================================================
CREATE TABLE public.delivery_tracking_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  courier_name TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  shipped_at TIMESTAMPTZ,
  expected_delivery_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  signature_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_tracking_details ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_delivery_tracking_number ON public.delivery_tracking_details (tracking_number);

CREATE TRIGGER update_delivery_tracking_details_updated_at BEFORE UPDATE ON public.delivery_tracking_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6. delivery_confirmations
-- ============================================================
CREATE TABLE public.delivery_confirmations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  seller_marked_delivered_at TIMESTAMPTZ,
  buyer_acknowledged_delivery_at TIMESTAMPTZ,
  system_delivery_marked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_confirmations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_delivery_confirmations_txn ON public.delivery_confirmations (transaction_id);

CREATE TRIGGER update_delivery_confirmations_updated_at BEFORE UPDATE ON public.delivery_confirmations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
