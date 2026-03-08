
-- ============================================================
-- SafeDeal Batch 6: Notifications, Audit, System Monitoring
-- Skipped: webhook_logs (covered by payment_webhook_logs)
-- ============================================================

-- ======================== ENUMS =============================

CREATE TYPE public.notification_type AS ENUM (
  'transaction_update',
  'payment_update',
  'delivery_update',
  'dispute_update',
  'verification_update',
  'security_alert',
  'system_message'
);

CREATE TYPE public.notification_channel AS ENUM (
  'in_app',
  'email',
  'sms',
  'push'
);

CREATE TYPE public.notification_status AS ENUM (
  'pending',
  'sent',
  'failed',
  'read'
);

CREATE TYPE public.audit_action_type AS ENUM (
  'profile_update',
  'profile_suspend',
  'profile_activate',
  'transaction_created',
  'transaction_cancelled',
  'payment_received',
  'payment_failed',
  'payout_released',
  'refund_processed',
  'dispute_opened',
  'dispute_resolved',
  'verification_completed',
  'system_action'
);

CREATE TYPE public.system_log_level AS ENUM (
  'info',
  'warning',
  'error',
  'critical'
);

-- ============================================================
-- 1. notifications
-- ============================================================
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  channel public.notification_channel NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  status public.notification_status NOT NULL DEFAULT 'pending',
  read_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_notifications_user_status ON public.notifications (user_id, status);
CREATE INDEX idx_notifications_transaction ON public.notifications (related_transaction_id);

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. notification_deliveries
-- ============================================================
CREATE TABLE public.notification_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  channel public.notification_channel NOT NULL,
  delivery_status public.notification_status NOT NULL,
  provider_response TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_notification_deliveries_notification ON public.notification_deliveries (notification_id);

-- ============================================================
-- 3. audit_logs (immutable)
-- ============================================================
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action public.audit_action_type NOT NULL,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  description TEXT,
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX idx_audit_logs_transaction ON public.audit_logs (transaction_id);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs (actor_user_id);

-- ============================================================
-- 4. system_logs (immutable)
-- ============================================================
CREATE TABLE public.system_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level public.system_log_level NOT NULL,
  service_name TEXT NOT NULL,
  message TEXT NOT NULL,
  stack_trace TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_system_logs_level ON public.system_logs (level);
CREATE INDEX idx_system_logs_service ON public.system_logs (service_name);

-- ============================================================
-- 5. background_jobs
-- ============================================================
CREATE TABLE public.background_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name TEXT NOT NULL,
  job_status TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_background_jobs_name ON public.background_jobs (job_name);
CREATE INDEX idx_background_jobs_status ON public.background_jobs (job_status);

CREATE TRIGGER update_background_jobs_updated_at BEFORE UPDATE ON public.background_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
