-- ============================================================
-- Correction 2 / CP3: additive column, triggers, backfill, constraints
-- Runs as one transaction. Fails closed on any drift.
-- ============================================================

-- 1. Block concurrent INSERT/UPDATE/DELETE on profiles while still allowing reads.
LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;

-- 2/3. Drift gate: profile population must be identical to the CP2B freeze.
DO $$
DECLARE
  v_checksum text;
BEGIN
  SELECT md5(string_agg(id::text, ',' ORDER BY id::text)) INTO v_checksum FROM public.profiles;
  IF v_checksum IS DISTINCT FROM '2a1be4cc28489c870a35fc3408515718' THEN
    RAISE EXCEPTION 'CP3 aborted: profiles drifted since CP2B freeze (found %). Return to CP2B.', v_checksum;
  END IF;
END;
$$;

-- 4. Additive objects.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_user_id text;

-- Assignment trigger: server-side only, ignores any client-supplied value.
CREATE OR REPLACE FUNCTION public.profiles_assign_public_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.public_user_id := public.generate_public_user_id();
  RETURN NEW;
END;
$$;

-- Immutability trigger.
CREATE OR REPLACE FUNCTION public.profiles_lock_public_user_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.public_user_id IS DISTINCT FROM OLD.public_user_id THEN
    RAISE EXCEPTION 'public_user_id is immutable and cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

-- Tombstone on hard delete: retire, never remove.
CREATE OR REPLACE FUNCTION public.profiles_retire_public_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.public_user_id IS NOT NULL THEN
    UPDATE public.public_user_id_registry
       SET retired_at = COALESCE(retired_at, now())
     WHERE public_user_id = OLD.public_user_id;
  END IF;
  RETURN OLD;
END;
$$;

-- 5. Install triggers BEFORE the backfill so any post-commit insert is covered.
DROP TRIGGER IF EXISTS trg_profiles_assign_public_user_id ON public.profiles;
CREATE TRIGGER trg_profiles_assign_public_user_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_assign_public_user_id();

DROP TRIGGER IF EXISTS trg_profiles_lock_public_user_id ON public.profiles;
CREATE TRIGGER trg_profiles_lock_public_user_id
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_lock_public_user_id();

DROP TRIGGER IF EXISTS trg_profiles_retire_public_user_id ON public.profiles;
CREATE TRIGGER trg_profiles_retire_public_user_id
  AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_retire_public_user_id();

-- 6. Backfill strictly from the frozen mapping.
--    The immutability trigger allows NULL -> value (OLD is NULL), so disable it
--    only for this statement to keep the intent explicit and safe.
ALTER TABLE public.profiles DISABLE TRIGGER trg_profiles_lock_public_user_id;

UPDATE public.profiles p
   SET public_user_id = m.public_user_id
  FROM public.public_user_id_mapping m
 WHERE m.user_id = p.id
   AND p.public_user_id IS NULL;

ALTER TABLE public.profiles ENABLE TRIGGER trg_profiles_lock_public_user_id;

-- 7. Post-backfill verification inside the same transaction.
DO $$
DECLARE
  v_map_checksum  text;
  v_uuid_checksum text;
  v_nulls int;
  v_dupes int;
BEGIN
  SELECT md5(string_agg(id::text || ':' || public_user_id, ',' ORDER BY id::text))
    INTO v_map_checksum FROM public.profiles;
  SELECT md5(string_agg(id::text, ',' ORDER BY id::text))
    INTO v_uuid_checksum FROM public.profiles;
  SELECT count(*) INTO v_nulls FROM public.profiles WHERE public_user_id IS NULL;
  SELECT count(*) INTO v_dupes FROM (
    SELECT public_user_id FROM public.profiles GROUP BY 1 HAVING count(*) > 1
  ) d;

  IF v_uuid_checksum IS DISTINCT FROM '2a1be4cc28489c870a35fc3408515718' THEN
    RAISE EXCEPTION 'CP3 aborted: UUID checksum changed (%)', v_uuid_checksum;
  END IF;
  IF v_map_checksum IS DISTINCT FROM '56407fc5b4bbb6cf49da5031e57c9ced' THEN
    RAISE EXCEPTION 'CP3 aborted: mapping checksum mismatch (%)', v_map_checksum;
  END IF;
  IF v_nulls <> 0 OR v_dupes <> 0 THEN
    RAISE EXCEPTION 'CP3 aborted: nulls=% duplicates=%', v_nulls, v_dupes;
  END IF;
END;
$$;

-- 8. Constraints last.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_public_user_id_format
  CHECK (public_user_id ~ '^USR-[0-9A-HJKMNP-TV-Z]{10}$');

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_public_user_id_key UNIQUE (public_user_id);

ALTER TABLE public.profiles
  ALTER COLUMN public_user_id SET NOT NULL;