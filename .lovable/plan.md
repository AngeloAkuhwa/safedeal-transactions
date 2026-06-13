
# Phase 2 — DB Hardening (one migration)

Goal: add the canonical derived columns referenced by the Phase 1 shared modules, lock pricing after payment, guard dispute transitions, and ship one view that lets the table and drawer agree on payout-account state. **No column renames. No data math changes. Old transactions untouched.**

File: `src/db/migrations/018_central_payment_snapshot_hardening.sql`

---

## 1. Extend `transaction_pricing` (additive only)

```text
ALTER TABLE public.transaction_pricing
  ADD COLUMN payment_processing_fee_amount NUMERIC(18,2),
  ADD COLUMN seller_payout_amount         NUMERIC(18,2),
  ADD COLUMN is_total_service_fee_capped  BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN pricing_model_version        TEXT;
```

Backfill (idempotent):
- `payment_processing_fee_amount = processing_fee_amount` for all rows.
- `seller_payout_amount = item_amount` for all rows. (Per spec §17 we don't recompute legacy rows. `seller_net_amount` stays untouched; the new column is the canonical seller-payout source going forward.)
- `pricing_model_version` left `NULL` for pre-migration rows (spec §17 explicitly says don't stamp old rows).
- `is_total_service_fee_capped` derived: `(processing_fee_amount + platform_fee_amount) >= 2500`.

CHECK constraints (validate at insert/update time):
- `payment_processing_fee_amount >= 0`
- `seller_payout_amount >= 0`

Why this matters: future reads use `payment_processing_fee_amount` and `seller_payout_amount` as the single canonical source. Old code that still reads `processing_fee_amount` / `seller_net_amount` keeps working — both columns coexist during the Phase 3 cut-over.

---

## 2. Pricing-lock trigger (the §7.1 fix)

Block any `UPDATE` on `transaction_pricing` after payment has been processed, with one controlled escape hatch.

```text
CREATE OR REPLACE FUNCTION public.prevent_pricing_update_after_lock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_locked     TIMESTAMPTZ;
  v_money      money_status;
  v_override   BOOLEAN := COALESCE(current_setting('safedeal.pricing_override', true) = 'on', false);
BEGIN
  IF v_override THEN
    RETURN NEW;  -- only set by admin_correct_pricing()
  END IF;

  SELECT agreement_locked_at, money_status
    INTO v_locked, v_money
  FROM public.transactions
  WHERE id = NEW.transaction_id;

  IF v_locked IS NOT NULL
     OR v_money IN ('funds_held_in_escrow','funds_pending_release','funds_releasing',
                    'funds_released','funds_frozen','refund_pending','refund_issued') THEN
    RAISE EXCEPTION 'transaction_pricing is locked after payment (tx=%, money_status=%)',
      NEW.transaction_id, v_money
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_prevent_pricing_update
  BEFORE UPDATE ON public.transaction_pricing
  FOR EACH ROW EXECUTE FUNCTION public.prevent_pricing_update_after_lock();
```

Escape-hatch RPC (admin-only correction):

```text
CREATE OR REPLACE FUNCTION public.admin_correct_pricing(
  p_transaction_id UUID,
  p_item_amount    NUMERIC,
  p_safedeal_fee   NUMERIC,
  p_processing_fee NUMERIC,
  p_reason         TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID := auth.uid();
  v_old   RECORD;
BEGIN
  IF NOT public.has_role(v_admin, 'super_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_item_amount < 0 OR p_safedeal_fee < 0 OR p_processing_fee < 0 THEN
    RAISE EXCEPTION 'invalid_amounts' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old FROM public.transaction_pricing WHERE transaction_id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pricing_not_found'; END IF;

  PERFORM set_config('safedeal.pricing_override', 'on', true);  -- txn-scoped
  UPDATE public.transaction_pricing
     SET item_amount                    = p_item_amount,
         platform_fee_amount            = p_safedeal_fee,
         processing_fee_amount          = p_processing_fee,
         payment_processing_fee_amount  = p_processing_fee,
         buyer_total_amount             = p_item_amount + p_safedeal_fee + p_processing_fee,
         seller_payout_amount           = p_item_amount,
         is_total_service_fee_capped    = (p_safedeal_fee + p_processing_fee) >= 2500,
         updated_at                     = now()
   WHERE transaction_id = p_transaction_id;

  -- Audit
  INSERT INTO public.admin_actions(admin_user_id, action_type, target_type, target_id, reason, metadata)
  VALUES (v_admin, 'admin_correct_pricing', 'transaction', p_transaction_id, p_reason,
          jsonb_build_object('old', to_jsonb(v_old), 'new', jsonb_build_object(
            'item_amount', p_item_amount, 'safedeal_fee', p_safedeal_fee,
            'processing_fee', p_processing_fee)));

  INSERT INTO public.transaction_events(transaction_id, event_type, actor_user_id, metadata)
  VALUES (p_transaction_id, 'pricing_corrected', v_admin,
          jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.admin_correct_pricing(UUID,NUMERIC,NUMERIC,NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_correct_pricing(UUID,NUMERIC,NUMERIC,NUMERIC,TEXT) TO authenticated, service_role;
```

The session var `safedeal.pricing_override` is set inside the same transaction so the trigger sees it; `set_config(..., true)` scopes it to the transaction so it can't leak.

Caveat: if `admin_actions` / `transaction_events` columns differ slightly from what I show above, the migration will adjust the `INSERT` shapes to match the live schema — I'll re-read both tables before issuing the migration to keep the inserts strictly typed.

---

## 3. Dispute-status transition trigger (the §7.4 fix)

`disputes.status` is the `dispute_case_status` enum (`open | seller_response_pending | under_review | resolved`). Today only app code enforces the matrix; this puts it in the database, matching the strength of `validate_transaction_transition` / `validate_money_transition` from migrations 013/014.

```text
CREATE OR REPLACE FUNCTION public.validate_dispute_transition(
  old_status dispute_case_status,
  new_status dispute_case_status
) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF old_status = new_status THEN RETURN TRUE; END IF;
  RETURN CASE old_status
    WHEN 'open'                    THEN new_status IN ('seller_response_pending','under_review','resolved')
    WHEN 'seller_response_pending' THEN new_status IN ('under_review','resolved')
    WHEN 'under_review'            THEN new_status =  'resolved'
    WHEN 'resolved'                THEN FALSE                  -- terminal
    ELSE FALSE
  END;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_dispute_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT public.validate_dispute_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'invalid dispute transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER enforce_dispute_state_machine
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dispute_transition();
```

`resolve_dispute_atomic` already conforms — no app-side change needed.

---

## 4. `v_payout_account_state` view (the §7.5 fix)

One canonical answer for every screen — the four-state model the table and drawer must share. `security_invoker = on` so it respects the caller's RLS on `payout_accounts`.

```text
CREATE OR REPLACE VIEW public.v_payout_account_state
WITH (security_invoker = on) AS
WITH ranked AS (
  SELECT
    pa.user_id,
    pa.id              AS account_id,
    pa.bank_name,
    pa.masked_account_number,
    pa.verification_status,
    pa.provider_recipient_code,
    pa.last_verified_at,
    ROW_NUMBER() OVER (
      PARTITION BY pa.user_id
      ORDER BY (pa.verification_status = 'verified') DESC,
               pa.last_verified_at DESC NULLS LAST,
               pa.updated_at DESC
    ) AS rn
  FROM public.payout_accounts pa
)
SELECT
  user_id,
  account_id,
  bank_name,
  masked_account_number,
  verification_status,
  provider_recipient_code,
  last_verified_at,
  CASE
    WHEN account_id IS NULL                                              THEN 'no_account'
    WHEN verification_status <> 'verified'                               THEN 'unverified'
    WHEN verification_status = 'verified' AND provider_recipient_code IS NULL
                                                                         THEN 'verified_no_recipient'
    ELSE 'verified_ready'
  END AS account_state
FROM ranked
WHERE rn = 1;

GRANT SELECT ON public.v_payout_account_state TO authenticated, service_role;
```

Note: `payout_accounts` has no `is_default` column, so "the current account" = highest priority by (verified, last_verified_at, updated_at). The Phase 1 `payout-eligibility.ts` will be updated in Phase 3 to read from this view instead of its current `is_default` ordering (which was the wrong assumption).

---

## 5. Optional small index

```text
CREATE INDEX IF NOT EXISTS idx_payouts_tx_status
  ON public.payouts(transaction_id, status);
```

Only added if it doesn't already exist. Helps the eligibility evaluator's "find the current payout" lookup.

---

## 6. GRANTs

No new tables — only column additions, functions, and a view, so no per-table grants needed. RPC grants are inline (admin function: `authenticated`/`service_role` only). View grant included above.

---

## 7. What this migration deliberately does NOT do

- No rename of existing columns (`processing_fee_amount`, `seller_net_amount`, `buyer_total_amount` stay).
- No recomputation of old rows. Pricing math is unchanged. The cap stays ₦2,500.
- No new payout/dispute/refund enums.
- No reconciliation tables, no provider-balance tracker, no dual-approval tables — those were deferred (Decision 6).
- No edit to the existing `validate_transaction_transition` / `validate_money_transition` matrix.

---

## 8. Verification after the migration runs

I'll run, in this order:

1. `supabase--linter` — confirm no new "RLS disabled" or "policy missing" warnings (we touch only existing tables + a view).
2. Spot-check via `supabase--read_query`:
   - `SELECT count(*) FILTER (WHERE payment_processing_fee_amount IS NULL) FROM transaction_pricing;` → expect 0.
   - `SELECT count(*) FILTER (WHERE seller_payout_amount IS NULL) FROM transaction_pricing;` → expect 0.
   - `SELECT * FROM v_payout_account_state LIMIT 5;` → 4 distinct account_state values exercised by real data.
3. Negative test for pricing lock (using a test transaction in a non-prod state): direct `UPDATE transaction_pricing SET item_amount = …` against a locked tx → expect "transaction_pricing is locked after payment" error.
4. Negative test for dispute trigger: attempt `UPDATE disputes SET status = 'open' WHERE status = 'resolved'` → expect "invalid dispute transition".

---

## 9. Rollback plan (if anything goes sideways)

The migration is purely additive at the table level. A reversal migration would:

- `DROP TRIGGER trg_prevent_pricing_update ON public.transaction_pricing;` + `DROP FUNCTION prevent_pricing_update_after_lock`.
- `DROP TRIGGER enforce_dispute_state_machine ON public.disputes;` + `DROP FUNCTION enforce_dispute_transition, validate_dispute_transition`.
- `DROP VIEW v_payout_account_state;`
- `DROP FUNCTION admin_correct_pricing`.
- Leave the four new columns in place (their absence would be a typegen churn for no real benefit).

---

## 10. After Phase 2 lands

- Regenerated Supabase types will surface the four new columns; Phase 1's `snapshotFromPersisted` / `snapshotFromRow` automatically pick them up via the `??` fallbacks already written.
- Phase 3 (edge-function wiring) becomes straightforward: every checkout writes the new columns at creation time, every payout reads `seller_payout_amount` only, every refund reads via `evaluateRefundEligibility`.

Approve and I'll author and submit the migration via `supabase--migration` (one call, full SQL inline, awaiting your approval before it runs).
