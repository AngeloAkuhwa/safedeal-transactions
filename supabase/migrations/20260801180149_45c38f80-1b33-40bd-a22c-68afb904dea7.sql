-- ============================================================
-- Correction 2 / CP2B: registry, frozen mapping, generator
-- No public.profiles row is modified in this migration.
-- ============================================================

-- 1. Tombstone registry: append-only, superset of every ID ever issued.
CREATE TABLE IF NOT EXISTS public.public_user_id_registry (
  public_user_id    text PRIMARY KEY,
  first_assigned_at timestamptz NOT NULL DEFAULT now(),
  retired_at        timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.public_user_id_registry TO service_role;
ALTER TABLE public.public_user_id_registry ENABLE ROW LEVEL SECURITY;
-- No permissive policy: reachable only via service_role / SECURITY DEFINER code.

-- Never delete a tombstone row.
CREATE OR REPLACE FUNCTION public.prevent_public_user_id_registry_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'public_user_id_registry rows are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_public_user_id_registry_no_delete ON public.public_user_id_registry;
CREATE TRIGGER trg_public_user_id_registry_no_delete
  BEFORE DELETE ON public.public_user_id_registry
  FOR EACH ROW EXECUTE FUNCTION public.prevent_public_user_id_registry_delete();

-- 2. Collision-safe generator. Owner postgres, SECURITY DEFINER, fixed search_path.
--    Registry is the authoritative uniqueness oracle: every returned value is
--    recorded there atomically, so an ID is never reused after a hard delete.
CREATE OR REPLACE FUNCTION public.generate_public_user_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet  text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; -- Crockford, no I L O U
  candidate text;
  suffix    text;
  i         int;
  attempts  int := 0;
BEGIN
  LOOP
    attempts := attempts + 1;
    suffix := '';
    FOR i IN 1..10 LOOP
      suffix := suffix || substr(alphabet, floor(random() * 32)::int + 1, 1);
    END LOOP;
    candidate := 'USR-' || suffix;

    BEGIN
      INSERT INTO public.public_user_id_registry (public_user_id) VALUES (candidate);
      RETURN candidate;
    EXCEPTION WHEN unique_violation THEN
      NULL; -- collision, retry
    END;

    IF attempts >= 10 THEN
      RAISE EXCEPTION 'Could not generate a unique public_user_id after 10 attempts';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_public_user_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_public_user_id() TO service_role;

-- 3. Frozen mapping table (dropped after CP8 sign-off).
CREATE TABLE IF NOT EXISTS public.public_user_id_mapping (
  user_id        uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  public_user_id text NOT NULL UNIQUE REFERENCES public.public_user_id_registry(public_user_id),
  generated_at   timestamptz NOT NULL DEFAULT now(),
  frozen         boolean NOT NULL DEFAULT true
);

GRANT SELECT, INSERT ON public.public_user_id_mapping TO service_role;
ALTER TABLE public.public_user_id_mapping ENABLE ROW LEVEL SECURITY;
-- No permissive policy.

-- 4. Populate the mapping: exactly one generated ID per existing profile.
INSERT INTO public.public_user_id_mapping (user_id, public_user_id)
SELECT p.id, public.generate_public_user_id()
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.public_user_id_mapping m WHERE m.user_id = p.id
);

-- 5. Fail closed if the mapping does not cover every profile exactly once.
DO $$
DECLARE
  n_profiles int;
  n_mapping  int;
  n_distinct int;
BEGIN
  SELECT count(*) INTO n_profiles FROM public.profiles;
  SELECT count(*), count(DISTINCT public_user_id) INTO n_mapping, n_distinct
  FROM public.public_user_id_mapping;

  IF n_mapping <> n_profiles OR n_distinct <> n_mapping THEN
    RAISE EXCEPTION 'CP2B mapping invalid: profiles=% mapping=% distinct=%',
      n_profiles, n_mapping, n_distinct;
  END IF;
END;
$$;