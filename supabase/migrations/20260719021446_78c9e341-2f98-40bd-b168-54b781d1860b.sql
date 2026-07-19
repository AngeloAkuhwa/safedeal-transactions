
CREATE OR REPLACE FUNCTION public.admin_duplicate_ledger_entries(_since timestamptz)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(dup_count - 1), 0)::bigint FROM (
    SELECT COUNT(*) AS dup_count
    FROM public.escrow_ledger_entries e
    WHERE e.created_at >= _since
      AND e.reference_type IS NOT NULL
      AND e.reference_id IS NOT NULL
    GROUP BY e.transaction_id, e.reference_type, e.reference_id, e.entry_type
    HAVING COUNT(*) > 1
  ) g
$$;

CREATE OR REPLACE FUNCTION public.admin_orphan_completed_payouts(_since timestamptz)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM public.payouts p
  WHERE p.status = 'completed'
    AND p.completed_at >= _since
    AND NOT EXISTS (
      SELECT 1 FROM public.escrow_ledger_entries e
      WHERE e.transaction_id = p.transaction_id
        AND e.entry_type = 'payout_debit'::escrow_ledger_entry_type
    )
$$;

GRANT EXECUTE ON FUNCTION public.admin_duplicate_ledger_entries(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_orphan_completed_payouts(timestamptz) TO service_role;
