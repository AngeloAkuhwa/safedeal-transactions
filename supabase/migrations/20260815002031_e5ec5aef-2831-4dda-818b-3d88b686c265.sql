-- EXECUTE was still reachable by anon through the default PUBLIC grant, so a
-- REVOKE naming only anon was a no-op.
REVOKE ALL ON FUNCTION public.is_transaction_party(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_transaction_party(uuid, uuid) TO authenticated, service_role, postgres;