
-- ============================================================
-- SafeDeal Batch 3: Payments, Escrow, Ledger, Payouts, Refunds
-- ============================================================

-- ======================== ENUMS =============================

CREATE TYPE public.payment_provider AS ENUM (
  'paystack',
  'flutterwave',
  'stripe',
  'manual'
);

CREATE TYPE public.payment_status AS ENUM (
  'pending',
  'authorized',
  'succeeded',
  'failed',
  'refunded'
);

CREATE TYPE public.payment_method_type AS ENUM (
  'card',
  'bank_transfer',
  'wallet'
);

CREATE TYPE public.escrow_state AS ENUM (
  'awaiting_payment',
  'held',
  'frozen',
  'releasing',
  'released',
  'refunded'
);

CREATE TYPE public.escrow_ledger_entry_type AS ENUM (
  'payment_credit',
  'escrow_hold',
  'freeze_hold',
  'payout_debit',
  'refund_debit',
  'fee_record',
  'adjustment'
);

CREATE TYPE public.payout_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE public.refund_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

-- ============================================================
-- 1. payments
-- ============================================================
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  provider public.payment_provider NOT NULL,
  provider_reference TEXT UNIQUE NOT NULL,

  status public.payment_status NOT NULL DEFAULT 'pending',
  payment_method_type public.payment_method_type NOT NULL,

  currency_code TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,

  authorized_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  failure_reason TEXT,

  raw_payload JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_payments_transaction ON public.payments (transaction_id);
CREATE INDEX idx_payments_provider_reference ON public.payments (provider_reference);
CREATE INDEX idx_payments_status ON public.payments (status);
CREATE INDEX idx_payments_provider ON public.payments (provider);

-- ============================================================
-- 2. payment_webhook_logs (no FK — intentional)
-- ============================================================
CREATE TABLE public.payment_webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  provider public.payment_provider NOT NULL,
  event_type TEXT NOT NULL,
  provider_reference TEXT,

  payload JSONB NOT NULL,

  processed_successfully BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_webhook_logs_provider ON public.payment_webhook_logs (provider);
CREATE INDEX idx_webhook_logs_provider_reference ON public.payment_webhook_logs (provider_reference);
CREATE INDEX idx_webhook_logs_processed ON public.payment_webhook_logs (processed_successfully);

-- ============================================================
-- 3. escrow_states
-- ============================================================
CREATE TABLE public.escrow_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,

  state public.escrow_state NOT NULL DEFAULT 'awaiting_payment',

  held_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  frozen_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  released_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  refunded_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

  last_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.escrow_states ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_escrow_states_state ON public.escrow_states (state);

-- ============================================================
-- 4. escrow_ledger_entries (immutable — no updated_at)
-- ============================================================
CREATE TABLE public.escrow_ledger_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,

  entry_type public.escrow_ledger_entry_type NOT NULL,

  currency_code TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,

  balance_after NUMERIC(18,2),

  reference_type TEXT,
  reference_id UUID,

  notes TEXT,

  created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.escrow_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_escrow_ledger_transaction ON public.escrow_ledger_entries (transaction_id);
CREATE INDEX idx_escrow_ledger_entry_type ON public.escrow_ledger_entries (entry_type);
CREATE INDEX idx_escrow_ledger_created_at ON public.escrow_ledger_entries (created_at);

-- ============================================================
-- 5. payouts
-- ============================================================
CREATE TABLE public.payouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  amount NUMERIC(18,2) NOT NULL,
  currency_code TEXT NOT NULL,

  status public.payout_status NOT NULL DEFAULT 'pending',

  provider_reference TEXT,

  initiated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  failure_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_payouts_transaction ON public.payouts (transaction_id);
CREATE INDEX idx_payouts_seller ON public.payouts (seller_id);
CREATE INDEX idx_payouts_status ON public.payouts (status);

-- ============================================================
-- 6. refunds
-- ============================================================
CREATE TABLE public.refunds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,

  amount NUMERIC(18,2) NOT NULL,
  currency_code TEXT NOT NULL,

  status public.refund_status NOT NULL DEFAULT 'pending',

  provider_reference TEXT,
  reason TEXT,

  initiated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  failure_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_refunds_transaction ON public.refunds (transaction_id);
CREATE INDEX idx_refunds_buyer ON public.refunds (buyer_id);
CREATE INDEX idx_refunds_status ON public.refunds (status);
CREATE INDEX idx_refunds_payment ON public.refunds (payment_id);

-- ============================================================
-- Apply updated_at triggers (mutable tables only)
-- ============================================================
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_escrow_states_updated_at BEFORE UPDATE ON public.escrow_states FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON public.payouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_refunds_updated_at BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
