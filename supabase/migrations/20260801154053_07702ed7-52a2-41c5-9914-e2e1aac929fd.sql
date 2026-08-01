CREATE OR REPLACE FUNCTION public.canonical_payload_v1(p jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE k text; v jsonb; parts text[] := '{}'; t text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'canonical_payload_v1_requires_object';
  END IF;
  FOR k IN SELECT key FROM jsonb_object_keys(p) AS key ORDER BY key COLLATE "C" LOOP
    v := p -> k;
    t := jsonb_typeof(v);
    IF t = 'object' OR t = 'array' THEN
      RAISE EXCEPTION 'canonical_payload_v1_nested_not_allowed:%', k;
    ELSIF t = 'null' THEN
      parts := parts || (k || '=' || chr(1));
    ELSIF t = 'number' THEN
      IF (v #>> '{}') !~ '^-?[0-9]+$' THEN
        RAISE EXCEPTION 'canonical_payload_v1_non_integer_number:%', k;
      END IF;
      parts := parts || (k || '=' || (v #>> '{}'));
    ELSIF t = 'boolean' THEN
      parts := parts || (k || '=' || (v #>> '{}'));
    ELSE
      parts := parts || (k || '=' || normalize((v #>> '{}'), NFC));
    END IF;
  END LOOP;
  RETURN array_to_string(parts, E'\n');
END;
$$;