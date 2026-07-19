
REVOKE EXECUTE ON FUNCTION public.compute_transaction_search_tsv(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_search_transaction_ids(text, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.compute_transaction_search_tsv(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_search_transaction_ids(text, integer) TO service_role;
