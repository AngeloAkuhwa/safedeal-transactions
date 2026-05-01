
-- =========================================================================
-- 018 — Dual-Confirmation Release Model
-- =========================================================================

-- 1. Enum additions ------------------------------------------------------
ALTER TYPE public.money_status ADD VALUE IF NOT EXISTS 'funds_pending_release' BEFORE 'funds_releasing';
ALTER TYPE public.payout_status ADD VALUE IF NOT EXISTS 'awaiting_release' BEFORE 'pending';
ALTER TYPE public.payout_status ADD VALUE IF NOT EXISTS 'blocked';
ALTER TYPE public.escrow_ledger_entry_type ADD VALUE IF NOT EXISTS 'payout_awaiting_release';

-- 2. Tighten validate_money_transition -----------------------------------
-- Removes the legacy 'funds_held_in_escrow → funds_releasing' escape hatch.
CREATE OR REPLACE FUNCTION public.validate_money_transition(_old_status money_status, _new_status money_status)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Terminal states
  IF _old_status IN ('funds_released', 'refund_issued') THEN
    RETURN false;
  END IF;

  RETURN CASE _old_status
    WHEN 'not_secured' THEN
      _new_status IN ('payment_pending')
    WHEN 'payment_pending' THEN
      _new_status IN ('funds_held_in_escrow', 'not_secured')
    WHEN 'funds_held_in_escrow' THEN
      _new_status IN ('funds_pending_release', 'funds_frozen')
    WHEN 'funds_pending_release' THEN
      _new_status IN ('funds_releasing', 'funds_frozen', 'refund_pending')
    WHEN 'funds_frozen' THEN
      _new_status IN ('funds_pending_release', 'refund_pending')
    WHEN 'funds_releasing' THEN
      _new_status IN ('funds_released', 'funds_pending_release')
    WHEN 'refund_pending' THEN
      _new_status IN ('refund_issued')
    ELSE false
  END;
END;
$function$;

-- 3. Transactions: confirmation + release review columns ----------------
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS buyer_confirmed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS seller_confirmed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS release_approved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS release_approved_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS needs_release_review    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS release_review_reason   text;

CREATE INDEX IF NOT EXISTS idx_transactions_needs_release_review
  ON public.transactions(needs_release_review) WHERE needs_release_review = true;

-- 4. Payouts: release approval & blocked fields -------------------------
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS release_approved_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS released_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS payout_blocked_reason       text,
  ADD COLUMN IF NOT EXISTS release_blocked             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS failed_attempt_count        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes                       text;

-- 5. transaction_completion_confirmations -------------------------------
CREATE TABLE IF NOT EXISTS public.transaction_completion_confirmations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id       uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  confirmed_by_role    public.user_role_type NOT NULL,
  confirmed_by_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  confirmed_at         timestamptz NOT NULL DEFAULT now(),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tcc_role_check CHECK (confirmed_by_role IN ('buyer','seller')),
  CONSTRAINT tcc_unique_per_role UNIQUE (transaction_id, confirmed_by_role)
);

CREATE INDEX IF NOT EXISTS idx_tcc_transaction ON public.transaction_completion_confirmations(transaction_id);

ALTER TABLE public.transaction_completion_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties_select_completion_confirmations"
  ON public.transaction_completion_confirmations
  FOR SELECT TO authenticated
  USING (public.is_transaction_party(auth.uid(), transaction_id));

CREATE POLICY "admins_select_all_completion_confirmations"
  ON public.transaction_completion_confirmations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type));

CREATE TRIGGER prevent_tcc_delete
  BEFORE DELETE ON public.transaction_completion_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete();

-- 6. release_review_queue ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.release_review_queue (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id       uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  payout_id            uuid REFERENCES public.payouts(id) ON DELETE RESTRICT,
  seller_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount               numeric(18,2),
  currency_code        text DEFAULT 'NGN',
  queue_type           text NOT NULL,
  status               text NOT NULL DEFAULT 'pending',
  entered_queue_at     timestamptz NOT NULL DEFAULT now(),
  claimed_by_user_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_at           timestamptz,
  resolved_at          timestamptz,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rrq_queue_type_check CHECK (queue_type IN (
    'ready_for_release',
    'payout_account_missing',
    'pricing_missing',
    'stuck_confirmation',
    'silent_dispute',
    'failed_payout',
    'refund_request',
    'manual_hold'
  )),
  CONSTRAINT rrq_status_check CHECK (status IN ('pending','claimed','resolved','cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS rrq_unique_open_per_type
  ON public.release_review_queue(transaction_id, queue_type)
  WHERE status IN ('pending','claimed');

CREATE INDEX IF NOT EXISTS idx_rrq_status_type_time
  ON public.release_review_queue(status, queue_type, entered_queue_at);

CREATE INDEX IF NOT EXISTS idx_rrq_seller ON public.release_review_queue(seller_id);

ALTER TABLE public.release_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_select_release_queue"
  ON public.release_review_queue
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type));

CREATE POLICY "admins_update_release_queue"
  ON public.release_review_queue
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::user_role_type))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role_type));

CREATE POLICY "admins_insert_release_queue"
  ON public.release_review_queue
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::user_role_type));

CREATE TRIGGER update_rrq_updated_at
  BEFORE UPDATE ON public.release_review_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
