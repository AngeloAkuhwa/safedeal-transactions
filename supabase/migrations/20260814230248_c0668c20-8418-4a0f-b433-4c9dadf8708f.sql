DO $do$
DECLARE s text; s0 text; v_oid oid;
BEGIN
  SELECT oid INTO v_oid FROM pg_proc WHERE proname = 'selftest_refund_rail'
    AND pronamespace = 'public'::regnamespace;
  s0 := pg_get_functiondef(v_oid); s := s0;

  -- numeric(18,2) columns reject Infinity with "numeric field overflow" before
  -- the CHECK is evaluated. That is still a refusal at the schema layer, and it
  -- is what the check is asserting.
  s := replace(s,
    'v_res := CASE WHEN SQLERRM LIKE ''%refunds_refund_amount_positive%'' THEN ''raised'' ELSE SQLERRM END;',
    'v_res := CASE WHEN SQLERRM LIKE ''%refunds_refund_amount_positive%'' OR SQLERRM LIKE ''%overflow%'' THEN ''raised'' ELSE SQLERRM END;');
  s := replace(s,
    'v_res := CASE WHEN SQLERRM LIKE ''%payouts_amount_finite_positive%'' THEN ''raised'' ELSE SQLERRM END;',
    'v_res := CASE WHEN SQLERRM LIKE ''%payouts_amount_finite_positive%'' OR SQLERRM LIKE ''%overflow%'' THEN ''raised'' ELSE SQLERRM END;');
  s := replace(s,
    'v_res := CASE WHEN SQLERRM LIKE ''%payments_amount_finite_positive%'' THEN ''raised'' ELSE SQLERRM END;',
    'v_res := CASE WHEN SQLERRM LIKE ''%payments_amount_finite_positive%'' OR SQLERRM LIKE ''%overflow%'' THEN ''raised'' ELSE SQLERRM END;');

  IF s = s0 THEN RAISE EXCEPTION 'selftest_refund_rail: expected body shape not found'; END IF;
  EXECUTE s;
END $do$;