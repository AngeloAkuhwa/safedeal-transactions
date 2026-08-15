-- Region eligibility becomes derived, not stored.
--
-- `is_user_region_allowed` read a boolean copied onto `profiles`:
--
--   SELECT COALESCE((SELECT is_region_eligible FROM public.profiles ...), false)
--
-- A snapshot has one failure mode that matters: it goes stale. Adding a city
-- to `serviceable_regions` would leave every user already living there
-- ineligible until something re-ran the calculation over them. The
-- `buyer-profile` edge function recomputes it on profile update, so the answer
-- also depended on whether a user had edited their profile recently — two
-- sources for one fact, free to disagree.
--
-- The list of places we serve is `serviceable_regions`. Read it directly and
-- the staleness cannot exist: opening a city is one INSERT, and everyone in it
-- is eligible on the next call.
--
-- Deliberately unchanged:
--   * the signature, so no caller moves;
--   * the fail-closed default — no matching active region means false, exactly
--     as a missing profile did before;
--   * `profiles.is_region_eligible`, which stays as a display/cache column so
--     this is reversible. It is no longer the source of truth. Nothing reads
--     it for an authorization decision after this migration.

BEGIN;

-- The rule itself, addressable on its own. Checkout needs to ask "is this
-- delivery address serviceable?" about an address the buyer just typed, which
-- has no profile row to read.
CREATE OR REPLACE FUNCTION public.is_region_serviceable(
  _country_code text,
  _state_name   text,
  _city_name    text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.serviceable_regions r
     WHERE r.is_active
       AND lower(r.country_code) = lower(COALESCE(_country_code, ''))
       AND lower(r.state_name)   = lower(COALESCE(_state_name, ''))
       AND lower(r.city_name)    = lower(COALESCE(_city_name, ''))
  )
$$;

COMMENT ON FUNCTION public.is_region_serviceable(text, text, text) IS
  'Serviceability of a place, derived from serviceable_regions. Fails closed on '
  'NULL or no active match. Use for a delivery address at checkout; use '
  'is_user_region_allowed for a signed-in user.';

-- Same signature, same fail-closed behaviour, derived answer.
CREATE OR REPLACE FUNCTION public.is_user_region_allowed(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT public.is_region_serviceable(p.country_code, p.state_name, p.city_name)
        FROM public.profiles p
       WHERE p.id = _user_id
    ),
    false
  )
$$;

COMMENT ON FUNCTION public.is_user_region_allowed(uuid) IS
  'Derived from the user profile''s country/state/city against '
  'serviceable_regions. Does NOT read profiles.is_region_eligible, which is a '
  'display cache only. Fails closed.';

-- Bring the cache column in line so the UI and the gate agree immediately
-- rather than at each user''s next profile edit.
UPDATE public.profiles p
   SET is_region_eligible = public.is_region_serviceable(p.country_code, p.state_name, p.city_name)
 WHERE p.is_region_eligible
       IS DISTINCT FROM public.is_region_serviceable(p.country_code, p.state_name, p.city_name);

-- anon has no business asking; signed-in callers and definer functions do.
REVOKE ALL ON FUNCTION public.is_region_serviceable(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_region_serviceable(text, text, text) TO authenticated, service_role;

COMMIT;
