
-- ============================================================
-- SafeDeal Batch 1: Identity, Access, Verification, Security & Rollout
-- ============================================================

-- Enums
CREATE TYPE public.user_role_type AS ENUM ('buyer', 'seller', 'admin');
CREATE TYPE public.profile_status AS ENUM ('active', 'suspended', 'blocked');

-- ============================================================
-- 1. serviceable_regions (no FK dependencies)
-- ============================================================
CREATE TABLE public.serviceable_regions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL,
  state_name TEXT NOT NULL,
  city_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  launch_phase INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_serviceable_region UNIQUE (country_code, state_name, city_name)
);

ALTER TABLE public.serviceable_regions ENABLE ROW LEVEL SECURITY;

-- Seed Lagos
INSERT INTO public.serviceable_regions (country_code, state_name, city_name, is_active, launch_phase)
VALUES ('NG', 'Lagos', 'Lagos', true, 1);

-- ============================================================
-- 2. profiles
-- ============================================================
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  phone TEXT UNIQUE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  default_role public.user_role_type NOT NULL DEFAULT 'buyer',
  status public.profile_status NOT NULL DEFAULT 'active',
  country_code TEXT NOT NULL DEFAULT 'NG',
  state_name TEXT,
  city_name TEXT,
  default_region_id UUID REFERENCES public.serviceable_regions(id),
  is_region_eligible BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_profiles_status ON public.profiles (status);
CREATE INDEX idx_profiles_default_region ON public.profiles (default_region_id);

-- ============================================================
-- 3. user_roles
-- ============================================================
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.user_role_type NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_role UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_user_roles_user ON public.user_roles (user_id);

-- ============================================================
-- 4. devices
-- ============================================================
CREATE TABLE public.devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_fingerprint TEXT,
  device_name TEXT,
  platform TEXT,
  browser_name TEXT,
  last_ip INET,
  last_seen_at TIMESTAMPTZ,
  is_trusted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_devices_user ON public.devices (user_id);

-- ============================================================
-- 5. user_sessions
-- ============================================================
CREATE TABLE public.user_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  session_token_hash TEXT NOT NULL,
  ip_address INET,
  country_code TEXT,
  state_name TEXT,
  city_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_user_sessions_active ON public.user_sessions (user_id, is_active);

-- ============================================================
-- 6. account_verifications
-- ============================================================
CREATE TABLE public.account_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  identity_verified BOOLEAN NOT NULL DEFAULT false,
  payout_verified BOOLEAN NOT NULL DEFAULT false,
  verification_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_account_verification_user UNIQUE (user_id)
);

ALTER TABLE public.account_verifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. notification_preferences
-- ============================================================
CREATE TABLE public.notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_updates BOOLEAN NOT NULL DEFAULT true,
  delivery_updates BOOLEAN NOT NULL DEFAULT true,
  dispute_updates BOOLEAN NOT NULL DEFAULT true,
  verification_reminders BOOLEAN NOT NULL DEFAULT true,
  system_alerts BOOLEAN NOT NULL DEFAULT true,
  marketing_messages BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. user_region_access_logs
-- ============================================================
CREATE TABLE public.user_region_access_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_address INET,
  country_code TEXT,
  state_name TEXT,
  city_name TEXT,
  access_result TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_region_access_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_region_access_logs_user ON public.user_region_access_logs (user_id);
CREATE INDEX idx_region_access_logs_created ON public.user_region_access_logs (created_at);

-- ============================================================
-- Shared updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_serviceable_regions_updated_at BEFORE UPDATE ON public.serviceable_regions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_account_verifications_updated_at BEFORE UPDATE ON public.account_verifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- has_role() security definer for future RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.user_role_type)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
