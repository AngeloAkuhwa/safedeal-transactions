DO $$
DECLARE
  v_secret text;
  v_ok boolean;
  v_bad boolean;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'reconcile_escrow_cron_secret' LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'selftest_failed: cron secret not configured';
  END IF;

  v_ok  := public.verify_reconcile_cron_secret(v_secret);
  v_bad := public.verify_reconcile_cron_secret(v_secret || 'tampered');

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'selftest_failed: valid scheduler secret was rejected';
  END IF;
  IF v_bad IS NOT FALSE THEN
    RAISE EXCEPTION 'selftest_failed: tampered scheduler secret was accepted';
  END IF;

  RAISE NOTICE 'selftest_passed: scheduler secret verification is working';
END;
$$;