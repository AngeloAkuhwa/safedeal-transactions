
-- ============================================================
-- SafeDeal Batch 4: Files, Cloudinary Metadata, Transaction Media,
--                    Agreement Snapshots, Delivery Proof
-- ============================================================

-- ======================== ENUMS =============================

CREATE TYPE public.file_provider AS ENUM ('cloudinary', 'manual');

CREATE TYPE public.file_resource_type AS ENUM ('image', 'video', 'raw', 'document');

CREATE TYPE public.file_context_type AS ENUM (
  'transaction_media',
  'delivery_proof',
  'dispute_evidence',
  'response_evidence',
  'system_attachment'
);

CREATE TYPE public.file_retention_category AS ENUM (
  'draft_upload',
  'transaction_media',
  'delivery_proof',
  'dispute_evidence',
  'response_evidence',
  'system_attachment'
);

CREATE TYPE public.transaction_media_type AS ENUM ('image', 'video');

CREATE TYPE public.delivery_proof_type AS ENUM (
  'shipping_receipt',
  'package_photo',
  'signature_proof',
  'shipment_video',
  'other'
);

-- ============================================================
-- 1. files — Central metadata registry
-- ============================================================
CREATE TABLE public.files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  provider public.file_provider NOT NULL,
  provider_asset_id TEXT NOT NULL,

  resource_type public.file_resource_type NOT NULL,

  file_url TEXT NOT NULL,
  secure_url TEXT,

  original_file_name TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT,

  uploaded_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  context_type public.file_context_type NOT NULL,

  is_temporary BOOLEAN NOT NULL DEFAULT true,

  retention_category public.file_retention_category NOT NULL,
  retain_until TIMESTAMPTZ,

  legal_hold BOOLEAN NOT NULL DEFAULT false,

  deleted_from_provider BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,

  metadata_json JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_file_provider_asset UNIQUE (provider, provider_asset_id)
);

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_files_provider ON public.files (provider);
CREATE INDEX idx_files_provider_asset_id ON public.files (provider_asset_id);
CREATE INDEX idx_files_context_type ON public.files (context_type);
CREATE INDEX idx_files_retention_category ON public.files (retention_category);
CREATE INDEX idx_files_retain_until ON public.files (retain_until);
CREATE INDEX idx_files_deleted_from_provider ON public.files (deleted_from_provider);

CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. transaction_media — Product images/videos linked to transactions
-- ============================================================
CREATE TABLE public.transaction_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,

  media_type public.transaction_media_type NOT NULL,

  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_media ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_transaction_media_txn ON public.transaction_media (transaction_id);
CREATE INDEX idx_transaction_media_file ON public.transaction_media (file_id);
CREATE INDEX idx_transaction_media_sort ON public.transaction_media (sort_order);

-- ============================================================
-- 3. transaction_agreement_snapshots — Immutable locked agreement
-- ============================================================
CREATE TABLE public.transaction_agreement_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,

  snapshot_json JSONB NOT NULL,

  locked_at TIMESTAMPTZ NOT NULL,

  locked_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_agreement_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_agreement_snapshots_txn ON public.transaction_agreement_snapshots (transaction_id);

-- ============================================================
-- 4. delivery_proof_files — Seller proof uploads
-- ============================================================
CREATE TABLE public.delivery_proof_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,

  proof_type public.delivery_proof_type NOT NULL,

  uploaded_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_proof_files ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_delivery_proof_txn ON public.delivery_proof_files (transaction_id);
CREATE INDEX idx_delivery_proof_file ON public.delivery_proof_files (file_id);
CREATE INDEX idx_delivery_proof_type ON public.delivery_proof_files (proof_type);
