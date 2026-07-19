
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS search_tsv tsvector;

CREATE OR REPLACE FUNCTION public.compute_transaction_search_tsv(_tx_id uuid)
RETURNS tsvector
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT transaction_code, buyer_id, seller_id, buyer_contact_email, buyer_contact_phone
    FROM public.transactions WHERE id = _tx_id
  ),
  items AS (
    SELECT string_agg(coalesce(title,'') || ' ' || coalesce(condition_label::text,''), ' ') AS s
    FROM public.transaction_items WHERE transaction_id = _tx_id
  ),
  parties AS (
    SELECT string_agg(
      coalesce(p.full_name,'') || ' ' || coalesce(p.email,'') || ' ' || coalesce(p.phone,''),
      ' '
    ) AS s
    FROM public.profiles p, t
    WHERE p.id = t.buyer_id OR p.id = t.seller_id
  )
  SELECT
    setweight(to_tsvector('simple', coalesce((SELECT transaction_code FROM t),'')), 'A')
    || setweight(to_tsvector('simple', coalesce((SELECT s FROM items),'')), 'B')
    || setweight(to_tsvector('simple', coalesce((SELECT s FROM parties),'')), 'B')
    || setweight(to_tsvector('simple',
         coalesce((SELECT buyer_contact_email FROM t),'') || ' ' ||
         coalesce((SELECT buyer_contact_phone FROM t),'')
       ), 'C');
$$;

CREATE OR REPLACE FUNCTION public.transactions_search_tsv_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN NEW.search_tsv := public.compute_transaction_search_tsv(NEW.id); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_transactions_search_tsv ON public.transactions;
CREATE TRIGGER trg_transactions_search_tsv
  BEFORE INSERT OR UPDATE OF transaction_code, buyer_id, seller_id, buyer_contact_email, buyer_contact_phone
  ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.transactions_search_tsv_trigger();

CREATE OR REPLACE FUNCTION public.transaction_items_sync_tsv()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _tx uuid;
BEGIN
  _tx := COALESCE(NEW.transaction_id, OLD.transaction_id);
  IF _tx IS NOT NULL THEN
    UPDATE public.transactions SET search_tsv = public.compute_transaction_search_tsv(_tx) WHERE id = _tx;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_transaction_items_sync_tsv ON public.transaction_items;
CREATE TRIGGER trg_transaction_items_sync_tsv
  AFTER INSERT OR UPDATE OF title, condition_label OR DELETE
  ON public.transaction_items FOR EACH ROW EXECUTE FUNCTION public.transaction_items_sync_tsv();

CREATE OR REPLACE FUNCTION public.profiles_sync_tx_tsv()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.email  IS DISTINCT FROM OLD.email
     OR NEW.phone  IS DISTINCT FROM OLD.phone THEN
    UPDATE public.transactions t SET search_tsv = public.compute_transaction_search_tsv(t.id)
      WHERE t.buyer_id = NEW.id OR t.seller_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_profiles_sync_tx_tsv ON public.profiles;
CREATE TRIGGER trg_profiles_sync_tx_tsv
  AFTER UPDATE OF full_name, email, phone
  ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_tx_tsv();

UPDATE public.transactions t
  SET search_tsv = public.compute_transaction_search_tsv(t.id)
  WHERE search_tsv IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_search_tsv
  ON public.transactions USING GIN (search_tsv);

CREATE OR REPLACE FUNCTION public.admin_search_transaction_ids(_query text, _limit integer DEFAULT 500)
RETURNS TABLE(transaction_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _q text := TRIM(COALESCE(_query, ''));
  _tsq tsquery;
  _rows integer := 0;
BEGIN
  IF _q = '' THEN RETURN; END IF;

  BEGIN
    _tsq := websearch_to_tsquery('simple', _q);
  EXCEPTION WHEN OTHERS THEN
    _tsq := NULL;
  END;

  IF _tsq IS NOT NULL AND _tsq::text <> '' THEN
    RETURN QUERY
      SELECT t.id
      FROM public.transactions t
      WHERE t.search_tsv @@ _tsq
      ORDER BY ts_rank_cd(t.search_tsv, _tsq) DESC, t.created_at DESC
      LIMIT _limit;
    GET DIAGNOSTICS _rows = ROW_COUNT;
    IF _rows > 0 THEN RETURN; END IF;
  END IF;

  RETURN QUERY
    SELECT DISTINCT tx FROM (
      (SELECT id AS tx FROM public.transactions
        WHERE transaction_code ILIKE '%' || _q || '%' LIMIT _limit)
      UNION
      (SELECT ti.transaction_id FROM public.transaction_items ti
        WHERE ti.title ILIKE '%' || _q || '%' LIMIT _limit)
      UNION
      (SELECT t2.id FROM public.transactions t2
        JOIN public.profiles p ON p.id = t2.buyer_id OR p.id = t2.seller_id
        WHERE p.full_name ILIKE '%' || _q || '%'
           OR p.email     ILIKE '%' || _q || '%'
           OR p.phone     ILIKE '%' || _q || '%'
        LIMIT _limit)
    ) u
    LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_search_transaction_ids(text, integer) TO service_role;
