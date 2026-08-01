SET lock_timeout = '3s';
SET statement_timeout = '60s';

ALTER TABLE public.escrow_ledger_entries ADD COLUMN idempotency_key text;
ALTER TABLE public.escrow_ledger_entries ADD COLUMN payload_fingerprint text;

ALTER TABLE public.escrow_ledger_entries
  ADD CONSTRAINT escrow_ledger_idem_key_shape
  CHECK (idempotency_key IS NULL OR (length(idempotency_key) BETWEEN 8 AND 200 AND idempotency_key !~ '\s'));

ALTER TABLE public.escrow_ledger_entries
  ADD CONSTRAINT escrow_ledger_fingerprint_shape
  CHECK (payload_fingerprint IS NULL OR payload_fingerprint ~ '^v1:[0-9a-f]{64}$');

ALTER TABLE public.escrow_ledger_entries
  ADD CONSTRAINT escrow_ledger_idem_paired
  CHECK ((idempotency_key IS NULL AND payload_fingerprint IS NULL)
      OR (idempotency_key IS NOT NULL AND payload_fingerprint IS NOT NULL));

CREATE UNIQUE INDEX escrow_ledger_idem_key
  ON public.escrow_ledger_entries (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE public.financial_idempotency_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  existing_fingerprint text NOT NULL,
  incoming_fingerprint text NOT NULL,
  transaction_id uuid,
  entry_type public.escrow_ledger_entry_type,
  correlation_id uuid,
  actor_user_id uuid,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX financial_idem_conflict_dedupe
  ON public.financial_idempotency_conflicts (idempotency_key, existing_fingerprint, incoming_fingerprint);

REVOKE ALL ON public.financial_idempotency_conflicts FROM anon, authenticated;
GRANT ALL ON public.financial_idempotency_conflicts TO service_role;

ALTER TABLE public.financial_idempotency_conflicts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER financial_idem_conflicts_updated_at
  BEFORE UPDATE ON public.financial_idempotency_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();