
-- 1. Widen status CHECK
ALTER TABLE public.internal_users DROP CONSTRAINT IF EXISTS internal_users_status_check;
ALTER TABLE public.internal_users ADD CONSTRAINT internal_users_status_check
  CHECK (status = ANY (ARRAY['active','suspended','pending','pending_approval','invited','locked','deactivated']));

-- 2. Profile columns
ALTER TABLE public.internal_users
  ADD COLUMN IF NOT EXISTS first_name           text,
  ADD COLUMN IF NOT EXISTS last_name            text,
  ADD COLUMN IF NOT EXISTS team                 text,
  ADD COLUMN IF NOT EXISTS job_title            text,
  ADD COLUMN IF NOT EXISTS reporting_manager_id uuid REFERENCES public.internal_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_expires_at    timestamptz,
  ADD COLUMN IF NOT EXISTS reason_for_access    text,
  ADD COLUMN IF NOT EXISTS invitation_status    text NOT NULL DEFAULT 'not_invited'
    CHECK (invitation_status IN ('not_invited','sent','accepted','expired','revoked')),
  ADD COLUMN IF NOT EXISTS employee_id          text;

-- 3. Employee ID generator: SD-EMP-<YYYY>-<6-char Crockford base32>
CREATE OR REPLACE FUNCTION public.generate_employee_id()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  alphabet   text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; -- Crockford, no I L O U
  candidate  text;
  suffix     text;
  i          int;
  attempts   int := 0;
  exists_row boolean;
BEGIN
  LOOP
    attempts := attempts + 1;
    suffix := '';
    FOR i IN 1..6 LOOP
      suffix := suffix || substr(alphabet, floor(random() * 32)::int + 1, 1);
    END LOOP;
    candidate := 'SD-EMP-' || to_char(now(), 'YYYY') || '-' || suffix;

    SELECT EXISTS (
      SELECT 1 FROM public.internal_users WHERE employee_id = candidate
    ) INTO exists_row;

    IF NOT exists_row THEN
      RETURN candidate;
    END IF;

    IF attempts >= 5 THEN
      RAISE EXCEPTION 'Could not generate a unique employee_id after 5 attempts';
    END IF;
  END LOOP;
END;
$$;

-- 4. Backfill + UNIQUE + DEFAULT + NOT NULL
UPDATE public.internal_users
SET employee_id = public.generate_employee_id()
WHERE employee_id IS NULL;

ALTER TABLE public.internal_users
  ALTER COLUMN employee_id SET DEFAULT public.generate_employee_id(),
  ALTER COLUMN employee_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS internal_users_employee_id_key
  ON public.internal_users (employee_id);

-- 5. Immutability trigger
CREATE OR REPLACE FUNCTION public.internal_users_lock_employee_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  guard text;
BEGIN
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    BEGIN
      guard := current_setting('app.allow_employee_id_change', true);
    EXCEPTION WHEN OTHERS THEN
      guard := NULL;
    END;
    IF guard IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'employee_id is immutable and cannot be modified directly';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_users_lock_employee_id_trg ON public.internal_users;
CREATE TRIGGER internal_users_lock_employee_id_trg
BEFORE UPDATE ON public.internal_users
FOR EACH ROW EXECUTE FUNCTION public.internal_users_lock_employee_id();

-- 6. Reporting-manager lookup index
CREATE INDEX IF NOT EXISTS internal_users_reporting_manager_idx
  ON public.internal_users (reporting_manager_id);
