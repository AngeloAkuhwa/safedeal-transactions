-- ============================================================================
-- pg_default_acl lockdown + privilege residue sweep.
-- 1. Default privileges regenerated the whole hole on every CREATE TABLE:
--    postgres/public and supabase_admin/public granted anon+authenticated
--    arwdDxtm (incl. D = TRUNCATE) on tables, rwU on sequences, X on
--    functions. Revoked for both grantor roles.
-- 2. MAINTAIN / REFERENCES / TRIGGER residue revoked from anon+authenticated
--    on every relation (TRIGGER lets a grantee attach a trigger function).
-- 3. Sequence UPDATE revoked (setval on transaction_code_seq is a durable
--    UNIQUE-collision DoS); anon loses USAGE as well.
-- 4. pg_net http_* EXECUTE revoked from PUBLIC/anon/authenticated (latent SSRF).
-- 5. selftest_refund_rail: p_currency validated and no longer tautological.
-- ============================================================================

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'default privileges for postgres not alterable here';
END $$;

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'default privileges for supabase_admin not alterable here';
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass::text AS rel
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
  LOOP
    EXECUTE format('REVOKE TRIGGER, REFERENCES, MAINTAIN ON %s FROM anon, authenticated, PUBLIC', r.rel);
  END LOOP;
END $$;

REVOKE UPDATE ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE USAGE  ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS fn
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'net' AND p.proname LIKE 'http%'
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'cannot revoke on %', r.fn;
    END;
  END LOOP;
END $$;

DO $do$
DECLARE src text; out text;
BEGIN
  src := pg_get_functiondef('public.selftest_refund_rail(text)'::regprocedure);
  out := replace(src, $a$  v_dtx uuid; v_dispute uuid;$a$, $b$  v_dtx uuid; v_dispute uuid;
  v_alt text; v_atx uuid; v_apay uuid; v_aref uuid;$b$);
  out := replace(out, $a$    SELECT id INTO v_buyer FROM public.profiles ORDER BY created_at LIMIT 1;$a$, $b$    IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
      RAISE EXCEPTION 'selftest_refund_rail: p_currency must be ISO-4217 alpha-3, got %', p_currency;
    END IF;
    v_alt := CASE WHEN p_currency = 'USD' THEN 'GHS' ELSE 'USD' END;
    SELECT id INTO v_buyer FROM public.profiles ORDER BY created_at LIMIT 1;$b$);
  out := replace(out, $a$        p_reason := 'selftest', p_notes := 'repeat') = v_refund);$a$, $b$        p_reason := 'selftest', p_notes := 'repeat') = v_refund);
    -- currency is DERIVED, not echoed. The snapshot check alone is
    -- tautological: the same argument seeds the snapshot and the assertion, so
    -- any string passes. This rail pins the snapshot to a currency the caller
    -- did NOT pass and requires the refund and ledger to follow the snapshot.
    INSERT INTO public.transactions(
      transaction_code, buyer_id, seller_id, created_by_user_id, status, money_status, share_token)
    VALUES ('SELFTESTCUR-' || substr(gen_random_uuid()::text, 1, 8), v_buyer, v_seller, v_seller,
      'awaiting_payment', 'payment_pending', gen_random_uuid()::text)
    RETURNING id INTO v_atx;
    INSERT INTO public.transaction_pricing(
      transaction_id, currency_code, item_amount, platform_fee_amount,
      payment_processing_fee_amount, seller_payout_amount, buyer_total_amount, pricing_model_version)
    VALUES (v_atx, v_alt, v_item, v_platform, v_processing, v_item, v_total, 'selftest');
    INSERT INTO public.escrow_states(transaction_id, state, held_amount)
    VALUES (v_atx, 'awaiting_payment', 0);
    INSERT INTO public.payments(
      transaction_id, provider, provider_reference, status, payment_method_type, currency_code, amount)
    VALUES (v_atx, 'paystack', 'selftest-cur-' || v_atx::text, 'pending', 'card', v_alt, v_total)
    RETURNING id INTO v_apay;
    PERFORM public.record_payment_capture_atomic(
      p_payment_id := v_apay, p_provider_event_id := 'selftest-cur-evt-' || v_atx::text, p_raw_payload := NULL);
    v_aref := public.start_refund_atomic(
      p_transaction_id := v_atx, p_amount := v_item, p_actor_user_id := v_buyer,
      p_reason := 'selftest', p_notes := 'currency derivation proof');
    SELECT currency_code INTO v_res FROM public.refunds WHERE id = v_aref;
    v_checks := v_checks || jsonb_build_object(
      'check', 'refund_currency_ignores_caller_argument',
      'pass', v_res = v_alt AND v_res IS DISTINCT FROM p_currency, 'detail', v_res);
    v_checks := v_checks || jsonb_build_object(
      'check', 'ledger_currency_follows_snapshot',
      'pass', (SELECT bool_and(currency_code = v_alt) FROM public.escrow_ledger_entries
                WHERE transaction_id = v_atx), 'detail', v_alt);$b$);
  IF out = src THEN RAISE EXCEPTION 'selftest_refund_rail rewrite matched nothing'; END IF;
  EXECUTE out;
END $do$;