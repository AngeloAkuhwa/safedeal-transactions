-- P1 scale: trigram indexes so admin_search_transaction_ids uses index scans
-- instead of sequential ILIKE scans as tables grow to millions of rows.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- transactions.transaction_code
CREATE INDEX IF NOT EXISTS idx_transactions_code_trgm
  ON public.transactions USING GIN (transaction_code gin_trgm_ops);

-- transaction_items.title
CREATE INDEX IF NOT EXISTS idx_transaction_items_title_trgm
  ON public.transaction_items USING GIN (title gin_trgm_ops);

-- profiles: name / email / phone
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_trgm
  ON public.profiles USING GIN (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm
  ON public.profiles USING GIN (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_phone_trgm
  ON public.profiles USING GIN (phone gin_trgm_ops);

-- Support the by_party join back to transactions from a set of party ids.
CREATE INDEX IF NOT EXISTS idx_transactions_buyer_id
  ON public.transactions (buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller_id
  ON public.transactions (seller_id);

-- Refresh the search RPC so tiny hit-caps don't silently drop matches
-- once the trigram indexes make broad scans cheap. We keep a single
-- overall cap (_limit) and let each source contribute up to that cap.
CREATE OR REPLACE FUNCTION public.admin_search_transaction_ids(
  _query text,
  _limit integer DEFAULT 500
)
RETURNS TABLE(transaction_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT LOWER(TRIM(COALESCE(_query, ''))) AS s,
           regexp_replace(COALESCE(_query, ''), '\D', '', 'g') AS digits
  ),
  by_code AS (
    SELECT id AS tx
    FROM public.transactions, q
    WHERE q.s <> '' AND transaction_code ILIKE '%' || q.s || '%'
    LIMIT _limit
  ),
  by_item AS (
    SELECT ti.transaction_id AS tx
    FROM public.transaction_items ti, q
    WHERE q.s <> '' AND ti.title ILIKE '%' || q.s || '%'
    LIMIT _limit
  ),
  parties AS (
    SELECT p.id
    FROM public.profiles p, q
    WHERE q.s <> '' AND (
      p.full_name ILIKE '%' || q.s || '%'
      OR p.email  ILIKE '%' || q.s || '%'
      OR (q.digits <> '' AND p.phone ILIKE '%' || q.digits || '%')
    )
    LIMIT _limit
  ),
  by_party AS (
    SELECT t.id AS tx
    FROM public.transactions t
    JOIN parties p ON t.buyer_id = p.id OR t.seller_id = p.id
    LIMIT _limit
  )
  SELECT DISTINCT tx
  FROM (
    SELECT tx FROM by_code
    UNION SELECT tx FROM by_item
    UNION SELECT tx FROM by_party
  ) all_ids
  LIMIT _limit;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_search_transaction_ids(text, integer) TO authenticated, service_role;