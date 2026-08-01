REVOKE ALL ON TABLE public.public_user_id_mapping FROM service_role;
GRANT SELECT, INSERT ON TABLE public.public_user_id_mapping TO service_role;