-- Admin scale P1: daily activity RPC + trigram search RPC
CREATE OR REPLACE FUNCTION public.admin_daily_activity_counts(_days int)
RETURNS TABLE(bucket_date date, tx_count bigint, dispute_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH days AS (
    SELECT (current_date - i)::date AS d
    FROM generate_series(0, GREATEST(COALESCE(_days,7),1) - 1) AS i
  ),
  tx AS (
    SELECT (created_at AT TIME ZONE 'UTC')::date AS d, count(*) AS c
    FROM public.transactions
    WHERE created_at >= (current_date - (GREATEST(COALESCE(_days,7),1) - 1))
    GROUP BY 1
  ),
  dp AS (
    SELECT (created_at AT TIME ZONE 'UTC')::date AS d, count(*) AS c
    FROM public.disputes
    WHERE created_at >= (current_date - (GREATEST(COALESCE(_days,7),1) - 1))
    GROUP BY 1
  )
  SELECT days.d, COALESCE(tx.c,0), COALESCE(dp.c,0)
  FROM days
  LEFT JOIN tx ON tx.d = days.d
  LEFT JOIN dp ON dp.d = days.d
  ORDER BY days.d;
$$;
REVOKE ALL ON FUNCTION public.admin_daily_activity_counts(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_daily_activity_counts(int) TO authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_transactions_code_trgm      ON public.transactions      USING gin (transaction_code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_transaction_items_title_trgm ON public.transaction_items USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_trgm     ON public.profiles          USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm         ON public.profiles          USING gin (email gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.admin_search_transaction_ids(_query text, _limit int DEFAULT 500)
RETURNS TABLE(transaction_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH q AS (SELECT LOWER(TRIM(COALESCE(_query,''))) AS s),
  by_code AS (
    SELECT id AS tx FROM public.transactions, q
    WHERE q.s <> '' AND transaction_code ILIKE '%' || q.s || '%'
    LIMIT _limit
  ),
  by_item AS (
    SELECT ti.transaction_id AS tx FROM public.transaction_items ti, q
    WHERE q.s <> '' AND ti.title ILIKE '%' || q.s || '%'
    LIMIT _limit
  ),
  parties AS (
    SELECT id FROM public.profiles, q
    WHERE q.s <> '' AND (
      full_name ILIKE '%' || q.s || '%'
      OR email    ILIKE '%' || q.s || '%'
      OR (regexp_replace(q.s, '\D', '', 'g') <> ''
          AND phone ILIKE '%' || regexp_replace(q.s, '\D', '', 'g') || '%')
    )
    LIMIT _limit
  ),
  by_party AS (
    SELECT t.id AS tx FROM public.transactions t
    JOIN parties p ON t.buyer_id = p.id OR t.seller_id = p.id
    LIMIT _limit
  )
  SELECT DISTINCT tx FROM (
    SELECT tx FROM by_code
    UNION SELECT tx FROM by_item
    UNION SELECT tx FROM by_party
  ) all_ids
  LIMIT _limit;
$$;
REVOKE ALL ON FUNCTION public.admin_search_transaction_ids(text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_transaction_ids(text,int) TO authenticated, service_role;